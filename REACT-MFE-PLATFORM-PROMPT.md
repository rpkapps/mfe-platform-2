# React MFE platform implementation prompt

Build the React-only micro-frontend platform described below. Deliver a working, production-oriented implementation rather than a conceptual architecture or toy proof of concept.

The platform must provide a low-configuration developer experience that feels like building a normal TanStack Router application. MFE developers should write React components, TanStack Router folder routes, and business logic without needing to understand Module Federation, remote containers, CSS isolation, browser storage namespacing, overlay management, or shell internals.

## Core goals

Build a platform for independently deployed React MFEs and widgets with:

- TanStack Router folder-based routing
- Vite-first development and builds
- runtime remote loading
- platform-managed Module Federation 2 integration
- isolated React roots
- compatible dependency sharing by version group
- shell-owned browser history
- configurable MFE route prefixes
- native TanStack Router guards
- shell-provided platform context and capabilities
- command palette registration
- settings registration
- help registration
- release notes registration
- breadcrumbs
- Tecton-based navigation and UI
- schema-backed local/session storage
- provider-neutral telemetry
- runtime Docker configuration
- manifest URL overrides
- lazy-loaded developer tools
- strong failure isolation
- AI-friendly documentation and project structure

Use TanStack API design principles throughout:

- prefer option objects over positional arguments
- infer types and configuration whenever possible
- expose explicit overrides only when inference is insufficient
- use factory functions and composable APIs
- keep runtime contracts small and typed
- avoid hidden global state
- provide one canonical pattern for each common task
- make errors actionable
- preserve normal TanStack Router types and conventions
- make generated files inspectable but never hand-edited

## Platform monorepo

The platform should be developed in a Windows/Linux-compatible monorepo using pnpm. Consuming MFEs will live in independent repositories, but the platform monorepo should contain the platform packages, shell host runtime, documentation site, test applications, and conformance suite.

Use a structure similar to:

```text
apps/
  docs/
  conformance-shell/
  conformance-react18/
  conformance-react19/
  conformance-widget-a/
  conformance-widget-b/

packages/
  react/
  vite/
  cli/
  host/

internal/
  core/
  module-federation/
  diagnostics/
  devtools/
  conformance/
```

Keep the internal packages private unless there is a strong reason to publish them.

## Public packages

Expose the following platform packages.

### `@platform/react`

This is the MFE-facing SDK. It should provide:

- isolated MFE bootstrap
- isolated widget bootstrap
- TanStack Router integration
- shell-backed history integration
- platform context
- slice-based context subscriptions
- capability access
- permission-group helpers
- storage helpers
- command registration
- settings registration
- help registration
- release note registration
- breadcrumb metadata
- telemetry access
- mount/dispose helpers
- loading and error boundary integration
- typed contracts and runtime schemas

MFE developers should normally need only this package at runtime.

### `@platform/vite`

This is the Vite integration package. It should provide a Vite plugin that composes:

- the official TanStack Router Vite plugin
- folder-based route generation
- automatic route-tree generation
- automatic code splitting
- platform manifest generation
- capability inference
- shared dependency metadata
- CSS selector scoping
- Tecton integration
- generated isolated bootstrap code
- runtime compatibility metadata
- Module Federation configuration
- local shell manifest overrides

MFE developers should not write Module Federation configuration directly.

### `@platform/cli`

This package should provide:

```text
platform create
platform dev
platform build
platform manifest
platform validate
platform lint
platform test
```

It should be usable with:

```text
pnpm dlx @platform/cli create my-mfe
```

The CLI should generate a complete working MFE with routes, configuration, tests, examples, documentation guidance, and platform integration.

The CLI must also publish the platform's shareable ESLint plugin and flat configuration through a subpath such as `@platform/cli/eslint`. The generated MFE should install the CLI as a development dependency, generate an `eslint.config.ts` file that uses the platform rules, and add a `lint` script. MFE developers should receive the correct rules automatically when they scaffold a project and should not need to copy rule definitions manually.

### `@platform/host`

This is the shell-side runtime. It should provide:

