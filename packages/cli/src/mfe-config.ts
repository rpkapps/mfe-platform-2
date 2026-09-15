import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import ts from "typescript"
import { z } from "zod"
import { CAPABILITY_IDS, isSensitiveKey, isValidRoutePrefix, MFE_ID_RE } from "@platform-internal/core"

import { fileMtime } from "./project"

/**
 * `mfe.config.ts` is read statically (no evaluation): the CLI's `validate`
 * command and the lint rules only need the literal values. Anything that is
 * not a literal (imports, calls, spreads) is reported as `dynamic` and
 * skipped by the checks that need a value.
 */

/** Every key `defineMfeConfig` / `platform()` accept (docs/ARCHITECTURE.md → `@platform/vite` behaviour). */
export const MFE_CONFIG_KEYS = [
  "mfeId",
  "routePrefix",
  "displayName",
  "description",
  "discoverable",
  "navigation",
  "permissionGroups",
  "capabilities",
  "shared",
  "env",
  "css",
  "tecton",
  "react",
  "tailwind",
  "manifest",
  "federation",
  "runtime",
] as const

export const SHARED_ENTRY_KEYS = ["version", "bundle", "singleton", "scope"] as const
export const ENV_DECLARATION_KEYS = ["required", "description", "default"] as const
export const NAVIGATION_KEYS = ["title", "description", "icon", "keywords", "category", "order"] as const
export const CSS_KEYS = ["scope", "ownerAttribute", "foundation"] as const
export const SHARE_SCOPE_RE = /^(default|react\d+)$/

const capabilityId = z.enum(CAPABILITY_IDS)

export const sharedEntrySchema = z.union([
  z.boolean(),
  z
    .object({
      version: z.string().optional(),
      bundle: z.boolean().optional(),
      singleton: z.boolean().optional(),
      scope: z.string().regex(SHARE_SCOPE_RE, "share scope must be `default` or `react<major>`").optional(),
    })
    .strict(),
])

export const envDeclarationSchema = z
  .object({
    required: z.boolean().optional(),
    description: z.string().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict()

export const mfeConfigSchema = z
  .object({
    mfeId: z.string().regex(MFE_ID_RE, "mfeId must be kebab-case (e.g. asset-tracker)").optional(),
    routePrefix: z.string().refine(isValidRoutePrefix, "route prefix must start with `/`, use lowercase segments and have no trailing slash").optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    discoverable: z.boolean().optional(),
    navigation: z
      .object({
        title: z.string(),
        description: z.string().optional(),
        icon: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        category: z.string().optional(),
        order: z.number().optional(),
      })
      .strict()
      .optional(),
    permissionGroups: z.array(z.string()).optional(),
    capabilities: z.object({ add: z.array(capabilityId).optional(), remove: z.array(capabilityId).optional() }).strict().optional(),
    shared: z.record(z.string(), sharedEntrySchema).optional(),
    env: z
      .record(z.string(), envDeclarationSchema)
      .refine((record) => Object.keys(record).every((key) => !isSensitiveKey(key)), {
        message: "runtime env keys are public; names that look like secrets (TOKEN, SECRET, PASSWORD, *_KEY…) are refused",
      })
      .optional(),
    css: z.object({ scope: z.boolean().optional(), ownerAttribute: z.string().optional(), foundation: z.enum(["shell", "bundled"]).optional() }).strict().optional(),
    tecton: z.union([z.boolean(), z.literal("auto")]).optional(),
    react: z.unknown().optional(),
    tailwind: z.unknown().optional(),
    manifest: z.object({ fileName: z.string().optional() }).strict().optional(),
    federation: z.unknown().optional(),
    runtime: z.object({ react: z.string().optional() }).strict().optional(),
  })
  .strict()

export type MfeConfig = z.infer<typeof mfeConfigSchema>

export const MFE_CONFIG_FILES = ["mfe.config.ts", "mfe.config.mts", "mfe.config.js", "mfe.config.mjs", "mfe.config.cts", "mfe.config.cjs"] as const

export function findMfeConfigFile(root: string): string | null {
  for (const name of MFE_CONFIG_FILES) {
    const file = join(root, name)
    if (existsSync(file)) return file
  }
  return null
}

export function isMfeConfigFile(filename: string): boolean {
  return /(^|[\\/])mfe\.config\.(m|c)?[jt]s$/.test(filename)
}

export const DYNAMIC = Symbol("dynamic")
export type StaticValue = string | number | boolean | null | undefined | StaticValue[] | { [key: string]: StaticValue } | typeof DYNAMIC

/** Evaluate a literal-only expression; non-literal parts become `DYNAMIC`. */
export function evaluateStatic(node: ts.Node): StaticValue {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return evaluateStatic(node.expression)
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isIdentifier(node) && node.text === "undefined") return undefined
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => (ts.isSpreadElement(element) ? DYNAMIC : evaluateStatic(element)))
  if (ts.isObjectLiteralExpression(node)) {
    const result: { [key: string]: StaticValue } = {}
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyName(property.name)
        if (key !== null) result[key] = evaluateStatic(property.initializer)
      } else if (ts.isShorthandPropertyAssignment(property)) {
        result[property.name.text] = DYNAMIC
      } else if (ts.isMethodDeclaration(property) || ts.isGetAccessor(property)) {
        const key = propertyName(property.name)
        if (key !== null) result[key] = DYNAMIC
      }
    }
    return result
  }
  return DYNAMIC
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

