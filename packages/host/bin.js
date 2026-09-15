#!/usr/bin/env node
// See packages/cli/bin.js: the bin entry must exist at install time, before
// `dist/` has been built, or pnpm skips linking it.
import { runEntrypoint } from "./dist/entrypoint.js"

process.exitCode = runEntrypoint(process.argv.slice(2))