- remote registry initialization
- runtime manifest resolution
- Module Federation initialization
- compatible dependency negotiation
- isolated remote mounting
- widget mounting
- shell-backed TanStack history
- command palette
- settings host
- help and release note slots
- global breadcrumb rendering
- centralized overlay management
- platform context
- permission preflight
- runtime configuration
- telemetry adapter integration
- diagnostics
- lazy developer tools
- failure isolation and retry behavior

## Remote loading and Module Federation

Use Module Federation 2 through the current Vite-compatible integration. Do not implement federation manually.

Module Federation must be platform infrastructure. MFE developers should not:

- write Module Federation configuration
- call `registerRemotes`
- call `loadRemote`
- configure remote containers
- configure shared dependencies manually for normal cases
- know whether the platform uses Module Federation internally

The platform should generate and manage:

- remote entries
- exposed surfaces
- remote manifests
- shared dependency declarations
- preload behavior
- retry behavior
- cache handling
- allowed origins
- protocol compatibility
- runtime version negotiation
- local-development overrides

Keep the manifest, mount/dispose, capability, diagnostic, and registration contracts independent of Module Federation so another loader can be added later.

Support HMR for local Vite development through the federation runtime. The platform's local development mode must run the shell and local remotes with development servers, connect local manifest overrides, disable or invalidate remote caching, and preserve shell state while an MFE or widget updates. HMR must keep React 18 and React 19 refresh runtimes isolated. Changes to manifests, shared dependency versions, federation configuration, or generated route trees may require a development-server restart and must produce a clear diagnostic instead of a stale or partially updated remote.

## React isolation and dependency sharing

Every MFE and widget must always render in its own isolated React root. This remains true even when dependencies are shared.

Do not pass React elements, React hooks, React contexts, or React component values across independent React roots.

Use compatible dependency sharing as a separate optimization. Each MFE should declare requested package versions through its `package.json`. The Vite plugin should infer the requested shared dependencies and emit them into the generated manifest. The host remains responsible for approved versions and actual resolution.

Support compatible version groups. For example:

- the shell uses React 19
- MFE A uses React 18
- MFE B uses React 18

The desired result is one React 19 instance for the shell and one compatible shared React 18 instance for MFE A and MFE B. React 19 must never satisfy a React 18 request. If safe version-group sharing is not possible, bundle one copy per MFE instead of forcing an invalid singleton.

Infer standard shared packages where compatible, including:

- `react`
- `react-dom`
- `@tanstack/react-router`
- `@tanstack/history`
- `@platform/react`
- `@tecton/react`

Treat React and ReactDOM as a coordinated pair. Validate Tecton JavaScript, peer dependency, CSS, and token compatibility separately.

Expose overrides through `mfe.config.ts`, including:

- disable sharing for a package
- require a specific version range
- bundle a package locally
- add or remove an inferred shared dependency
- override runtime compatibility metadata

Make the actual shared and bundled package result visible in diagnostics and developer tools.

## Vite and TanStack Router

Vite is the official build and development tool.

Use TanStack Router's official Vite plugin and folder-based routing. The default route structure should use:

```text
src/routes/__root.tsx
src/routes/index.tsx
src/routes/settings.tsx
src/routes/assets/$assetId.tsx
src/routeTree.gen.ts
```

Use TanStack Router's normal route conventions without inventing a second route DSL.

The generated Vite integration should:

- configure the TanStack Router Vite plugin
- enable automatic code splitting
- generate `routeTree.gen.ts`
- configure the inferred or overridden MFE base path
- inject the shell-backed history adapter
- inject typed platform context
- preserve normal TanStack Router route types
- preserve native `beforeLoad`, redirects, loaders, search parameters, pending states, and error components

MFE developers should define ordinary TanStack Router routes. The framework should supply the platform integration through generated bootstrap code or a thin helper such as:

```ts
createMfeRouter({
  routeTree,
})
```

Do not require MFE developers to write custom history code.

## Routing and browser history

Each MFE owns a route subtree under a configurable prefix.

The default route prefix should be inferred from `mfeId`, for example:

