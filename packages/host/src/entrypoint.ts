import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import {
  generateRuntimeConfig,
  isPlatformError,
  parseRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigInput,
} from "@platform-internal/core"

export const RUNTIME_CONFIG_SCHEMA_URL =
  "https://platform.docs.local/schemas/runtime-config.json"

export interface GenerateRuntimeConfigFileOptions {
  /** Output file (`platform-config.json`). Omit to skip writing. */
  out?: string
  /** Base document merged under the environment (JSON file path or object). */
  base?: string | RuntimeConfigInput
  /** Known mfeIds for `PLATFORM_MFE_<ID>_*` mapping. */
  known?: readonly string[]
  env?: Record<string, string | undefined>
  cwd?: string
  now?: () => Date
}

export interface GenerateRuntimeConfigFileResult {
  config: RuntimeConfig
  refused: string[]
  sources: Record<string, string>
  outPath?: string
  json: string
}

/** Generate, validate and (optionally) write the runtime configuration document. */
export function generateRuntimeConfigFile(
  options: GenerateRuntimeConfigFileOptions = {}
): GenerateRuntimeConfigFileResult {
  const cwd = options.cwd ?? process.cwd()
  let base: RuntimeConfigInput | undefined
  if (typeof options.base === "string") {
    const basePath = resolve(cwd, options.base)
    base = JSON.parse(readFileSync(basePath, "utf8")) as RuntimeConfigInput
  } else base = options.base
  const result = generateRuntimeConfig({
    env: options.env ?? process.env,
    base,
    knownMfeIds: options.known,
    now: options.now,
  })
  const config = parseRuntimeConfig(
    { $schema: RUNTIME_CONFIG_SCHEMA_URL, ...result.config },
    "entrypoint"
  )
  const json = `${JSON.stringify({ $schema: RUNTIME_CONFIG_SCHEMA_URL, ...config }, null, 2)}\n`
  let outPath: string | undefined
  if (options.out) {
    outPath = resolve(cwd, options.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, json, "utf8")
  }
  return { config, refused: result.refused, sources: result.sources, outPath, json }
}

export interface ParsedArgs {
  out?: string
  base?: string
  known?: string[]
  print: boolean
  help: boolean
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { print: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    const [flag, inline] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined]
    const next = () => {
      if (inline !== undefined) return inline
      index += 1
      const value = argv[index]
      if (value === undefined) throw new Error(`Missing value for ${flag}`)
      return value
    }
    switch (flag) {
      case "--out":
      case "-o":
        parsed.out = next()
        break
      case "--base":
      case "-b":
        parsed.base = next()
        break
      case "--known":
      case "-k":
        parsed.known = next()
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
        break
      case "--print":
      case "-p":
        parsed.print = true
        break
      case "--help":
      case "-h":
        parsed.help = true
        break
      default:
        throw new Error(`Unknown argument ${arg}`)
    }
  }
  return parsed
}

export const USAGE = `platform-host-entrypoint --out <file> [--base <json file>] [--known <mfeId,...>] [--print]

Generates the client-safe runtime configuration from PLATFORM_* environment
variables at container start. Variables whose names look sensitive are refused.
`

export interface CliIo {
  log(message: string): void
  error(message: string): void
}

/** Run the CLI; returns the exit code. */
export function runEntrypoint(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  io: CliIo = console,
  cwd = process.cwd()
): number {
  let args: ParsedArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    io.error(USAGE)
    return 2
  }
  if (args.help) {
    io.log(USAGE)
    return 0
  }
  if (!args.out && !args.print) {
    io.error("Either --out <file> or --print is required.")
    io.error(USAGE)
    return 2
  }
  try {
    const result = generateRuntimeConfigFile({
      out: args.out,
      base: args.base,
      known: args.known,
      env,
      cwd,
    })
    if (result.outPath)
      io.log(
        `Runtime configuration written to ${result.outPath} (environment: ${result.config.environment}, ${Object.keys(result.config.mfes).length} MFE entries).`
      )
    for (const [key, source] of Object.entries(result.sources)) io.log(`  ${key} ← ${source}`)
    for (const name of result.refused)
      io.error(
        `  refused ${name}: sensitive-looking variables are never written to the client configuration.`
      )
    if (args.print) io.log(result.json)
    return 0
  } catch (error) {
    if (isPlatformError(error)) io.error(error.format())
    else io.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const isMain = (() => {
  try {
    const entry = process.argv[1]
    if (!entry) return false
    const self = new URL(import.meta.url).pathname
    return (
      resolve(entry) === resolve(self) ||
      entry.endsWith("platform-host-entrypoint") ||
      entry.endsWith("entrypoint.js")
    )
  } catch {
    return false
  }
})()

if (isMain) {
  process.exitCode = runEntrypoint(process.argv.slice(2))
}
