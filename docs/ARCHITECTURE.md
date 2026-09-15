# Platform architecture and API surface

This document is the contract every package in this repository implements. Read it before changing a package boundary. The runtime contracts themselves live in `internal/core/src` (typed, tested, published as JSON Schemas).

## Packages

| Package | Role | Runtime |
| --- | --- | --- |
| `@platform-internal/core` | Loader-neutral contracts: manifest, runtime config, registrations, context, storage, telemetry, navigation, shared-dependency negotiation, overlay manager, diagnostics, errors | none (bundled into the public packages) |
| `@platform-internal/module-federation` | Module Federation 2 `RemoteLoader` for the host (`@module-federation/runtime`) | browser |
| `@platform-internal/diagnostics` | Diagnostic bus, snapshot, redaction | browser |
| `@platform-internal/devtools` | Developer tools UI, React 19 + React Flow, loaded lazily by the host | browser |
| `@platform-internal/conformance` | Shared fixtures and checks for conformance apps and E2E | node/test |
| `@platform/react` | MFE SDK (React 18 or 19) | browser |
| `@platform/vite` | Vite plugin turning a TanStack Router project into a remote | node |
| `@platform/cli` | `platform create/dev/build/manifest/validate/lint/test`, `@platform/cli/eslint` | node |
| `@platform/host` | Shell runtime (React 19), harness, Docker entrypoint | browser + node |

Internal packages are bundled into the public packages by tsdown (`noExternal`), so consumers only ever install `@platform/*`.

## Non-negotiable rules

1. Every MFE and widget renders in its own React root. React elements, hooks, contexts and component values never cross roots. Interactive remote surfaces cross as metadata plus `mount(container) → { dispose }` callbacks (`MountableSurface` in core).
2. The shell owns browser history. Remotes navigate through `ShellNavigation` (core); the SDK wraps it in a private TanStack history (`createShellHistory`). Nothing patches `pushState`, `replaceState`, `history`, `popstate`, `localStorage`, `sessionStorage`, `document.body` or React portals.
3. Module Federation is invisible to MFE code. `@platform/vite` generates the federation config; `@platform/host` calls the runtime. MFE code never imports `@module-federation/*`.
4. Dependency sharing is by version group: React-bound packages share inside the `react<major>` share scope, framework-neutral packages in `default`. React 19 never satisfies a React 18 request. No compatible provider → the remote's bundled copy is used and reported.
5. Everything platform-managed is namespaced by `mfeId` (and `instanceId` for widgets): storage keys (`platform:<mfeId>[:<instanceId>]:<scope>:<key>`), command ids (`<mfeId>:<id>[@<instanceId>]`), settings groups (`<mfeId>:<key>`).
6. One canonical pattern per task. Hooks are the primitives, components are thin wrappers. Option objects, inference first, explicit overrides second.
7. Errors are `PlatformError`s with a code, owner, source, override, hint and docs URL (`internal/core/src/errors.ts`).
8. Generated files (`routeTree.gen.ts`, `platform-manifest.json`, `.platform/*`) are inspectable and never hand-edited.

## Remote definition (what a remote exposes)

`src/mfe.tsx` default-exports `createMfe({...})`, a `RemoteDefinition` (core `remote.ts`):

```ts
interface RemoteDefinition {
  kind: "platform-remote"; protocolVersion: string; mfeId: string
  widgets: { id; title?; description? }[]; hasRoutes: boolean
  mount({ container, bridge }): MountHandle            // route MFE
  mountWidget({ container, bridge, widgetId, props }): WidgetHandle
  registrations?: { commands?; help?; releaseNotes? } // static, available before mounting
}
```

`HostBridge` (core `remote.ts`) is the only thing the host hands over: navigation, context store, capabilities, registries, breadcrumbs, storage backend, telemetry, overlay manager, diagnostics, notifications, settings value port, host flags. Plain data and functions only.

## `@platform/react` API surface