```text
/asset-tracker
```

Allow a typed `routePrefix` override for legacy or custom URLs.

The shell must own browser history. The MFE router must use a private TanStack history adapter backed by the shell navigation contract. The adapter should:

- delegate MFE navigation to the shell
- receive URL and popstate changes from the shell
- support push, replace, back, forward, and reload behavior
- preserve TanStack Router navigation semantics
- avoid duplicate browser-history listeners
- avoid route conflicts
- never monkeypatch `pushState`, `replaceState`, `history`, or `popstate`

The shell host boundary should remain router-neutral, but provide first-class support for TanStack Start and TanStack Router shells.

Only the shell is server-rendered. MFE route loaders and guards run on the client after the MFE mounts.

## Route guards and permissions

Do not create a second custom route-guard system.

MFE developers should use native TanStack Router behavior:

- `beforeLoad`
- redirects
- route context
- loader errors
- pending states
- not-found routes
- authorization checks

Inject a typed platform context into TanStack Router so route guards can access:

- current user
- permission groups
- tenant/project/job context
- feature flags
- approved capabilities
- runtime environment
- telemetry
- navigation

The shell may perform coarse preflight checks using manifest-declared permission groups before loading a remote. Native MFE guards should handle route-specific and resource-specific rules after mounting.

A failed MFE guard should stay inside the MFE route boundary. The shell should handle only failures that occur before or around remote loading and mounting.

Client-side permission checks are for routing and UX only. Backend services remain authoritative.

## MFE identity and manifest inference

Use:

- `mfeId` for the stable identity of an independently deployed remote
- `instanceId` for each runtime mount
- optional parent or mount context for diagnostics

Do not use `appId` as the only identity concept because some remotes are widgets or utility MFEs rather than App Finder applications.

Infer as much configuration as safely possible:

- package name to default `mfeId`
- route tree to route metadata
- route files to route prefix defaults
- framework registrations to contributed surfaces
- framework API usage to requested capabilities
- package dependencies to shared dependency requests
- entry conventions to remote entry configuration
- project metadata to release information
- absent navigation registration to `discoverable: false` when explicitly configured

Persist generated identity so changing a package display name does not silently change storage or command namespaces.

## Generated manifest

Generate a typed, versioned manifest. Do not require developers to maintain a duplicate JSON manifest.

The manifest should include:

- `mfeId`
- version
- release/build information
- protocol version
- entry and exposed surfaces
- route prefix
- route metadata
- required permission groups
- requested capabilities
- contributed commands
- contributed settings
- contributed help
- contributed release notes
- breadcrumb metadata
- `discoverable`
- enabled/load policy
- remote URL information
- requested shared dependency ranges
- actual runtime compatibility metadata
- React/runtime requirements
- Tecton and CSS protocol requirements
- safe runtime environment metadata

Support `discoverable: false`. Hidden MFEs must still be valid platform remotes and may:

- own deep-linkable routes
- be mounted as widgets
- provide commands
- provide settings
- provide help or release notes
- be loaded as dependencies

The App Finder should consume only discoverable entries.

## Mount and registration contracts

Every remote should expose a typed definition with a stable mount/dispose contract. For example:

```ts
createMfe({
  mfeId,
  routeTree,
  registrations,
})
```

The runtime should standardize:

- loading
- isolated React root creation
- platform context injection
- router creation
- error boundaries
- overlay integration
- registration cleanup
- unmount behavior
- diagnostics
- telemetry

Interactive remote surfaces must cross boundaries as metadata plus mount/dispose callbacks. Do not pass foreign React component values between roots.

The framework may wrap ordinary MFE React components automatically so developers can register components without writing manual DOM mounting code.

## Platform context

Provide a typed platform context containing:

- current user
- all available permission groups
- convenience methods such as `hasGroup`, `hasAnyGroup`, and `hasAllGroups`
- tenant context
- project context
- job context
- locale
- timezone
- theme
- feature flags
- approved capabilities
- runtime environment
- navigation
- storage
- telemetry
- release information

Expose the same context through:

