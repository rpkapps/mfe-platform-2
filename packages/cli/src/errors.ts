import { DOCS_BASE_URL, isPlatformError, PlatformError } from "@platform-internal/core"

/**
 * CLI failures that have no runtime `ERROR_CODES` entry. They format exactly
 * like `PlatformError.format()` (code, what failed, source, override, hint,
 * docs) so every diagnostic a developer sees has the same shape.
 */
export const CLI_ERROR_CODES = {
  TARGET_NOT_EMPTY: {
    docs: "/cli#create",
    hint: "Choose another directory or pass --force to write into a non-empty directory.",
  },
  TEMPLATE_UNKNOWN: { docs: "/cli#create", hint: "Available templates: mfe." },
  PROJECT_NOT_FOUND: {
    docs: "/cli#project-root",
    hint: "Run the command inside an MFE project (a directory with package.json) or pass --cwd.",
  },
  DEPENDENCY_MISSING: {
    docs: "/cli#dependencies",
    hint: "Install the package in the MFE project (it is a devDependency of every scaffolded MFE) and run the command again.",
  },
  VALIDATION_FAILED: {
    docs: "/cli#validate",
    hint: "Fix the findings above; every finding links to the page that explains it.",
  },
  LINT_FAILED: { docs: "/linting", hint: "Fix the reported problems or run `platform lint --fix`." },
  TESTS_FAILED: { docs: "/cli#test", hint: "See the test output above." },
  BUILD_FAILED: { docs: "/cli#build", hint: "See the Vite output above." },
  COMMAND_FAILED: { docs: "/cli", hint: "See the output above." },
  INVALID_OPTION: { docs: "/cli", hint: "Run `platform <command> --help` for the accepted options." },
} as const

export type CliErrorCode = keyof typeof CLI_ERROR_CODES

export interface CliErrorOptions {
  code: CliErrorCode
  message: string
  source?: string
  override?: string
  owner?: { mfeId?: string }
  cause?: unknown
  exitCode?: number
}

export class CliError extends Error {
  readonly code: CliErrorCode
  readonly source: string | undefined
  readonly override: string | undefined
  readonly owner: { mfeId?: string } | undefined
  readonly hint: string
  readonly docsUrl: string
  readonly exitCode: number
  override readonly cause: unknown

  constructor(options: CliErrorOptions) {
    super(options.message)
    this.name = "CliError"
    this.code = options.code
    this.source = options.source
    this.override = options.override
    this.owner = options.owner
    this.cause = options.cause
    this.exitCode = options.exitCode ?? 1
    this.hint = CLI_ERROR_CODES[options.code].hint
    this.docsUrl = `${DOCS_BASE_URL}${CLI_ERROR_CODES[options.code].docs}`
  }

  format(): string {
    const lines = [`[platform:cli:${this.code}] ${this.message}`]
    if (this.owner?.mfeId) lines.push(`  owner: ${this.owner.mfeId}`)
    if (this.source) lines.push(`  source: ${this.source}`)
    if (this.override) lines.push(`  override: ${this.override}`)
    lines.push(`  hint: ${this.hint}`)
    lines.push(`  docs: ${this.docsUrl}`)
    if (this.cause instanceof Error && this.cause.message && this.cause.message !== this.message) {
      lines.push(`  cause: ${this.cause.message}`)
    }
    return lines.join("\n")
  }
}

export function isCliError(value: unknown): value is CliError {
  return value instanceof CliError || (typeof value === "object" && value !== null && (value as { name?: unknown }).name === "CliError")
}

/** Actionable text for anything thrown by a command. */
export function formatError(error: unknown): string {
  if (isCliError(error) || isPlatformError(error)) return (error as CliError | PlatformError).format()
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack.split("\n").slice(1, 4).join("\n")}` : ""}`
  return String(error)
}

export function exitCodeFor(error: unknown): number {
  return isCliError(error) ? error.exitCode : 1
}
