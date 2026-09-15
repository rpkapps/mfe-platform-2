import { resolve } from "node:path"

import { cac } from "cac"
import pc from "picocolors"

import { build } from "./commands/build"
import { create } from "./commands/create"
import { dev } from "./commands/dev"
import { lint } from "./commands/lint"
import { manifest } from "./commands/manifest"
import { test } from "./commands/test"
import { validate } from "./commands/validate"
import { exitCodeFor, formatError } from "./errors"
import { cliVersion } from "./package-root"

const cli = cac("platform")

interface GlobalOptions {
  cwd?: string
}

function cwdOf(options: GlobalOptions): string {
  return options.cwd ? resolve(process.cwd(), options.cwd) : process.cwd()
}

function run(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    console.error(pc.red(formatError(error)))
    process.exit(exitCodeFor(error))
  })
}

cli.option("--cwd <dir>", "Run as if started in <dir>")

cli
  .command("create <name>", "Scaffold a new MFE project (`platform create my-mfe`)")
  .option("--template <template>", "Template to use", { default: "mfe" })
  .option("--react <major>", "React major: 18 or 19", { default: "19" })
  .option("--tecton", "Use the Tecton UI library (default) — --no-tecton for a plain project", {
    default: true,
  })
  .option("--package-manager <pm>", "pnpm | npm | yarn", { default: "pnpm" })
  .option(
    "--install",
    "Install dependencies after scaffolding (default) — --no-install to skip",
    { default: true }
  )
  .option("--git", "Initialise a git repository (default) — --no-git to skip", {
    default: true,
  })
  .option(
    "--link-platform <monorepoRoot>",
    "Link @platform/* and @tecton/react from a platform monorepo checkout instead of a registry"
  )
  .option("--force", "Write into a non-empty directory")
  .option("--dir <path>", "Parent directory for the new project (default: cwd)")
  .option("--mfe-id <id>", "Override the inferred mfeId")
  .option("--display-name <name>", "Override the display name")
  .action(
    (
      name: string,
      options: GlobalOptions & {
        template: string
        react: string
        tecton: boolean
        packageManager: "pnpm" | "npm" | "yarn"
        install: boolean
        git: boolean
        linkPlatform?: string
        force?: boolean
        dir?: string
        mfeId?: string
        displayName?: string
      }
    ) =>
      run(async () => {
        const react = Number.parseInt(String(options.react), 10)
        const result = await create({
          name,
          template: options.template,
          react: react as 18 | 19,
          tecton: options.tecton,
          packageManager: options.packageManager,
          install: options.install,
          git: options.git,
          linkPlatform: options.linkPlatform,
          force: options.force,
          dir: options.dir,
          cwd: cwdOf(options),
          mfeId: options.mfeId,
          displayName: options.displayName,
          log: (message) => console.log(pc.dim(message)),
        })
        console.log(
          `\n${pc.green("✔")} Created ${pc.bold(result.packageName)} (${result.mfeId}, React ${result.react}${result.tecton ? ", Tecton" : ""}) in ${result.dir}`
        )
        console.log(
          `\nNext steps:\n${result.nextSteps.map((step) => `  ${step}`).join("\n")}\n`
        )
        console.log(
          pc.dim("Read AGENTS.md / llm.txt in the project for the canonical patterns.")
        )
      })
  )

cli
  .command("dev", "Start the Vite dev server and serve the development manifest")
  .option("--port <port>", "Port (default: Vite's, 5173)")
  .option("--host [host]", "Expose on the network (or a specific host)")
  .option("--open", "Open the dev server in the browser")
  .action(
    (
      options: GlobalOptions & {
        port?: string
        host?: string | boolean
        open?: boolean
      }
    ) =>
      run(async () => {
        await dev({
          cwd: cwdOf(options),
          port: options.port ? Number.parseInt(String(options.port), 10) : undefined,
          host: options.host,
          open: options.open,
        })
      })
  )

cli
  .command("build", "Build the remote with Vite and validate the generated manifest")
  .option("--out-dir <dir>", "Output directory (default: dist)")
  .action((options: GlobalOptions & { outDir?: string }) =>
    run(async () => {
      await build({ cwd: cwdOf(options), outDir: options.outDir })
    })
  )

cli
  .command("manifest", "Generate and print the platform manifest")
  .option("--out <file>", "Write the manifest to a file")
  .option("--json", "Print JSON only")
  .option("--mode <mode>", "build | dev", { default: "build" })
  .action((options: GlobalOptions & { out?: string; json?: boolean; mode: "build" | "dev" }) =>
    run(async () => {
      await manifest({
        cwd: cwdOf(options),
        out: options.out,
        json: options.json,
        mode: options.mode,
      })
    })
  )

cli
  .command(
    "validate",
    "Validate the project structure, identity, configuration, generated files and manifest"
  )
  .option("--no-manifest", "Skip manifest generation")
  .action((options: GlobalOptions & { manifest: boolean }) =>
    run(async () => {
      const result = await validate({
        cwd: cwdOf(options),
        manifest: options.manifest,
        log: (message) => console.log(message),
      })
      if (!result.ok) process.exit(1)
    })
  )

cli
  .command(
    "lint [...files]",
    "Run ESLint with the project's eslint.config (the platform shareable config)"
  )
  .option("--fix", "Apply fixes")
  .action((files: string[], options: GlobalOptions & { fix?: boolean }) =>
    run(async () => {
      const result = await lint({ cwd: cwdOf(options), fix: options.fix, files })
      if (result.errorCount > 0) process.exit(1)
    })
  )

cli
  .command("test [...filters]", "Run unit tests with Vitest (or Playwright with --e2e)")
  .option("--watch", "Watch mode")
  .option("--coverage", "Collect coverage")
  .option("--e2e", "Run Playwright end-to-end tests")
  .action(
    (
      filters: string[],
      options: GlobalOptions & { watch?: boolean; coverage?: boolean; e2e?: boolean }
    ) =>
      run(async () => {
        const result = await test({
          cwd: cwdOf(options),
          watch: options.watch,
          coverage: options.coverage,
          e2e: options.e2e,
          filters,
        })
        if (!result.ok) process.exit(1)
      })
  )

cli.help()
cli.version(cliVersion())

try {
  cli.parse(process.argv, { run: false })
  if (!cli.matchedCommand && !cli.options.help && !cli.options.version) {
    cli.outputHelp()
  } else {
    void cli.runMatchedCommand()
  }
} catch (error) {
  console.error(pc.red(formatError(error)))
  process.exit(1)
}
