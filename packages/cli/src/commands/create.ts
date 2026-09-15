import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { basename, isAbsolute, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import { inferMfeId, inferRoutePrefix, isValidMfeId } from "@platform-internal/core"

import { CliError } from "../errors"
import { templatesDir } from "../package-root"
import { IDENTITY_FILE } from "../project"
import { renderTemplateDir, writeRenderedFiles, type TemplateContext } from "../template"

export type PackageManager = "pnpm" | "npm" | "yarn"

export interface CreateOptions {
  /** Package name (`asset-tracker` or `@acme/asset-tracker`); the folder is its last segment. */
  name: string
  template?: string
  react?: 18 | 19
  tecton?: boolean
  packageManager?: PackageManager
  /** Run the package manager after scaffolding (default false programmatically, true in the CLI). */
  install?: boolean
  /** Run `git init` (default false programmatically, true in the CLI). */
  git?: boolean
  /** Monorepo root: platform packages become `link:` dependencies (no registry needed). */
  linkPlatform?: string
  force?: boolean
  /** Parent directory of the new project (default: cwd). */
  dir?: string
  cwd?: string
  displayName?: string
  mfeId?: string
  /** Override the templates directory (tests). */
  templatesDir?: string
  log?: (message: string) => void
}

export interface CreateResult {
  dir: string
  packageName: string
  mfeId: string
  displayName: string
  routePrefix: string
  react: 18 | 19
  tecton: boolean
  files: string[]
  installed: boolean
  gitInitialised: boolean
  nextSteps: string[]
}

export const PLATFORM_VERSION_RANGE = "^0.1.0"
export const TECTON_GIT_SPEC =
  "github:rpkapps/tecton-ui-1#363b5374b19846f00647be06c73b418f8039253c&path:packages/tecton-react"

export function titleCase(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ")
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

/** Where `@tecton/react` lives in the monorepo (hoisted, or in a workspace package). */
export function resolveTectonLink(monorepoRoot: string): string {
  const candidates = [
    join(monorepoRoot, "node_modules", "@tecton", "react"),
    join(monorepoRoot, "packages", "react", "node_modules", "@tecton", "react"),
    join(monorepoRoot, "packages", "host", "node_modules", "@tecton", "react"),
    join(monorepoRoot, "node_modules", ".pnpm", "node_modules", "@tecton", "react"),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
}

export interface DependencySpecs {
  platformReact: string
  platformVite: string
  platformCli: string
  platformHost: string
  tecton: string
}

export function dependencySpecs(linkPlatform: string | undefined): DependencySpecs {
  if (!linkPlatform) {
    return {
      platformReact: PLATFORM_VERSION_RANGE,
      platformVite: PLATFORM_VERSION_RANGE,
      platformCli: PLATFORM_VERSION_RANGE,
      platformHost: PLATFORM_VERSION_RANGE,
      tecton: TECTON_GIT_SPEC,
    }
  }
  const root = resolve(linkPlatform)
  const link = (...segments: string[]) => `link:${toPosix(join(root, ...segments))}`
  return {
    platformReact: link("packages", "react"),
    platformVite: link("packages", "vite"),
    platformCli: link("packages", "cli"),
    platformHost: link("packages", "host"),
    tecton: `link:${toPosix(resolveTectonLink(root))}`,
  }
}

export function templateContext(options: {
  mfeId: string
  packageName: string
  displayName: string
  routePrefix: string
  react: 18 | 19
  tecton: boolean
  specs: DependencySpecs
  linked: boolean
}): TemplateContext {
  const { react, tecton, specs } = options
  return {
    flags: {
      tecton,
      plain: !tecton,
      react18: react === 18,
      react19: react === 19,
      linked: options.linked,
    },
    tokens: {
      MFE_ID: options.mfeId,
      PACKAGE_NAME: options.packageName,
      DISPLAY_NAME: options.displayName,
      ROUTE_PREFIX: options.routePrefix,
      REACT_MAJOR: String(react),
      REACT_RANGE: react === 18 ? "^18.3.1" : "^19.0.0",
      TYPES_REACT_RANGE: react === 18 ? "^18.3.0" : "^19.0.0",
      YEAR: String(new Date().getFullYear()),
      PLATFORM_REACT_SPEC: specs.platformReact,
      PLATFORM_VITE_SPEC: specs.platformVite,
      PLATFORM_CLI_SPEC: specs.platformCli,
      PLATFORM_HOST_SPEC: specs.platformHost,
      TECTON_SPEC: specs.tecton,
    },
  }
}

function isEmptyDir(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0
}

function runCommand(command: string, args: string[], cwd: string): boolean {
  const useShell = process.platform === "win32"
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: useShell })
  return result.status === 0
}

export async function create(options: CreateOptions): Promise<CreateResult> {
  const log = options.log ?? (() => {})
  const template = options.template ?? "mfe"
  const templateRoot = join(options.templatesDir ?? templatesDir(), template)
  if (!existsSync(templateRoot)) {
    throw new CliError({
      code: "TEMPLATE_UNKNOWN",
      message: `Unknown template "${template}".`,
      source: templateRoot,
      override: "--template mfe",
    })
  }
  const react = options.react ?? 19
  if (react !== 18 && react !== 19) {
    throw new CliError({
      code: "INVALID_OPTION",
      message: `--react must be 18 or 19 (got ${String(react)}).`,
    })
  }
  const packageName = options.name.trim()
  if (!packageName || /[\s]/.test(packageName)) {
    throw new CliError({
      code: "INVALID_OPTION",
      message: `"${options.name}" is not a valid package name.`,
    })
  }
  const mfeId = options.mfeId ?? inferMfeId(packageName)
  if (!isValidMfeId(mfeId)) {
    throw new CliError({
      code: "INVALID_OPTION",
      message: `"${mfeId}" is not a valid mfeId (kebab-case, starting with a letter).`,
      override: "--mfe-id <id>",
    })
  }
  const folderName = packageName.includes("/")
    ? packageName.slice(packageName.lastIndexOf("/") + 1)
    : packageName
  const cwd = options.cwd ?? process.cwd()
  const parent = options.dir
    ? isAbsolute(options.dir)
      ? options.dir
      : resolve(cwd, options.dir)
    : cwd
  const dir = resolve(parent, folderName)
  if (!isEmptyDir(dir) && !options.force) {
    throw new CliError({
      code: "TARGET_NOT_EMPTY",
      message: `Target directory ${dir} is not empty.`,
      source: dir,
      override: "--force",
    })
  }
  const tecton = options.tecton ?? true
  const displayName = options.displayName ?? titleCase(mfeId)
  const routePrefix = inferRoutePrefix(mfeId)
  const specs = dependencySpecs(options.linkPlatform)
  const context = templateContext({
    mfeId,
    packageName,
    displayName,
    routePrefix,
    react,
    tecton,
    specs,
    linked: Boolean(options.linkPlatform),
  })

  mkdirSync(dir, { recursive: true })
  const rendered = renderTemplateDir(templateRoot, context)
  const files = writeRenderedFiles(dir, rendered)

  const identityPath = join(dir, IDENTITY_FILE)
  mkdirSync(join(dir, ".platform"), { recursive: true })
  writeFileSync(identityPath, `${JSON.stringify({ mfeId }, null, 2)}\n`)
  files.push(toPosix(IDENTITY_FILE))

  log(`Scaffolded ${packageName} (${mfeId}) into ${dir}: ${files.length} files.`)

  let gitInitialised = false
  if (options.git) {
    gitInitialised = runCommand("git", ["init", "-q"], dir)
    if (!gitInitialised)
      log("git init failed (is git installed?); continuing without a repository.")
  }

  const packageManager = options.packageManager ?? "pnpm"
  let installed = false
  if (options.install) {
    log(`Installing dependencies with ${packageManager}…`)
    installed = runCommand(packageManager, ["install"], dir)
    if (!installed) log(`${packageManager} install failed; run it manually in ${dir}.`)
  }

  const run = packageManager === "npm" ? "npm run" : packageManager
  const nextSteps = [
    `cd ${toPosix(basename(parent) === basename(cwd) && parent === cwd ? folderName : dir)}`,
  ]
  if (!installed) nextSteps.push(`${packageManager} install`)
  nextSteps.push(
    `${run} dev        # Vite + local shell harness at http://localhost:5173/__platform/harness/`
  )
  nextSteps.push(`${run} lint       # platform ESLint rules (@platform/cli/eslint)`)
  nextSteps.push(`${run} validate   # manifest, identity, config and generated files`)
  return {
    dir,
    packageName,
    mfeId,
    displayName,
    routePrefix,
    react,
    tecton,
    files,
    installed,
    gitInitialised,
    nextSteps,
  }
}
