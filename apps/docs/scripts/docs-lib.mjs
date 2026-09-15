// Shared helpers for docs:generate and docs:check (Node, cross-platform).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const repoRoot = resolve(appRoot, "../..")
export const contentDir = join(appRoot, "content", "docs")
export const coreSchemasDir = join(repoRoot, "internal", "core", "schemas")
export const publicSchemasDir = join(appRoot, "public", "schemas")
export const generatedDir = join(contentDir, "reference", "generated")
export const DOCS_ORIGIN = "https://platform.docs.local"

/** Load the built core package (ERROR_CODES, capabilities…). */
export async function loadCore() {
  try {
    return await import("@platform-internal/core")
  } catch (error) {
    throw new Error(
      `Could not import @platform-internal/core (build it first: pnpm --filter @platform-internal/core build).\n${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/** Frontmatter of an MDX file: `title`, `description` (quotes stripped). */
export function readFrontmatter(file) {
  const text = readFileSync(file, "utf8")
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const data = {}
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
      if (!m) continue
      let value = m[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      data[m[1]] = value
    }
  }
  return { data, body: match ? text.slice(match[0].length) : text }
}

export function readMeta(dir) {
  const file = join(dir, "meta.json")
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, "utf8"))
}

/**
 * Walk the content tree in meta.json order. Yields
 * `{ type: "separator", name }` and `{ type: "page", file, url, title, description, depth }`.
 * Folders contribute their index page first, then their pages.
 */
export function walkContent(dir = contentDir, urlBase = "/docs", depth = 0) {
  const items = []
  const meta = readMeta(dir)
  const entries =
    meta?.pages ??
    readdirSync(dir)
      .filter((name) => name !== "meta.json")
      .sort()
  for (const entry of entries) {
    const separator = entry.match(/^---(.*)---$/)
    if (separator) {
      items.push({ type: "separator", name: separator[1].trim() })
      continue
    }
    if (entry === "..." || entry.startsWith("[") || entry.startsWith("!")) continue
    const name = entry.replace(/\.mdx$/, "")
    const file = join(dir, `${name}.mdx`)
    const folder = join(dir, name)
    if (existsSync(file)) {
      const { data } = readFrontmatter(file)
      const url = name === "index" ? urlBase : `${urlBase}/${name}`
      items.push({
        type: "page",
        file,
        url,
        title: data.title ?? name,
        description: data.description ?? "",
        depth,
      })
    } else if (existsSync(folder) && statSync(folder).isDirectory()) {
      const folderMeta = readMeta(folder)
      items.push({ type: "folder", name: folderMeta?.title ?? name, url: `${urlBase}/${name}` })
      items.push(...walkContent(folder, `${urlBase}/${name}`, depth + 1))
    } else {
      items.push({ type: "missing", entry, dir })
    }
  }
  return items
}

/** Every .mdx file under the content directory (absolute paths). */
export function listMdxFiles(dir = contentDir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...listMdxFiles(path))
    else if (name.endsWith(".mdx")) files.push(path)
  }
  return files
}

/** Resolve a docs URL (`/docs/a/b`) to its MDX file, or null. */
export function pageFileFor(url) {
  const rel = url.replace(/^\/docs\/?/, "")
  if (rel === "") return join(contentDir, "index.mdx")
  const direct = join(contentDir, `${rel}.mdx`)
  if (existsSync(direct)) return direct
  const index = join(contentDir, rel, "index.mdx")
  if (existsSync(index)) return index
  return null
}

/**
 * Heading slugs as produced by fumadocs' remark-heading plugin (github-slugger):
 * lowercase, punctuation removed, every space replaced by one hyphen.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-")
}

/** Heading ids of an MDX body (fenced code blocks skipped; `[#custom]` suffixes honoured). */
export function headingIds(body) {
  const ids = new Set()
  const counts = new Map()
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (!match) continue
    let text = match[1]
    let id
    const custom = text.match(/\s*\[#([^\]]+)\]\s*$/)
    if (custom) {
      id = custom[1]
      text = text.slice(0, custom.index)
    } else {
      id = slugify(
        text
          .replace(/`/g, "")
          .replace(/\*\*/g, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      )
    }
    const seen = counts.get(id) ?? 0
    counts.set(id, seen + 1)
    ids.add(seen === 0 ? id : `${id}-${seen}`)
  }
  return ids
}

export const SCHEMA_DESCRIPTIONS = {
  manifest: "Generated platform-manifest.json of a remote",
  "runtime-config": "Shell runtime configuration (platform-config.json)",
  capabilities: "Capability ids a remote may request",
  registrations: "Static contributions: commands, settings, help, release notes, widgets",
  settings: "A settings group contribution",
  diagnostics: "Diagnostic event envelope",
  "protocol-compatibility": "Host/remote protocol compatibility report",
  "shared-dependencies": "Shared dependency requests",
}

export function listSchemas() {
  const index = JSON.parse(readFileSync(join(coreSchemasDir, "index.json"), "utf8"))
  return index.schemas.map((schema) => ({
    name: schema.name,
    file: schema.file,
    description: SCHEMA_DESCRIPTIONS[schema.name] ?? schema.name,
  }))
}

/** Machine-readable documentation index. */
export function renderLlmsTxt() {
  const lines = []
  const link = (title, url, description) =>
    `- [${title}](${DOCS_ORIGIN}${url})${description ? `: ${description}` : ""}`
  lines.push("# MFE Platform")
  lines.push("")
  lines.push(
    "> Independently deployed React micro-frontends and widgets: TanStack Router folder routing, Vite builds, platform-managed Module Federation 2, isolated React roots, version-group dependency sharing, shell-owned history, schema-backed storage, provider-neutral credentials and telemetry, runtime Docker configuration, manifest overrides and developer tools the shell loads on demand. The runtime is framework-free; React, TanStack Router and Tecton are adapters it ships."
  )
  lines.push("")
  lines.push(
    "Public packages: @platform/mfe-react (MFE SDK), @platform/vite (Vite plugin), @platform/cli (scaffolding, dev, lint), @platform/host (framework-free shell runtime, no peer dependencies), @platform/host-react (its React bindings) and @platform/devtools (the panel a shell loads on demand). Shell chrome is the shell's own code, not a package. Canonical project instructions for agents: " +
      `${DOCS_ORIGIN}/llm.txt. Every platform error carries a docs URL under ${DOCS_ORIGIN}/docs/.`
  )
  let section = null
  const flush = () => {
    if (section && section.lines.length) {
      lines.push("", `## ${section.name}`, "", ...section.lines)
    }
  }
  for (const item of walkContent()) {
    if (item.type === "separator") {
      flush()
      section = { name: item.name, lines: [] }
    } else if (item.type === "page") {
      if (!section) section = { name: "Docs", lines: [] }
      section.lines.push(link(item.title, item.url, item.description))
    }
  }
  flush()
  lines.push("", "## Schemas", "")
  for (const schema of listSchemas()) {
    lines.push(
      link(
        `${schema.name}.json`,
        `/schemas/${schema.file}`,
        `${schema.description} (JSON Schema draft 2020-12)`
      )
    )
  }
  lines.push("", "## Examples", "")
  lines.push(
    link(
      "Conformance shell",
      "/docs/examples#appsconformance-shell",
      "apps/conformance-shell — TanStack Start SSR shell on @platform/host, and the reference chrome in src/components"
    )
  )
  lines.push(
    link(
      "asset-tracker (React 19, Tecton)",
      "/docs/examples#appsconformance-react19--asset-tracker",
      "apps/conformance-react19 — routes, guards, commands, settings, storage, widgets"
    )
  )
  lines.push(
    link(
      "legacy-reports (React 18)",
      "/docs/examples#appsconformance-react18--legacy-reports",
      "apps/conformance-react18 — React 18 remote on a legacy route prefix"
    )
  )
  lines.push(
    link(
      "widget-a (React 19 widgets)",
      "/docs/examples#appsconformance-widget-a--widget-a",
      "apps/conformance-widget-a — hidden widget library"
    )
  )
  lines.push(
    link(
      "widget-b (React 18 widgets)",
      "/docs/examples#appsconformance-widget-b--widget-b",
      "apps/conformance-widget-b — hidden widget library"
    )
  )
  lines.push("", "## Diagnostics", "")
  lines.push(
    link(
      "Error codes",
      "/docs/reference/generated/error-codes",
      "every PlatformError code with hint and docs link"
    )
  )
  lines.push(
    link(
      "Diagnostic events",
      "/docs/reference/diagnostics",
      "every diagnostic event type and level"
    )
  )
  lines.push(
    link(
      "Troubleshooting",
      "/docs/troubleshooting",
      "how to read a diagnostic; code → page table"
    )
  )
  lines.push("", "## Supported patterns", "")
  lines.push(
    link(
      "Project structure",
      "/docs/getting-started/project-structure",
      "one canonical pattern for bootstrap, routes, commands, settings, storage, widgets"
    )
  )
  lines.push(
    link("Recipes", "/docs/recipes", "copy-ready solutions using only the canonical APIs")
  )
  lines.push(
    link(
      "Unsupported cases",
      "/docs/unsupported-cases",
      "what the platform deliberately does not do"
    )
  )
  lines.push(
    link("AI-friendly design", "/docs/ai-friendly", "AGENTS.md, llm.txt, llms.txt, schemas")
  )
  lines.push("", "## Optional", "")
  lines.push(
    link(
      "AGENTS.md",
      "/AGENTS.md",
      "repository rules for humans and agents (in the platform monorepo)"
    )
  )
  lines.push(link("llm.txt", "/llm.txt", "concise canonical instructions"))
  return `${lines.join("\n")}\n`
}

/** Concise canonical project instructions (kept under ~250 lines). */
export function renderLlmTxt() {
  return `# MFE Platform — canonical instructions

Read this first when working on or with the platform. Full docs: ${DOCS_ORIGIN}/docs — index: ${DOCS_ORIGIN}/llms.txt

## What it is

A platform for independently deployed React micro-frontends (MFEs) and widgets. MFE developers write
ordinary TanStack Router file routes, React components and business logic. The platform owns Module
Federation 2, runtime loading, browser history, React root isolation, CSS scoping, storage namespacing,
overlays, registrations (commands, settings, help, release notes, breadcrumbs), telemetry, runtime
configuration and the mounting seam. React, TanStack Router and Tecton are adapters the platform
ships, not dependencies it has: @platform/host declares no peer dependencies, and the shell owns its
own UI.

## Packages

- @platform/mfe-react  MFE SDK (React 18 or 19): createMfe, createWidget, hooks, storage, registrations, testing
- @platform/vite   platform() Vite plugin: route tree, code splitting, manifest, inference, CSS scoping, federation
- @platform/cli    platform create | dev | build | manifest | validate | lint | test; @platform/cli/eslint
- @platform/host   framework-free shell runtime: host API, headless command/search/settings APIs, testing helpers, Docker entrypoint
- @platform/host-react   React bindings for a shell: PlatformProvider, host hooks, MfeOutlet, WidgetSlot, TanStack bridge. No design system
- @platform/devtools   developer tools panel the shell loads on demand (remotes, routes, dependency graph, diagnostics, telemetry, faults)
Shell chrome (command palette, settings host, breadcrumbs, app finder) is not a package: it lives in
apps/conformance-shell/src/components, built on the headless API, for a shell to copy and restyle.
Internal packages (@platform-internal/core, module-federation, diagnostics, conformance) are bundled; never install them.

## Non-negotiable rules

1. Every MFE and widget renders in its own React root. React elements, hooks, contexts and component values never cross roots; cross-root surfaces are metadata + mount(container) -> { dispose }.
2. The shell owns browser history. Never patch history, pushState, replaceState, popstate, localStorage, sessionStorage, document.body or React portals.
3. Module Federation is invisible to MFE code: never import @module-federation/*, never call registerRemotes/loadRemote, never write federation config.
4. Dependencies share by version group (react18 / react19 / default). React 19 never satisfies React 18. No compatible provider -> bundled copy, reported.
5. Everything platform-managed is namespaced: storage platform:<mfeId>[:<instanceId>]:<scope>:<key>, commands <mfeId>:<id>[@<instanceId>], settings <mfeId>:<key>. Write local kebab-case ids only.
6. One canonical pattern per task. Hooks are primitives; components are thin wrappers. Options objects, inference first, explicit overrides second.
7. Errors are PlatformErrors: code, owner, source, override, hint, docs URL. Codes live in ERROR_CODES (internal/core/src/errors.ts).
8. Generated files are never hand-edited: src/routeTree.gen.ts, .platform/*, platform-manifest.json, apps/docs/public/schemas/*, apps/docs/content/docs/reference/generated/*.
9. Client-side permission groups are for routing/UX only; backends authorize. Runtime configuration is public; never put secrets in it.
10. Use platform APIs for registration, storage, telemetry and context. Never raw browser storage, never import.meta.env for runtime values, never MFE-to-MFE imports.

## Creating and running an MFE

pnpm dlx @platform/cli create my-mfe   # scaffold (routes, widget, commands, settings, storage, tests, lint, AGENTS.md, llm.txt, llms.txt)
pnpm dev        # platform dev: Vite + dev manifest at http://localhost:5173/platform-manifest.json
                # load it into a shell with ?platform.override.<mfeId>=<url>, the devtools override
                # control, or runtime configuration; dev.hmr gives full HMR inside the shell
pnpm build      # platform build: dist/remoteEntry.js + dist/platform-manifest.json
pnpm manifest | pnpm validate | pnpm lint | pnpm test

## File locations (scaffold)

src/mfe.tsx                 bootstrap: export default createMfe({ routeTree, widgets, registrations })
src/routes/__root.tsx       createRootRouteWithContext<MfeRouterContext>(), staticData.breadcrumb root label
src/routes/**               TanStack file routes (relative to the route prefix); registrations next to the feature
src/routeTree.gen.ts        generated
src/widgets/*.tsx           widget components; createWidget({ component, propsSchema }) under a kebab-case key in src/mfe.tsx
src/lib/storage.ts          createPlatformStorage stores
src/lib/api.ts              data access: usePlatformFetch (shell token) + useRuntimeEnv().API_BASE_URL
src/platform.d.ts           declare module "@platform/mfe-react" { interface Register { env; featureFlags } }
                            declare module "@tanstack/react-router" { interface Register { router: MfeRouter<typeof routeTree> } }
src/__tests__/              Vitest with renderMfe / createTestBridge from @platform/mfe-react/testing
mfe.config.ts               defineMfeConfig({ ... }) overrides (routePrefix, navigation, env, shared, capabilities, css, tecton)
.platform/identity.json     { mfeId } persisted; committed
vite.config.ts              plugins: [platform()]    vitest.config.ts: the same call (identity defines only)
eslint.config.ts            platformConfig() from @platform/cli/eslint

## Canonical patterns

Bootstrap (src/mfe.tsx):
  import { createMfe, createWidget } from "@platform/mfe-react"
  import { routeTree } from "./routeTree.gen"
  export default createMfe({ routeTree, widgets: { "asset-card": createWidget({ component: AssetCard, propsSchema }) } })

Route with guard, loader, breadcrumb (src/routes/assets/$assetId.tsx):
  export const Route = createFileRoute("/assets/$assetId")({
    beforeLoad: ({ context }) => { if (!context.platform.permissions.hasGroup("assets:read")) throw redirect({ to: "/" }) },
    loader: async ({ context, params }) => { const span = context.platform.telemetry.span("asset.load"); const asset = await fetchAsset(params.assetId); span.end(); return { asset, breadcrumb: asset.name } },
    staticData: { breadcrumb: { fromLoader: "breadcrumb" }, navigation: { title: "Asset" }, permissionGroups: ["assets:read"] },
    component: AssetPage,   // Route.useLoaderData() is typed through the Register augmentation
  })

Command:
  useRegisterCommand({ id: "new-asset", label: "New asset", shortcut: "mod+shift+n", permissionGroups: ["assets:write"],
    handler: async ({ signal, platform }) => { ... } })            // or <CommandRegistration definition={...} />

Settings group (defaultValue, never value; Standard Schema / Zod):
  useRegisterSettingsGroup({ key: "display", title: "Display", fields: {
    density: { defaultValue: "comfortable", schema: z.enum(["comfortable", "compact"]), options: [...] },
    site: { defaultValue: "", options: async ({ platform, state, signal }) => [...] },
  } })                                                              // managedBy: "mfe" + route for a custom page

Storage:
  export const store = createPlatformStorage({ scope: "local", key: "dashboard", schema, defaults, version: 1, migrate })
  store.use((s) => s.columns); store.get(); store.set(...); store.setKey("columns", ...); store.reset(); store.bind({ bridge }) in tests

Widget:
  widgets: { "asset-card": createWidget({ propsSchema: z.object({ assetId: z.string() }), component: AssetCard }) }
  // shell: <WidgetSlot mfeId="asset-tracker" widgetId="asset-card" props={{ assetId }} />

Context:
  usePlatform()                        full context (user, permissionGroups, permissions, tenant, project, job, locale, timezone,
                                       theme, featureFlags, capabilities, runtime, telemetry, navigation, revision)
  usePlatform((p) => p.user?.displayName)   slice subscription (no rerender when unrelated state changes)
  usePermissions(), useCapability(id), useRuntimeEnv(), useTelemetry(), useNavigation(), useNotifications(), useMfeInstance(),
  useOverlayContainer() (portal target), useMountDisposer(), useStorageDiagnostics()
  In loaders the same context is context.platform, which also carries fetch (the loader-side usePlatformFetch)

Help / release notes: useRegisterHelp([...]), useRegisterReleaseNotes([...]); static ones via createMfe({ registrations })
Breadcrumbs: staticData.breadcrumb ("Label" | { label, dynamic, hidden, fromLoader }); useBreadcrumb(override) for manual cases
Overlays: ordinary Tecton Dialog/Popover/Menu; no configuration (withTecton PortalProvider + shell overlay manager); plain React: createPortal(el, useOverlayContainer())
Runtime env: declare in mfe.config.ts env: { API_BASE_URL: { required: true } }; type via Register; read with useRuntimeEnv()
Authentication: usePlatformFetch() is fetch + Authorization: Bearer from the shell, one 401 retry with forceRefresh, and it
  refuses any origin the shell did not allow-list. Non-ok responses come back as Responses — never swallow a status and never
  substitute stand-in data. useCredentials() gives the raw token for a client library. Both imply the auth capability, which
  @platform/vite infers. Loaders use context.platform.fetch.
Testing (@platform/mfe-react/testing): createTestBridge({ mfeId, user, permissionGroups, env, capabilities, token, credentialOrigins }), renderMfe(definition, { bridge, path }) -> { container, navigate, location, dispose }; PlatformTestProvider for hooks

## Shell (host) essentials

createPlatformHost({ runtimeConfig, navigation, registry?, context?, notifications?, credentials?, telemetry?, storage?, loader?, policy?, devtools?, hostKind? })
  -> host.remotes.{list,get,mount,mountWidget,retry,setLocalOverride,matchRoute,sharedReport,register,faults,setFault}, host.commands.{run,abort,running}, host.config.{get,subscribe,refresh}, host.snapshot()
@platform/host has NO peer dependencies: no React, no router, no design system. Headless API it exports for a shell's own UI:
  createCommandSearchIndex, SEARCH_GROUPS, scoreEntry, runCommand, createCommandRunner, commandHref, isCommandAvailable,
  installShortcutListener, settingsController, readSettingsGroupValues. @platform/host/testing has an in-memory host for testing chrome.
Credentials: implement CredentialAdapter { getToken({ audience, scopes, forceRefresh, signal }), subscribe } against the shell's IdP and pass it as
  credentials; list API origins in policy.credentialOrigins. Remotes never see the provider.
@platform/host-react: PlatformProvider (installs the shortcut listener; renderLoading/renderError dress every outlet), MfeOutlet (headless for settings owners), WidgetSlot, SurfaceMount, outletStateFor, usePlatformHost/useHostSelector/useHostDiagnostics/useSubscription/useShellLocation/useRegistryVersion
@platform/host-react/tanstack: createTanStackShellNavigation(router), mfeRouteHelpers({ host }).matchMfeForPath(pathname) in the shell's $ catch-all route
Shell chrome is the shell's own code: build the palette on createCommandSearchIndex/runCommand/installShortcutListener and the settings page on settingsController, all exported from @platform/host. apps/conformance-shell/src/components is the reference implementation to copy.
Developer tools: devtools: { ...runtimeConfig.devtools, load: () => import("@platform/devtools") } — the host never imports them.
Runtime config in an SSR shell: root loader -> server function -> .server.ts reads the entrypoint output -> loadRuntimeConfig({ inline }) on the client (apps/conformance-shell)
Manifest URL precedence: ?platform.override.<mfeId>= / localStorage["platform:manifest-overrides"] > runtime config (mfes.<id>.manifestUrl) > registry > default
Runtime config: platform-host-entrypoint --out platform-config.json [--base] [--known] [--print] from PLATFORM_* variables
  (PLATFORM_ENVIRONMENT, PLATFORM_MFE_<ID>_MANIFEST_URL|ENABLED|PRELOAD|ALLOWED_ORIGINS|ENV_<KEY>, PLATFORM_SHARED_<KEY>, PLATFORM_ALLOWED_ORIGINS, PLATFORM_DEVTOOLS_POLICY); sensitive names refused
Devtools: localStorage["platform:devtools"] = "1" + policy (flag|always|never) + environment; the shell supplies devtools.load;
  React Flow dependency graph; a Faults panel injects unavailable remotes, 404 manifests, incompatible shared deps, denied groups and withheld capabilities

## Monorepo workflows

pnpm install; pnpm build (internal/* then packages/*, tsdown -> dist/); pnpm check (format + lint + typecheck + unit tests)
pnpm test:integration; pnpm build:all && pnpm e2e (Playwright against apps/conformance-*)
pnpm --filter <pkg> build after editing a package (apps consume dist/); pnpm --filter <pkg> dev for watch mode
pnpm schemas:build (JSON Schemas from core); pnpm docs:generate (schemas, generated reference pages, llms.txt); pnpm --filter docs docs:check
New SDK hook: packages/mfe-react/src + export + CAPABILITY_BY_API in core if it implies a capability + docs page + lint rule if misuse is statically detectable
New shell chrome: apps/conformance-shell/src/components on the headless API — not a package, and not a new peer dependency
New devtools panel: packages/devtools/src/panels, registered in DEVTOOLS_TABS or by a shell through registerDevtoolsPanel
New manifest field: internal/core/src/manifest.ts + packages/vite (generation) + packages/host (consumption) + pnpm schemas:build + docs page manifests
New error: add a code to ERROR_CODES with a docs path that exists, then throw new PlatformError({ code, message, owner, source, override })

## Conventions

TypeScript strict; Prettier (no semicolons, double quotes, width 96); ESLint 9 flat config; Node scripts are .mjs (Windows + Linux).
Tecton is the UI library of the applications and the developer tools (@tecton/react); never stock Tailwind colour classes (bg-red-500) —
  use semantic tokens or Tecton palette steps. The platform packages are different: @platform/host has no peers, @platform/host-react uses
  React but no design system, internal/* imports no framework. test/integration/package-boundaries.test.ts enforces all of it.
Tests: unit next to the package, integration in test/integration, browser in test/e2e; every behaviour in docs/ARCHITECTURE.md has a test.
Every feature has a docs page under apps/docs/content/docs; error codes link to it; llms.txt is regenerated when pages change.

## Links

Docs ${DOCS_ORIGIN}/docs · Guides ${DOCS_ORIGIN}/docs/guides · Reference ${DOCS_ORIGIN}/docs/reference · Recipes ${DOCS_ORIGIN}/docs/recipes
Error codes ${DOCS_ORIGIN}/docs/reference/generated/error-codes · Schemas ${DOCS_ORIGIN}/schemas/manifest.json (+ runtime-config, capabilities, registrations, settings, diagnostics, protocol-compatibility, shared-dependencies)
Architecture contract: docs/ARCHITECTURE.md · Repository rules: AGENTS.md · Unsupported cases ${DOCS_ORIGIN}/docs/unsupported-cases
`
}