- TanStack Router context
- a React hook such as `usePlatform()`
- selector-based subscriptions such as `usePlatform(selector)`

Slice subscriptions must prevent unnecessary rerenders. A component subscribed only to `user.displayName` should not rerender when unrelated theme or job context changes.

Context changes must:

- update subscribers
- invalidate dependent TanStack loaders
- allow native route guards to run again
- preserve the MFE root where possible
- avoid forcing a complete MFE remount

Permission groups should be available through the typed context. Include all groups unless the host policy explicitly restricts them. Make it clear that browser-visible permission groups do not replace backend authorization.

## Command palette

The shell owns the command palette UI. MFEs register commands through React hooks or declarative components.

Provide APIs such as:

```ts
useRegisterCommand(...)
```

and:

```tsx
<CommandRegistration definition={...} />
```

Registration must automatically clean up when the owning MFE or widget unmounts.

Developers should write local command IDs only. The framework must automatically namespace them using `mfeId` and `instanceId`.

Commands should support:

- label
- description
- group
- keywords
- shortcut
- permissions
- availability
- synchronous handlers
- asynchronous handlers
- cancellation through `AbortSignal`
- platform context
- telemetry metadata
- loading and failure states

Reject shortcut conflicts deterministically. Do not silently allow the last registration to win.

The command palette should search:

- commands
- MFE navigation metadata
- settings groups
- settings fields
- help metadata
- release-note metadata
- breadcrumbs where appropriate

Do not implement general business-data search in the first release.

## Settings

Support settings groups and individual settings fields.

Provide both:

```ts
useRegisterSettingsGroup(...)
```

and:

```tsx
<SettingsRegistration definition={...} />
```

The hook should be the primitive. The component can be a thin wrapper.

Use groups as the primary ergonomic API:

```ts
registerSettingsGroup({
  key: 'display',
  title: 'Display',
  fields: {
    density: {
      defaultValue: 'comfortable',
      schema: densitySchema,
      options: [...],
      renderer: ...
    },
  },
})
```

Also support independently registered fields for dynamically composed settings.

Do not use a bare ambiguous `value` property for the initial state. Use `defaultValue`. The framework owns the current persisted value and passes it to the renderer through a typed controller.

Infer as much as possible:

- booleans infer boolean controls
- strings infer text controls
- numbers infer numeric controls
- arrays infer multi-select when options are available
- options infer select or multi-select types
- keys infer human-readable labels
- schemas infer runtime validation behavior
- renderer types infer supported control metadata when possible

Support optional overrides:

- `label`
- `description`
- `group`
- `keywords`
- `schema`
- `options`
- `renderer`
- `serialize`
- `migrate`
- `visibleWhen`
- `disabledWhen`
- `readOnlyWhen`

Custom renderers must receive a typed controller containing:

- current value
- typed setter
- reset
- validation state
- loading state
- error state
- accessibility IDs
- dependency values where required

Renderers must not write directly to browser storage.

Support:

- boolean settings
- text settings
- numeric settings
- single-select settings
- multi-select settings
- static options
- abortable asynchronous options
- option loading state
- option errors
- retry
- caching
- stale selections
- disabled options
- validation on commit
- synchronous visibility predicates
- synchronous enabled predicates
- reset-to-default behavior

Asynchronous option providers should receive:

- typed platform capabilities
- current settings state
- an `AbortSignal`

Do not give option providers arbitrary access to shell internals or browser storage.

Migrations must be optional. When stored data is malformed or invalid:

- isolate the error to the affected setting
- run a declared migration when available
- otherwise reset the affected setting to its default
- expose a recoverable validation state
- provide a reset action
- do not crash the shell or unrelated settings

Settings registrations are lifecycle-bound. If the owning React component unmounts, the live settings registration should disappear. Do not retain stale live entries.

Support two ownership modes:

```text
managedBy: "framework"
managedBy: "mfe"
```

For framework-managed settings:

- the shell owns settings navigation and placement
- the shell owns persistence policy
- the framework owns schema validation and storage integration
- the MFE owns setting meaning, defaults, renderers, and optional migrations

For MFE-managed settings:

