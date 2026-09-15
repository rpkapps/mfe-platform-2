#!/usr/bin/env node
// pnpm links bin entries during `pnpm install`, which happens before `dist/`
// exists in a fresh clone. Pointing `bin` at the build output makes pnpm skip
// the link with a warning, and `platform <command>` is then missing for the
// rest of the session. This checked-in stub always exists, so the link is
// created at install time and resolves once the package has been built.
import "./dist/bin.js"
