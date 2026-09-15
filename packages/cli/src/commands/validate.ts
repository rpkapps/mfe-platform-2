import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { pathToFileURL } from "node:url"

import ts from "typescript"
import {
  DOCS_BASE_URL,
  ERROR_CODES,
  inferRoutePrefix,
  isSensitiveKey,
  isValidMfeId,
  isValidRoutePrefix,
  validateManifest,
  type PlatformErrorCode,
} from "@platform-internal/core"

import { CLI_ERROR_CODES, type CliErrorCode } from "../errors"
import { checkMfeConfig, readStaticMfeConfig } from "../mfe-config"
import {
  allDependencies,
  readIdentity,
  readPackageJson,
  requireProjectRoot,
  resolveMfeId,
  resolveProjectModule,
  type PackageJson,
} from "../project"
import { readManifest } from "./manifest"

export type FindingLevel = "error" | "warning" | "info"

export interface Finding {
  level: FindingLevel
  /** A runtime `ERROR_CODES` key or a CLI code. */
  code: PlatformErrorCode | CliErrorCode
  check: string
  message: string
  source?: string
  override?: string
  hint?: string
  docsUrl: string
}

export interface ValidateOptions {
  cwd?: string
  /** Skip the manifest generation step (used by tests without @platform/vite). */
  manifest?: boolean
  log?: (message: string) => void
}

export interface ValidateResult {
  ok: boolean
  root: string
  mfeId: string
  findings: Finding[]
  checks: string[]
}

const DOCS: Record<string, string> = {
  "package.json": "/cli#validate",
  bootstrap: "/mfe-bootstrap",
  routes: "/routing",
  identity: "/manifests#mfe-id",
  config: "/configuration",
  routeTree: "/routing#generated-route-tree",
  manifest: "/manifests#validation",
  env: "/runtime-configuration#environment",
  prefix: "/route-prefixes",
  lint: "/linting",
}

function docsFor(code: PlatformErrorCode | CliErrorCode, check: string): string {
  if (code in ERROR_CODES)
    return `${DOCS_BASE_URL}${ERROR_CODES[code as PlatformErrorCode].docs}`
  if (code in CLI_ERROR_CODES)
    return `${DOCS_BASE_URL}${DOCS[check] ?? CLI_ERROR_CODES[code as CliErrorCode].docs}`
  return `${DOCS_BASE_URL}${DOCS[check] ?? "/cli#validate"}`
}

function hintFor(code: PlatformErrorCode | CliErrorCode): string | undefined {
  if (code in ERROR_CODES) return ERROR_CODES[code as PlatformErrorCode].hint
  if (code in CLI_ERROR_CODES) return CLI_ERROR_CODES[code as CliErrorCode].hint
  return undefined
}

export function formatFinding(finding: Finding): string {
  const lines = [
    `${finding.level === "error" ? "✖" : finding.level === "warning" ? "▲" : "ℹ"} [platform:${finding.code}] ${finding.message}`,
  ]
  if (finding.source) lines.push(`    source: ${finding.source}`)
  if (finding.override) lines.push(`    override: ${finding.override}`)
  if (finding.hint) lines.push(`    hint: ${finding.hint}`)
  lines.push(`    docs: ${finding.docsUrl}`)
  return lines.join("\n")
}

class Findings {
  readonly items: Finding[] = []
  constructor(private readonly root: string) {}
  add(
    level: FindingLevel,
    check: string,
    code: PlatformErrorCode | CliErrorCode,
    message: string,
    extra: { source?: string; override?: string } = {}
  ): void {
    this.items.push({
      level,
      code,
      check,
      message,
      source: extra.source
        ? relative(this.root, extra.source).replace(/\\/g, "/") || extra.source
        : undefined,
      override: extra.override,
      hint: hintFor(code),
      docsUrl: docsFor(code, check),
    })
  }
}

/** True when the default export is `createMfe(...)`, a wrapper around it, or a binding initialised with it. */
export function defaultExportsCreateMfe(text: string, fileName = "mfe.tsx"): boolean {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const initialisers = new Map<string, ts.Expression>()
  let exported: ts.Expression | null = null
  const unwrap = (node: ts.Expression): ts.Expression => {
    let current = node
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression
    return current
  }
  const isCreateMfeCall = (node: ts.Expression, depth = 0): boolean => {
    const expression = unwrap(node)
    if (ts.isCallExpression(expression)) {
      const callee = expression.expression
      if (ts.isIdentifier(callee) && callee.text === "createMfe") return true
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "createMfe") return true
      // wrapper such as withTecton(createMfe(...)) or createMfe(...).use(...)
      if (
        depth < 3 &&
        expression.arguments.some((argument) => isCreateMfeCall(argument, depth + 1))
      )
        return true
      if (
        depth < 3 &&
        ts.isPropertyAccessExpression(callee) &&
        isCreateMfeCall(callee.expression, depth + 1)
      )
        return true
    }
    if (ts.isIdentifier(expression)) {
      const initialiser = initialisers.get(expression.text)
      return depth < 3 && initialiser !== undefined && isCreateMfeCall(initialiser, depth + 1)
    }
    return false
  }
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer)
          initialisers.set(declaration.name.text, declaration.initializer)
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals)
      exported = statement.expression
  }
  return exported !== null && isCreateMfeCall(exported)
}