- the MFE owns the complete settings page
- the MFE owns state and persistence
- the MFE owns validation and migrations
- the shell owns only discovery, route placement, loading, and error boundaries
- automatic field-level search is optional and not assumed

## Storage

The shell decides the persistence implementation. The first implementation may use browser storage.

The platform storage helper must support:

```text
scope: "local" | "session"
```

Accept a Standard Schema-compatible validator and provide a first-class Zod integration.

Support typed storage APIs such as:

```ts
createPlatformStorage({
  scope: 'local',
  key: 'dashboard',
  schema,
  defaults,
})
```

and ergonomic key-level helpers.

The helper must provide:

- typed `get`
- typed `set`
- `reset`
- schema validation on reads
- schema validation on writes
- defaults
- optional migrations
- malformed data handling
- selector subscriptions
- same-tab updates
- local-storage cross-tab updates where supported
- explicit errors and diagnostics

Automatically namespace storage keys using:

- `mfeId`
- `instanceId` when needed
- local setting/store key
- selected storage scope

Developers must not use raw `window.localStorage` or `window.sessionStorage` for platform-managed data. Do not monkeypatch browser storage. Add ESLint rules and diagnostics that identify unsafe direct storage access.

## Navigation and breadcrumbs

The active MFE owns its internal navigation UI and should use Tecton components.

The shell owns:

- global chrome
- App Finder
- shell-level navigation
- global breadcrumb placement
- command palette placement
- settings placement
- help and release-note placement

Breadcrumb content should come from normal TanStack route metadata. Support:

- static labels
- dynamic labels
- typed route parameters
- loader-derived labels
- links
- loading states
- unavailable labels
- truncation
- accessible announcements
- shell entries
- MFE root entries
- nested route entries
- hidden MFE routes

Use a shell-owned breadcrumb renderer with an opt-out/custom-renderer escape hatch.

## Tecton, Tailwind, and CSS isolation

Use `@tecton/react` as the UI library.

MFE developers should be able to use ordinary Tecton components and normal Tailwind class names. They should not write framework-specific Tailwind prefixes.

Implement build-time CSS selector scoping for generated Tailwind/Tecton CSS. Scope generated selectors beneath an owner attribute such as:

```html
<div data-mfe="asset-tracker">
```

The build must scope:

- utility selectors
- component selectors
- custom properties
- keyframes where required
- theme overrides
- generated CSS from MFE code

Load shared Tecton foundation styles, fonts, and base tokens once at the shell boundary. Scope MFE-specific styles and token overrides to the MFE root.

Do not rely on naming conventions alone. Do not use Shadow DOM as the default because Tecton overlays, fonts, focus handling, and shared theming need to work normally.

## Overlay management

MFE developers should use ordinary Tecton dialogs, popovers, menus, command surfaces, and tooltips without passing overlay configuration.

The platform must provide the required Tecton portal integration through a supported provider or a narrow adapter around Tecton's underlying portal primitives. Do not monkeypatch the DOM, `document.body`, React portals, or component behavior.

Use a centralized shell overlay manager with:

- global modal ordering
- deterministic layer allocation
- owner metadata
- focus trapping
- focus restoration
- Escape-key handling
- backdrop behavior
- cleanup on unmount
- per-MFE CSS owner attributes
- per-widget instance attributes
- optional contained overlay mode

The overlay manager should create body-level owner-tagged portal roots so modals are not clipped by MFE containers while still receiving scoped styles and theme tokens.

## Telemetry

The shell provides a provider-neutral telemetry capability. The MFE framework must not import FARO or any telemetry vendor.

Provide a small typed interface supporting:

- event tracking
- errors
- spans or timed operations
- child context
- route metadata
- command metadata
- widget metadata

The shell may provide a FARO adapter or another implementation.

Automatically enrich telemetry with:

- `mfeId`
- `instanceId`
- route
- user/session correlation
- environment
- release
- command
- widget
- error boundary
- shared dependency information where useful

Telemetry must be optional. An unavailable telemetry provider must not prevent an MFE from starting.

## Runtime configuration