```ts
// bootstrap (src/mfe.tsx)
export default createMfe({ mfeId?, routeTree?, widgets?, registrations?, errorComponent?, pendingComponent?, notFoundComponent?, wrap?, router? })
createWidget({ id?, component, propsSchema?, title?, description? })
createMfeRouter({ routeTree, bridge, ...tanstackRouterOptions })   // used by createMfe; public for advanced cases
withTecton(definition)                                             // @platform/react/tecton: PortalProvider + theme sync, applied by the generated entry

// hooks (primitives)
usePlatform()                       // full PlatformContextValue (typed)
usePlatform(selector, equals?)      // slice subscription, no rerender when the slice is unchanged
useNavigation()                     // { navigate(href|{to,search,hash,replace}), back, forward, reload, location, subscribe }
useCapability(id)                   // boolean
usePermissions()                    // { groups, hasGroup, hasAnyGroup, hasAllGroups }
useTelemetry()                      // enriched Telemetry (mfeId, instanceId, route, widget)
useRuntimeEnv()                     // typed via Register.env
useNotifications()                  // { notify }
useMfeInstance()                    // { mfeId, instanceId, widgetId?, routePrefix?, host }
useRegisterCommand(definition, deps?)
useRegisterSettingsGroup(definition)
useRegisterSettingsField({ group, key, ...field })
useRegisterHelp(definition | definition[])
useRegisterReleaseNotes(definition | definition[])
useBreadcrumb(entry | null)         // manual override for a route's crumb
usePlatformStorage(store, selector?) // store from createPlatformStorage

// declarative wrappers (thin)
<CommandRegistration definition />  <SettingsRegistration definition />
<HelpRegistration definition />     <ReleaseNotesRegistration definition />
<MfeErrorBoundary fallback? />      <MfeLoading />

// storage
createPlatformStorage({ scope: "local" | "session", key, schema?, defaults, version?, migrate?, instanceScoped? })
  → { use(selector?), get(), set(), setKey(), reset(), subscribe() }  (bound to the current mount)

// routing conventions (native TanStack)
createFileRoute("/assets/$assetId")({
  beforeLoad: ({ context }) => { if (!context.platform.permissions.hasGroup("assets:read")) throw redirect({ to: "/" }) },
  loader: ({ context, params }) => context.platform.telemetry.span("load-asset") ...,
  staticData: { breadcrumb: "Assets" | { label, dynamic?, hidden?, fromLoader?: "title" }, navigation: { title, description?, icon?, keywords?, order?, hidden? }, permissionGroups: ["assets:read"] },
})

// route context
context.platform: { user, permissions, permissionGroups, tenant, project, job, locale, timezone, theme, featureFlags, capabilities, runtime, telemetry, navigation, getState(), subscribe(), revision }

// typing
declare module "@platform/react" { interface Register { env: { API_BASE_URL: string }; featureFlags: {...} } }

// testing (@platform/react/testing)
createTestBridge({ mfeId, user?, permissionGroups?, env?, capabilities?, navigation? })
renderMfe(definition, { bridge?, path? })
```

Context changes update subscribers, bump `revision` (TanStack loaders depend on it through route context → `router.invalidate()`), let native guards run again and never remount the root.

## `@platform/vite` behaviour

`platform(options?)` composes: `@vitejs/plugin-react`, `@tanstack/router-plugin/vite` (`target: "react"`, `autoCodeSplitting: true`, `routesDirectory: "src/routes"`, `generatedRouteTree: "src/routeTree.gen.ts"`), `@tailwindcss/vite` (when Tailwind is installed), CSS selector scoping, manifest generation, capability inference, shared dependency inference, generated entry (`.platform/entry.tsx`), `@module-federation/vite` (`name: federationName(mfeId)`, `filename: "remoteEntry.js"`, `exposes: { "./mfe": ".platform/entry.tsx" }`, `shared` from inference with `shareScope`, `manifest: true`, `dts: false`), dev endpoints (`/platform-manifest.json`, `/@platform/refresh-preamble`, `/__platform/harness/`), restart diagnostics.

Options (all optional, also accepted from `mfe.config.ts` via `defineMfeConfig`): `mfeId`, `routePrefix`, `displayName`, `description`, `discoverable`, `navigation`, `permissionGroups`, `capabilities: { add, remove }`, `shared: Record<string, boolean | { version?, bundle?, singleton?, scope? }>`, `env: Record<string, { required?, description?, default? }>`, `css: { scope?, ownerAttribute?, foundation? }`, `tecton: boolean | "auto"`, `react`, `tailwind`, `manifest: { fileName }`, `federation(config)`, `runtime: { react?: string }` (override compatibility metadata).

Identity persistence: `.platform/identity.json` (`{ mfeId }`) is created on first run and committed; a changed package name does not change `mfeId`.

## `@platform/host` behaviour

`createPlatformHost({ runtimeConfig, registry, loader?, telemetry?, storage?, navigation?, context?, policy?, devtools? })` → `PlatformHost` with: manifest resolution (precedence: explicit local override → runtime configuration → registry → generated default; URL query `?platform.override.<mfeId>=<url>` and `localStorage["platform:manifest-overrides"]` are explicit local overrides), fetch with cache control and retry, validation, origin validation, protocol check, permission preflight, loader registration, negotiation report, mounting with bridge creation, registries, overlay manager, breadcrumbs, diagnostics, devtools loader.

React 19 components (`@platform/host/react`): `PlatformProvider`, `MfeOutlet`, `WidgetSlot`, `CommandPalette`, `SettingsHost`, `HelpSlot`, `ReleaseNotesSlot`, `Breadcrumbs`, `AppFinder`, `PlatformDevtools` (lazy), `NotificationHost`. TanStack shell bridge (`@platform/host/tanstack`): `createTanStackShellNavigation(router)` and the `$`-route helper. Harness (`@platform/host/harness`): self-contained local shell built with Vite into `dist/harness/`. Entrypoint (`@platform/host/entrypoint`): Node CLI generating `platform-config.json` from `PLATFORM_*` variables.

## Local development modes

1. `platform dev` in an MFE: Vite dev server + `/__platform/harness/` (local shell harness, HMR, realistic context, failure toggles).
2. An SSR shell in dev with a manifest override pointing at `http://localhost:<port>/platform-manifest.json`; the dev manifest carries `dev.hmr = true` and the host imports `dev.refreshPreamble` before loading so React Refresh is installed per remote React instance. Production artefacts have no `dev` block and are never shown as HMR-capable.

Restart-requiring changes (manifest-affecting config, shared versions, federation config, route tree regeneration) change `dev.configHash`; the host and harness show a restart diagnostic instead of a stale remote.
