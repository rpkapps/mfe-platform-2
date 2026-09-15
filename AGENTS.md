# Working in this repository (for humans and AI agents)

This is the platform monorepo for independently deployed React micro-frontends: `@platform/mfe-react` (MFE SDK), `@platform/vite` (Vite plugin), `@platform/cli` (scaffolding, dev, lint), `@platform/host` (framework-free shell runtime), `@platform/host-react` (its React bindings) and `@platform/devtools`, plus private internal packages, conformance applications and the documentation site. `docs/ARCHITECTURE.md` is the design contract; `llm.txt` is the short version; `llms.txt` indexes the documentation.

## Toolchain

- pnpm workspace (`pnpm install`), Node ≥ 20.19, TypeScript 6, Vite 8, Vitest 5, Playwright, tsdown for package builds, ESLint 9 flat config, Prettier (no semicolons, double quotes, width 96).
- Build order matters: `pnpm build` builds `internal/*` then `packages/*` (tsdown, `dist/`). Apps consume `dist/`, so rebuild a package after editing it (`pnpm --filter @platform/mfe-react build`) or run `pnpm --filter <pkg> dev` for watch mode.
- `pnpm check` = format + lint + typecheck + unit tests. `pnpm e2e` runs Playwright against the conformance apps (build first with `pnpm build:all`).
- Scripts are Node (`.mjs`) so they run on Windows and Linux; never add bash-only scripts.
- A package that publishes a `bin` points it at a checked-in stub (`packages/*/bin.js`) that imports the build output. pnpm links bins during `pnpm install`, before `dist/` exists in a fresh clone; a `bin` pointing straight at `dist/` is skipped with a warning and the command is missing for the rest of the CI run.
- The workspace root pins `@types/react`/`@types/react-dom` to the React 19 catalog even though nothing at the root imports React. Two React majors mean two copies of the types; a package inside the virtual store that does not resolve them as a peer walks up to `node_modules/.pnpm/node_modules`, and which major pnpm hoists there is not stable (a clean install picked React 18, so `apps/docs` type-checked React 19 code against React 18 types and only CI saw it). Declaring them at the root removes the hoisted copy entirely, so the fallback is this pin. Applications still resolve their own major first: `apps/production-reports` compiles against `@types/react@18`.
- `.gitattributes` checks every text file out with LF. Prettier is configured with `endOfLine: "lf"` and CI verifies on Windows, where Git would otherwise convert the tree to CRLF and fail `pnpm format:check` on every file.

## Layout

```
apps/docs                   TanStack Start + Fumadocs documentation site (Tecton styles)
apps/conformance-shell      SSR shell (TanStack Start, React 19) and the reference chrome in src/components
apps/well-planner           MFE "well-planner" (React 19, Tecton)
apps/production-reports     MFE "production-reports" (React 18, no design system)
apps/subsurface-widgets     hidden widget library (React 19, Tecton)
apps/field-widgets          hidden widget library (React 18, no design system)
packages/mfe-react|host|host-react|devtools|vite|cli   public packages
internal/core|module-federation|diagnostics|conformance   private packages
test/integration            package and runtime boundary tests (Vitest)
test/e2e                    Playwright suites
```

## Rules

1. Contracts live in `internal/core/src` and are the single source of truth; change them there, add a test, rebuild, then adapt consumers. Public packages bundle `internal/*`.
2. Never monkeypatch: no patching of `history`, `pushState`, `replaceState`, `popstate`, browser storage, `document.body`, React portals or third-party components. Use providers and adapters (`@tecton/react/tecton/portal`, `ShellNavigation`, `StorageBackend`).
3. Never pass React elements, hooks, contexts or component values across React roots. Cross-root surfaces are metadata + `mount/dispose`.
4. MFE application code never imports `@module-federation/*`, reads `window.localStorage` for platform data, or reads runtime configuration directly. `@platform/cli/eslint` enforces this; keep the rules and the docs in step.
5. Generated files are never edited by hand: `**/routeTree.gen.ts`, `platform-manifest.json`, `.platform/*`, `apps/docs/public/schemas/*`, `apps/docs/content/docs/reference/generated/*`. Regenerate with the owning script.
6. Errors are `PlatformError`s with a code from `ERROR_CODES` (owner, source, override, hint, docs URL). Add a code before throwing a new kind of failure; the docs page in `docs` must exist. One failure is one telemetry event: the call site that owns it reports it (it knows the `boundary`), and a diagnostic carrying the same failure passes `errorInstance` so the bus forwards the error that was thrown instead of a reconstruction. `createTelemetry` drops the repeats by identity.
7. Every public API takes an options object, infers what it can and exposes explicit overrides; hooks are primitives, components are thin wrappers. One canonical pattern per task — do not add a second way.
8. Tecton is the UI library **of the applications and the developer tools** (`@tecton/react`, installed from the Tecton repository as a git dependency in `pnpm-workspace.yaml`). Use Tecton components and tokens there; never stock Tailwind colour classes (`bg-red-500` produces no CSS with the Tecton palette). The platform packages are a different matter: `@platform/host` has no peer dependencies at all, `@platform/host-react` may use React but no design system, and `internal/*` imports no framework. `test/integration/package-boundaries.test.ts` enforces each of those, and shell UI belongs in `apps/conformance-shell/src/components` rather than in a package.
9. Tests: unit tests next to each package (`test/` or `src/**/*.test.ts`), integration tests in `test/integration`, browser tests in `test/e2e`. A behaviour listed in `docs/ARCHITECTURE.md` needs a test.
10. Documentation: every feature has a page under `apps/docs/content/docs`; error codes link to it. Update `llms.txt` when pages are added (`pnpm docs:generate` regenerates the index).

## Common workflows

- New SDK hook → `packages/mfe-react/src`, export from `src/index.ts`, add to `CAPABILITY_BY_API` in core if it implies a capability, document under `docs/…`, add a lint rule if misuse is statically detectable.
- New shell chrome → `apps/conformance-shell/src/components`, built on the headless API `@platform/host` exports. A new package is the wrong answer; so is a new peer dependency on `@platform/host` or `@platform/host-react`.
- New developer-tools panel → `packages/devtools/src/panels`, registered in `DEVTOOLS_TABS` (or by a shell through `registerDevtoolsPanel`). Anything it needs from the host goes on the structural `DevtoolsHost` port, never as an import of `@platform/host`.
- New manifest field → `internal/core/src/manifest.ts` (schema + type), `packages/vite` (generation), `packages/host` (consumption), `pnpm schemas:build`, docs page `manifests`.
- New conformance scenario → the relevant `apps/conformance-*` app + `test/e2e/<scenario>.spec.ts`.