const GENERATED_BANNER_RE =
  /prettier-ignore-start|@ts-nocheck|generated by|noformat|eslint-disable/i

export function hasGeneratedBanner(text: string): boolean {
  return GENERATED_BANNER_RE.test(text.split(/\r?\n/).slice(0, 5).join("\n"))
}

function normaliseGenerated(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim()
}

interface RouterGeneratorModule {
  Generator: new (options: { config: unknown; root: string }) => { run(): Promise<void> }
  getConfig(inline: Record<string, unknown>, configDirectory?: string): unknown
}

/** Regenerate the route tree in a temporary copy of `src/routes` with the project's own router generator, if installed. */
export async function regenerateRouteTree(root: string): Promise<string | null> {
  const resolved = resolveProjectModule(root, "@tanstack/router-generator")
  if (!resolved) return null
  const routes = join(root, "src", "routes")
  if (!existsSync(routes)) return null
  const mod = (await import(pathToFileURL(resolved).href)) as RouterGeneratorModule
  const work = mkdtempSync(join(tmpdir(), "platform-validate-"))
  try {
    // Import paths in the generated file are relative to its location, so mirror the layout.
    const routesDirectory = join(work, "src", "routes")
    cpSync(routes, routesDirectory, { recursive: true })
    const generatedRouteTree = join(work, "src", "routeTree.gen.ts")
    const config = mod.getConfig(
      {
        target: "react",
        autoCodeSplitting: true,
        routesDirectory,
        generatedRouteTree,
        // The generator writes each file to a temporary path and renames it into
        // place. Its default temporary directory is `.tanstack/tmp` resolved
        // against `process.cwd()`, which on Windows is often a different volume
        // from the copy below (the repository on D:, the system temp on C:) and
        // the rename fails with EXDEV. Keeping it inside the copy also stops the
        // command from writing into the project it is validating.
        tmpDir: join(work, ".tanstack", "tmp"),
        disableLogging: true,
      },
      work
    )
    await new mod.Generator({ config, root: work }).run()
    return existsSync(generatedRouteTree) ? readFileSync(generatedRouteTree, "utf8") : null
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function checkPackageJson(root: string, findings: Findings): PackageJson | null {
  const file = join(root, "package.json")
  let pkg: PackageJson
  try {
    pkg = readPackageJson(root)
  } catch (error) {
    findings.add(
      "error",
      "package.json",
      "VALIDATION_FAILED",
      `package.json could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      { source: file }
    )
    return null
  }
  if (!pkg.name)
    findings.add(
      "error",
      "package.json",
      "VALIDATION_FAILED",
      "package.json has no `name`; the mfeId is inferred from it.",
      { source: file, override: "package.json → name" }
    )
  if (pkg.type !== "module")
    findings.add(
      "error",
      "package.json",
      "VALIDATION_FAILED",
      'package.json must declare `"type": "module"` (the generated entry and the Vite config are ES modules).',
      { source: file, override: 'package.json → "type": "module"' }
    )
  const deps = allDependencies(pkg)
  // A widget library has no routes, so it has no reason to carry a router.
  const required = existsSync(join(root, "src", "routes"))
    ? ["@platform/mfe-react", "@tanstack/react-router"]
    : ["@platform/mfe-react"]
  for (const name of required) {
    if (!deps[name])
      findings.add(
        "error",
        "package.json",
        "DEPENDENCY_MISSING",
        `package.json does not depend on ${name}.`,
        { source: file, override: `pnpm add ${name}` }
      )
  }
  for (const dev of ["@platform/vite", "@platform/cli"]) {
    if (!deps[dev])
      findings.add(
        "warning",
        "package.json",
        "DEPENDENCY_MISSING",
        `package.json does not list ${dev}; \`platform dev/build/lint\` need it.`,
        { source: file, override: `pnpm add -D ${dev}` }
      )
  }
  if (!pkg.scripts?.lint)
    findings.add(
      "warning",
      "lint",
      "LINT_FAILED",
      'No `lint` script; add `"lint": "platform lint"` so CI and developers run the same configuration.',
      { source: file }
    )
  return pkg
}

/** `platform validate`: structural, identity, configuration, generated-file and manifest checks. */
export async function validate(options: ValidateOptions = {}): Promise<ValidateResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  const findings = new Findings(root)
  const checks: string[] = []

  checks.push("package.json")
  checkPackageJson(root, findings)

  checks.push("bootstrap")
  const mfeFile = ["src/mfe.tsx", "src/mfe.ts"]
    .map((name) => join(root, name))
    .find((file) => existsSync(file))
  if (!mfeFile) {
    findings.add(
      "error",
      "bootstrap",
      "VALIDATION_FAILED",
      "src/mfe.tsx is missing; it must default-export `createMfe({...})`.",
      { source: join(root, "src", "mfe.tsx") }
    )
  } else if (!defaultExportsCreateMfe(readFileSync(mfeFile, "utf8"), mfeFile)) {
    findings.add(
      "error",
      "bootstrap",
      "VALIDATION_FAILED",
      "src/mfe.tsx must default-export the `createMfe({...})` call (the generated entry imports it).",
      { source: mfeFile }
    )
  }

  // Widget libraries have no routes directory: no root route and no route tree to check.
  const hasRoutes = existsSync(join(root, "src", "routes"))
  checks.push("routes")
  if (hasRoutes && !existsSync(join(root, "src", "routes", "__root.tsx"))) {
    findings.add(
      "error",
      "routes",
      "VALIDATION_FAILED",
      "src/routes/__root.tsx is missing; folder routing needs a root route.",
      { source: join(root, "src", "routes") }
    )
  }

  checks.push("identity")
  const identityFile = join(root, ".platform", "identity.json")
  const identity = readIdentity(root)
  if (!existsSync(identityFile)) {
    findings.add(
      "warning",
      "identity",
      "MFE_ID_INVALID",
      ".platform/identity.json does not exist yet; it is created on the first `platform dev`/`build` and must be committed.",
      { source: identityFile }
    )
  } else if (!identity || !isValidMfeId(identity.mfeId)) {
    findings.add(
      "error",
      "identity",
      "MFE_ID_INVALID",
      `.platform/identity.json must contain a valid \`mfeId\`${identity ? ` ("${identity.mfeId}" is not kebab-case)` : ""}.`,
      {
        source: identityFile,
        override: "mfe.config.ts → mfeId (then update the identity file)",
      }
    )
  }

  checks.push("config")
  const config = readStaticMfeConfig(root)
  let configMfeId: string | undefined
  let configPrefix: string | undefined
  if (config) {
    if (config.notFound) {
      findings.add(
        "error",
        "config",
        "VALIDATION_FAILED",
        `${relative(root, config.file)} has no \`defineMfeConfig({...})\` call (or object default export).`,
        {
          source: config.file,
          override: 'export default defineMfeConfig({ ... }) from "@platform/vite/config"',
        }
      )
    } else {
      for (const issue of checkMfeConfig(config.config)) {
        const code: PlatformErrorCode | CliErrorCode =
          issue.path === "routePrefix"
            ? "ROUTE_PREFIX_INVALID"
            : issue.path === "mfeId"
              ? "MFE_ID_INVALID"
              : issue.path.startsWith("env")
                ? "RUNTIME_CONFIG_INVALID"
                : "VALIDATION_FAILED"
        findings.add(
          "error",
          issue.path.startsWith("env")
            ? "env"
            : issue.path === "routePrefix"
              ? "prefix"
              : "config",
          code,
          `mfe.config: ${issue.path}: ${issue.message}`,
          { source: config.file, override: `mfe.config.ts → ${issue.path}` }
        )
      }
      const env = config.config.env as Record<string, unknown> | undefined
      for (const key of Object.keys(env ?? {})) {
        if (isSensitiveKey(key))
          findings.add(
            "error",
            "env",
            "RUNTIME_CONFIG_INVALID",
            `runtime env key "${key}" looks sensitive; runtime env values are public and the entrypoint refuses such names.`,
            { source: config.file, override: `mfe.config.ts → env.${key}` }
          )
      }
      if (config.dynamic.length)
        findings.add(
          "info",
          "config",
          "VALIDATION_FAILED",
          `mfe.config values not readable statically (skipped): ${config.dynamic.join(", ")}.`,
          { source: config.file }
        )
      if (typeof config.config.mfeId === "string") configMfeId = config.config.mfeId
      if (typeof config.config.routePrefix === "string")
        configPrefix = config.config.routePrefix
      if (identity && configMfeId && identity.mfeId !== configMfeId) {
        findings.add(
          "error",
          "identity",
          "MFE_ID_INVALID",
          `mfe.config.ts declares mfeId "${configMfeId}" but .platform/identity.json persists "${identity.mfeId}"; identity is persisted on purpose.`,
          {
            source: identityFile,
            override: "update both mfe.config.ts and .platform/identity.json deliberately",
          }
        )
      }
    }
  }
  const mfeId = resolveMfeId(root, configMfeId)

  checks.push("prefix")
  const prefix = configPrefix ?? inferRoutePrefix(mfeId)
  if (!isValidRoutePrefix(prefix))
    findings.add(
      "error",
      "prefix",
      "ROUTE_PREFIX_INVALID",
      `Route prefix "${prefix}" is invalid.`,
      { override: "mfe.config.ts → routePrefix" }
    )

  checks.push("routeTree")
  const routeTreeFile = join(root, "src", "routeTree.gen.ts")
  if (!hasRoutes) {
    // nothing to generate for a widget library
  } else if (!existsSync(routeTreeFile)) {
    findings.add(
      "error",
      "routeTree",
      "VALIDATION_FAILED",
      "src/routeTree.gen.ts is missing; run `platform dev` or `platform build` once to generate it.",
      { source: routeTreeFile }
    )
  } else {
    const current = readFileSync(routeTreeFile, "utf8")
    if (!hasGeneratedBanner(current)) {
      findings.add(
        "error",
        "routeTree",
        "VALIDATION_FAILED",
        "src/routeTree.gen.ts lacks the generator banner; it looks hand-written. Delete it and let the Vite plugin regenerate it.",
        { source: routeTreeFile }
      )
    }
    try {
      const regenerated = await regenerateRouteTree(root)
      if (
        regenerated !== null &&
        normaliseGenerated(regenerated) !== normaliseGenerated(current)
      ) {
        findings.add(
          "error",
          "routeTree",
          "VALIDATION_FAILED",
          "src/routeTree.gen.ts differs from what the router generator produces for src/routes; it is stale or was edited by hand. Regenerate it (`platform dev`/`build`).",
          { source: routeTreeFile }
        )
      }
    } catch (error) {
      findings.add(
        "warning",
        "routeTree",
        "VALIDATION_FAILED",
        `Could not regenerate the route tree for comparison: ${error instanceof Error ? error.message : String(error)}`,
        { source: routeTreeFile }
      )
    }
  }

  if (options.manifest !== false) {
    checks.push("manifest")
    if (
      resolveProjectModule(root, "@platform/vite") ||
      existsSync(join(root, "dist")) ||
      existsSync(join(root, ".platform", "manifest.json"))
    ) {
      try {
        const { manifest, source } = await readManifest(root, "build")
        const validation = validateManifest(manifest)
        if (!validation.ok) {
          for (const issue of validation.issues)
            findings.add(
              "error",
              "manifest",
              "MANIFEST_INVALID",
              `manifest ${issue.path || "<root>"}: ${issue.message}`,
              { source, override: "mfe.config.ts" }
            )
        } else {
          if (validation.manifest.mfeId !== mfeId)
            findings.add(
              "error",
              "manifest",
              "MANIFEST_INVALID",
              `Generated manifest has mfeId "${validation.manifest.mfeId}" but the project resolves to "${mfeId}".`,
              { source }
            )
          for (const key of Object.keys(validation.manifest.env.keys)) {
            if (isSensitiveKey(key))
              findings.add(
                "error",
                "env",
                "RUNTIME_CONFIG_INVALID",
                `manifest env key "${key}" looks sensitive.`,
                { source }
              )
          }
        }
      } catch (error) {
        findings.add(
          "warning",
          "manifest",
          "MANIFEST_INVALID",
          `Manifest could not be generated: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
          { override: "pnpm add -D @platform/vite" }
        )
      }
    } else {
      findings.add(
        "info",
        "manifest",
        "MANIFEST_INVALID",
        "Manifest check skipped: @platform/vite is not installed and nothing has been built yet."
      )
    }
  }

  checks.push("lint")
  if (
    ![
      "eslint.config.ts",
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.mts",
      "eslint.config.cts",
    ].some((name) => existsSync(join(root, name)))
  ) {
    findings.add(
      "warning",
      "lint",
      "LINT_FAILED",
      'No eslint.config.* found; scaffold one with `export default platformConfig()` from "@platform/cli/eslint".',
      { source: root }
    )
  }

  const ok = !findings.items.some((finding) => finding.level === "error")
  const log = options.log
  if (log) {
    for (const finding of findings.items) log(formatFinding(finding))
    const errors = findings.items.filter((finding) => finding.level === "error").length
    const warnings = findings.items.filter((finding) => finding.level === "warning").length
    log(
      ok
        ? `✔ ${mfeId}: ${checks.length} checks passed${warnings ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}.`
        : `✖ ${mfeId}: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`
    )
  }
  return { ok, root, mfeId, findings: findings.items, checks }
}
