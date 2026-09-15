# React MFE Platform

A platform for independently deployed React micro-frontends and widgets that feels like writing an ordinary TanStack Router application. MFE developers write React components, file-based routes and business logic; the platform supplies Module Federation, isolated React roots, shell-owned history, CSS isolation, namespaced storage, overlay management, authentication, telemetry, runtime configuration and developer tools.

The runtime is framework-agnostic: React, TanStack Router and Tecton are adapters the
platform ships, not dependencies it has. `@platform/host` declares no peer dependencies at
all, and `test/integration/package-boundaries.test.ts` is the standing answer to "can I still
swap React?".

```
pnpm dlx @platform/cli create my-mfe   # scaffold a complete MFE
cd my-mfe && pnpm install && pnpm dev  # dev server + manifest a shell can load
```

| Package                | What it is                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@platform/mfe-react`  | MFE SDK: `createMfe`, `createWidget`, `usePlatform`, storage, commands, settings, help, release notes, breadcrumbs, telemetry, `usePlatformFetch`                                  |
| `@platform/vite`       | One Vite plugin: TanStack Router file routes, code splitting, manifest, CSS scoping, dependency sharing, Module Federation                                                         |
| `@platform/cli`        | `platform create / dev / build / manifest / validate / lint / test` and the shareable ESLint config (`@platform/cli/eslint`)                                                       |
| `@platform/host`       | Shell runtime: remote loading, version-group sharing, mounting, overlays, runtime configuration, credentials, Docker entrypoint, and the headless command / search / settings APIs |
| `@platform/host-react` | React bindings for a shell: `PlatformProvider`, host hooks, `MfeOutlet`, `WidgetSlot`, the TanStack bridge. No design system                                                       |
| `@platform/devtools`   | Developer tools panel the shell loads on demand: remotes, routes, dependency graph, diagnostics, telemetry, fault injection                                                        |

The shell's own UI — command palette, settings host, breadcrumbs, app finder — is not a
package. It lives in `apps/conformance-shell/src/components/`, built on the headless API
`@platform/host` exports, for a shell to copy and restyle.

## Repository

```
apps/docs                  documentation site (TanStack Start + Fumadocs, Tecton styles)
apps/conformance-shell     reference shell: hosts the remotes and owns the chrome in src/components
apps/conformance-*         fixture MFEs (React 19 with Tecton, React 18 without, hidden widget libraries)
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