/** Replace `DYNAMIC` markers with `undefined` so the value can be schema-checked / JSON-printed. */
export function stripDynamic(value: StaticValue): unknown {
  if (value === DYNAMIC) return undefined
  if (Array.isArray(value)) return value.map(stripDynamic)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== DYNAMIC).map(([key, entry]) => [key, stripDynamic(entry)]))
  }
  return value
}

export function dynamicPaths(value: StaticValue, path = ""): string[] {
  if (value === DYNAMIC) return [path || "<root>"]
  if (Array.isArray(value)) return value.flatMap((entry, index) => dynamicPaths(entry, `${path}[${index}]`))
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, entry]) => dynamicPaths(entry, path ? `${path}.${key}` : key))
  return []
}

export interface StaticMfeConfig {
  file: string
  /** The object literal handed to `defineMfeConfig` (or exported as default), with `DYNAMIC` markers. */
  raw: StaticValue
  /** Literal values only. */
  config: Record<string, unknown>
  /** Paths whose values could not be read statically. */
  dynamic: string[]
  /** Set when the file has no `defineMfeConfig({...})` call and no object default export. */
  notFound: boolean
}

/** Locate the `defineMfeConfig({...})` object (or `export default {...}`) in a config source. */
export function findConfigObject(source: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let found: ts.ObjectLiteralExpression | null = null
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineMfeConfig") {
      const [argument] = node.arguments
      if (argument && ts.isObjectLiteralExpression(argument)) {
        found = argument
        return
      }
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      let expression: ts.Expression = node.expression
      while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) expression = expression.expression
      if (ts.isObjectLiteralExpression(expression)) {
        found = expression
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

export function parseMfeConfigSource(file: string, text: string): StaticMfeConfig {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const object = findConfigObject(source)
  if (!object) return { file, raw: {}, config: {}, dynamic: [], notFound: true }
  const raw = evaluateStatic(object)
  return { file, raw, config: stripDynamic(raw) as Record<string, unknown>, dynamic: dynamicPaths(raw), notFound: false }
}

const cache = new Map<string, { mtime: number; value: StaticMfeConfig }>()

/** Read and cache the project's mfe.config (null when the project has none). */
export function readStaticMfeConfig(root: string): StaticMfeConfig | null {
  const file = findMfeConfigFile(root)
  if (!file) return null
  const mtime = fileMtime(file)
  const cached = cache.get(file)
  if (cached && cached.mtime === mtime) return cached.value
  const value = parseMfeConfigSource(file, readFileSync(file, "utf8"))
  cache.set(file, { mtime, value })
  return value
}

export interface ConfigIssue {
  path: string
  message: string
}

/** Schema-check a statically read config; unknown keys list the valid ones. */
export function checkMfeConfig(config: Record<string, unknown>): ConfigIssue[] {
  const result = mfeConfigSchema.safeParse(config)
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const path = issue.path.map(String).join(".")
    if (issue.code === "unrecognized_keys") {
      const keys = (issue as { keys?: string[] }).keys ?? []
      const valid = path === "" ? MFE_CONFIG_KEYS : path === "navigation" ? NAVIGATION_KEYS : path === "css" ? CSS_KEYS : path.startsWith("shared.") ? SHARED_ENTRY_KEYS : path.startsWith("env.") ? ENV_DECLARATION_KEYS : path === "capabilities" ? ["add", "remove"] : []
      return { path: path || "<root>", message: `unknown key${keys.length > 1 ? "s" : ""} ${keys.map((key) => `"${key}"`).join(", ")}${valid.length ? `; valid keys: ${valid.join(", ")}` : ""}` }
    }
    return { path: path || "<root>", message: issue.message }
  })
}