Build-time Vite environment variables must not be the only way to configure MFEs because values must change when a Docker container starts.

Implement a shell-owned, client-safe runtime configuration document generated at container startup by a cross-platform Node entrypoint.

Support:

- SSR-inline configuration
- same-origin JSON configuration such as `/platform-config.json`
- schema validation before platform startup
- Docker-time manifest URL changes
- per-MFE enablement
- per-MFE environment values
- local development overrides
- runtime refresh where appropriate
- cache control
- source/precedence diagnostics

The configuration should be organized by `mfeId`.

An MFE should receive only:

- its own allowlisted environment values
- explicitly shared platform values

Never expose process secrets or arbitrary server environment variables to browser code.

Use a typed allowlist and clearly classify public versus sensitive values. The shell and devtools may inspect redacted configuration, but MFE code must not receive unrelated MFE configuration.

Use a clear precedence order:

```text
explicit local override
runtime configuration
host/platform registry
generated manifest default
```

## Manifest URL overrides

The shell must support runtime and local-development manifest URL overrides per `mfeId`.

Overrides should not require source edits. Show the effective URL and its source in devtools.

Support:

- explicit local overrides
- runtime configuration overrides
- platform registry values
- generated defaults
- cache-busting
- retry
- origin validation
- preload controls

## Developer tools

Implement developer tools in the host package as a private lazy-loaded module.

Do not include React Flow or developer-tools code in the normal MFE SDK bundle. Load developer tools only in the browser when:

- a namespaced local-storage flag is enabled
- host policy permits it
- the shell is running in a supported environment

Use React Flow to visualize shared package resolution and dependency relationships.

Developer tools should expose a read-only diagnostic snapshot and live event stream showing:

- loaded MFEs
- loaded widget instances
- remote manifest URLs
- URL override sources
- route matches
- route guard state
- React versions
- TanStack Router versions
- shared packages
- bundled packages
- version-group resolution
- React Flow dependency graph
- registered commands
- shortcut conflicts
- registered settings
- breadcrumbs
- help entries
- release information
- session and current-user summary
- safe per-MFE runtime environment
- telemetry events
- loading state
- retry state
- mount state
- unmount state
- protocol errors
- compatibility errors
- boundary failures

Developer tools must be client-only, separately code-split, redacted by default, and extensible.

## Documentation site

Add a first-class documentation application to the platform monorepo.

Base it closely on:

```text
https://github.com/rpkapps/tecton-ui-1/tree/main/apps/www
```

Use:

- TanStack Start
- TanStack Router
- Vite
- Fumadocs MDX
- `@tecton/react`
- Tecton tokens
- Tecton fonts
- Tecton themes
- the same general navigation and content structure

The documentation site should use Tecton styles and feel visually consistent with the referenced Tecton documentation site.

Document:

- MFE project creation
- Vite configuration
- TanStack folder routing
- native route guards
- shell-backed history
- route prefixes
- widgets
- isolated React roots
- dependency sharing
- Module Federation platform behavior
- generated manifests
- manifest overrides
- commands
- command palette
- settings
- settings groups
- settings schemas
- async options
- storage
- custom settings pages
- platform context
- permission groups
- slice subscriptions
- telemetry
- breadcrumbs
- help
- release notes
- runtime environment
- Docker configuration
- CSS isolation
- transparent overlays
- global modal ordering
- developer tools
- App Finder-hidden MFEs
- failure handling
- retries
- troubleshooting
- migration patterns
- unsupported cases
- API reference
- generated examples

Generate and maintain:

- `AGENTS.md`
- `llm.txt`
- `llms.txt`

Use `llm.txt` for concise canonical project instructions, conventions, and common workflows.

Use `llms.txt` for a broader machine-readable documentation index containing links to API references, schemas, examples, recipes, diagnostics, and supported patterns.

## AI-friendly design

Make the platform easy for AI coding agents to understand and use.

The scaffold must generate:

- predictable file locations
- one canonical bootstrap pattern
- one canonical route pattern
- one canonical command registration pattern
- one canonical settings registration pattern
- complete typed examples
- strict TypeScript configuration
- Prettier configuration
- ESLint configuration
- unit tests
- integration tests
- Playwright E2E tests
- `AGENTS.md`
- `llm.txt`
- `llms.txt`

Use actionable diagnostics that tell developers:

- what failed
- which MFE or widget owns the failure
- which manifest or package caused it
- what override is available
- which documentation page explains the fix

Publish machine-readable schemas for:

- manifests
- runtime configuration
- capabilities
- registrations
- settings
- diagnostics
- protocol compatibility
- shared dependencies

Avoid ambiguous duplicate APIs. Prefer a small number of strongly typed APIs with good inference and explicit overrides.

## CLI scaffolding

`platform create` must generate a complete working MFE with:

- Vite configuration
- TanStack Router folder routes
- generated route tree
- isolated React bootstrap
- generated manifest
- optional `mfe.config.ts`
- Tecton integration
- Tailwind CSS selector isolation
- command palette example
- settings group example
- schema-backed storage example
- async option example
- platform context slice subscription example
- permission guard example
- telemetry example
- breadcrumb metadata example
- widget example
- help registration example
- release note registration example
- unit tests
- integration tests
- Playwright E2E tests
- Prettier
- ESLint with the platform shareable config and plugin
- generated `eslint.config.ts`
- a `lint` package script
- strict TypeScript
- `AGENTS.md`
- `llm.txt`
- `llms.txt`

The generated MFE should run without developers learning the platform internals.

## Local development

Support two local development modes:

1. Run an MFE alone using a local shell harness.
2. Run an MFE through an existing SSR shell using a generated local manifest override.

Both modes should support:

- HMR
- realistic platform context
- permission groups
- command palette
- settings
- widgets
- overlays
- route guards
- telemetry
- runtime environment
- manifest overrides

The local shell harness should make it easy to test failure states, missing capabilities, incompatible dependencies, unavailable remotes, multiple widget instances, and HMR. It should show which local remotes are connected and whether a remote is running in HMR or production-artifact mode. Production remote artifacts must not be presented as HMR-capable.

## Testing

The comprehensive test suite belongs to the platform repository. Consuming MFEs should not be required to duplicate it.

Use:

- Vitest for unit tests
- integration tests for package and runtime boundaries
- Playwright for browser E2E tests
- cross-platform Node scripts
- Windows and Linux CI

Create framework-owned fixture applications including:

- a React 19 MFE using Tecton
- a React 18 MFE without Tecton
- multiple React 19 widgets
- multiple React 18 widgets
- hidden App Finder remotes
- incompatible or failing remotes
- multiple widgets mounted at once
- widgets that open overlapping modals

Test:

- Vite plugin behavior
- HMR for local MFE and widget development
- HMR state preservation in the shell
- HMR with multiple widget instances
- HMR isolation between React 18 and React 19 remotes
- clear restart diagnostics for manifest, route-tree, federation, and shared-dependency changes
- folder-router generation
- route prefixes
- native TanStack guards
- shell-backed history
- absence of History API monkeypatching
- isolated React roots
- React 18 and React 19 coexistence
- compatible dependency sharing
- incompatible dependency fallback
- Tecton integration
- CSS selector scoping
- ordinary Tecton dialogs and popovers without MFE-side configuration
- global modal ordering
- command registration and cleanup
- shortcut conflicts
- async command handlers
- settings registration
- settings groups
- settings schemas
- settings inference
- async settings options
- settings migrations
- invalid stored settings
- reset behavior
- local/session storage
- storage namespacing
- cross-tab local-storage updates
- custom MFE-managed settings pages
- platform context
- slice subscriptions
- permission groups
- native route guards
- user/session context
- runtime environment
- telemetry
- breadcrumbs
- help
- release notes
- manifest generation
- manifest URL overrides
- runtime Docker configuration
- per-MFE environment isolation
- remote loading failures
- retry behavior
- unavailable states
- loaded MFE diagnostics
- developer-tools local-storage flag
- developer-tools lazy loading
- React Flow dependency visualization
- release metadata
- generated artifact validation
- platform ESLint rule behavior
- scaffolded lint configuration
- documentation examples

