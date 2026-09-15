# React MFE Platform

A platform for independently deployed React micro-frontends and widgets that feels like writing an ordinary TanStack Router application. MFE developers write React components, file-based routes and business logic; the platform supplies Module Federation, isolated React roots, shell-owned history, CSS isolation, namespaced storage, overlay management, telemetry, runtime configuration and developer tools.

```
pnpm dlx @platform/cli create my-mfe   # scaffold a complete MFE
cd my-mfe && pnpm install && pnpm dev  # local shell harness with HMR
```

| Package           | What it is                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@platform/react` | MFE SDK: `createMfe`, `createWidget`, `usePlatform`, storage, commands, settings, help, release notes, breadcrumbs, telemetry                                                      |
| `@platform/vite`  | One Vite plugin: TanStack Router file routes, code splitting, manifest, CSS scoping, dependency sharing, Module Federation                                                         |
| `@platform/cli`   | `platform create / dev / build / manifest / validate / lint / test` and the shareable ESLint config (`@platform/cli/eslint`)                                                       |
| `@platform/host`  | Shell runtime: remote loading, version-group sharing, mounting, command palette, settings host, breadcrumbs, overlays, runtime configuration, devtools, harness, Docker entrypoint |

## Repository

```
apps/docs                  documentation site (TanStack Start + Fumadocs, Tecton styles)
apps/conformance-*         shell + fixture MFEs (React 19 with Tecton, React 18 without, hidden widget libraries)
packages/                  public packages
internal/                  private packages bundled into the public ones
test/e2e                   Playwright suites (Windows + Linux CI)
test/integration           package and runtime boundary tests
docs/ARCHITECTURE.md       the design contract
AGENTS.md · llm.txt · llms.txt   guidance for AI agents
```

## Development

```
pnpm install
pnpm build            # internal + public packages
pnpm test             # unit tests (all packages)
pnpm build:apps       # conformance apps + docs
pnpm e2e              # Playwright against the built conformance apps
pnpm dev:conformance  # shell + remotes in development mode (HMR)
pnpm dev              # documentation site
pnpm check            # format + lint + typecheck + unit tests
```

Requirements: Node ≥ 20.19, pnpm 10. `@tecton/react` is installed from the Tecton repository as a git dependency (see `pnpm-workspace.yaml`).