## Formatting and linting

Use Prettier consistently across the monorepo and enforce formatting in CI.

The platform must provide a versioned shareable ESLint plugin and flat configuration. The configuration should compose TypeScript, React, TanStack Router, accessibility, and platform-specific rules. `platform create` must scaffold the configuration and dependency automatically, and `platform lint` must run the same configuration used by CI.

Configure ESLint with rules for:

- strict TypeScript
- raw browser storage access
- missing registration cleanup
- invalid capability usage
- invalid manifest fields
- generated-file edits
- unsafe cross-boundary React component passing
- missing telemetry context
- invalid route-prefix configuration
- invalid MFE identity
- unsupported dependency sharing
- unsafe runtime environment access

The platform-specific rules should validate, where statically possible:

- framework registration calls and lifecycle cleanup
- stable `mfeId` and local registration keys
- settings definitions and schemas
- command definitions and shortcut metadata
- capability usage and manifest declarations
- route-prefix and folder-router conventions
- unsafe cross-root React component passing
- direct Module Federation usage from MFE application code
- direct browser storage access
- direct runtime environment access
- edits to generated manifests and route trees

The generated ESLint configuration must support typed configuration, local overrides, rule severity overrides, generated-file exclusions, and clear diagnostics that link to the relevant documentation. Add unit tests for every custom rule, fixture-based tests for valid and invalid MFE projects, and an integration test proving that `platform create` produces a project that passes linting without manual configuration.

## Error handling

Every remote boundary must have clear loading, error, unavailable, and retry states.

Isolate failures at:

- manifest loading
- manifest validation
- remote loading
- dependency negotiation
- MFE mounting
- widget mounting
- route loading
- route guards
- command handlers
- settings rendering
- async settings options
- help rendering
- release-note rendering
- telemetry
- developer tools

A failed remote, widget, command, settings field, or documentation surface must not crash the shell or unrelated MFEs.

## Explicit unsupported cases

Document these limitations clearly:

- untrusted third-party remotes require an iframe security boundary
- React elements and hooks cannot cross isolated React roots
- client-visible runtime configuration must never contain secrets
- client-side groups do not replace backend authorization
- arbitrary custom settings components cannot provide automatic field-level search without metadata or a settings schema
- raw browser storage access is outside the platform settings contract
- direct MFE-to-MFE imports are not supported
- general business-data search is not part of the first command-palette implementation
- developers must use platform APIs for platform-managed registration, storage, telemetry, and context

## Definition of done

The implementation is complete only when:

- the platform packages build successfully
- the CLI scaffolds a runnable MFE
- local MFE and widget HMR works through the platform dev command
- the generated MFE uses TanStack folder routing
- the Vite plugin generates the manifest and route tree
- Module Federation is hidden from MFE application code
- React 18 and React 19 fixtures run simultaneously
- compatible dependencies share correctly by version group
- every MFE and widget owns an isolated React root
- no History API or storage monkeypatching exists
- ordinary Tecton components work without overlay configuration
- Tailwind/Tecton styles remain isolated
- global modal ordering works across widgets
- command palette registration and cleanup work
- settings schemas, groups, options, persistence, and custom pages work
- platform context slice subscriptions work
- native TanStack guards work
- runtime Docker configuration works without rebuilding assets
- MFE manifest URLs can be overridden at runtime
- telemetry works through a provider-neutral shell adapter
- developer tools load only on demand
- React Flow shows shared dependency resolution
- the documentation site uses Tecton styles and the referenced `apps/www` structure
- `AGENTS.md`, `llm.txt`, and `llms.txt` are present and useful
- Prettier and ESLint pass
- `platform lint` passes on a freshly scaffolded MFE
- unit tests pass
- integration tests pass
- Playwright E2E tests pass on Windows and Linux
- unsupported cases and extension points are documented

Use the smallest maintainable design that satisfies these requirements. Do not add Single SPA, do not add a second router abstraction, do not require manual federation setup, and do not make MFE developers configure platform internals.
