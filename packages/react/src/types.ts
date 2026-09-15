import type { ComponentType, ReactNode } from "react"
import type { AnyRoute, RouteMatch, Router } from "@tanstack/react-router"
import type {
  AnySchema,
  BreadcrumbEntry,
  CapabilityId,
  CommandDefinition,
  Disposer,
  FieldValidationState,
  HelpEntryDefinition,
  HostBridge,
  InstanceContextState,
  MountableSurface,
  MountHandle,
  MountOptions,
  PermissionHelpers,
  ReleaseNoteDefinition,
  RemoteDefinition,
  RuntimeEnvironmentInfo,
  SettingsFieldDefinition,
  SettingsGroupDefinition,
  SettingsOption,
  ShellLocation,
  Telemetry,
  WidgetHandle,
  WidgetMountOptions,
} from "@platform-internal/core"

// ---------------------------------------------------------------------------
// Typing through module augmentation (same pattern as TanStack's `Register`)
// ---------------------------------------------------------------------------

/**
 * Augment this interface to type the runtime environment and feature flags of
 * your MFE:
 *
 * ```ts
 * declare module "@platform/react" {
 *   interface Register {
 *     env: { API_BASE_URL: string }
 *     featureFlags: { "assets.bulk-edit": boolean }
 *   }
 * }
 * ```
 */
export interface Register {}

export type RegisteredEnv = Register extends { env: infer E }
  ? E
  : Record<string, string | number | boolean>

export type RegisteredFeatureFlags = Register extends { featureFlags: infer F }
  ? F
  : Record<string, boolean | string | number>

// ---------------------------------------------------------------------------
// Instance and navigation
// ---------------------------------------------------------------------------

/** Identity of the current mount (route MFE, widget or a surface of either). */
export interface MfeInstance {
  mfeId: string
  instanceId: string
  widgetId?: string
  routePrefix?: string
  displayName?: string
  host: HostBridge["host"]
}

export interface NavigateTarget {
  /** Absolute shell href (`/asset-tracker/assets/1`). */
  to?: string
  search?: string | Record<string, unknown>
  hash?: string
  replace?: boolean
  state?: unknown
}

/**
 * Navigation through the shell-owned history. `to` strings are absolute shell
 * hrefs; use `navigateWithin` for MFE-relative paths.
 */
export interface PlatformNavigation {
  navigate(to: string | NavigateTarget, options?: { replace?: boolean; state?: unknown }): void
  /** Navigate to a path relative to this MFE's route prefix (`/assets/1`). */
  navigateWithin(path: string, options?: { replace?: boolean; state?: unknown }): void
  back(): void
  forward(): void
  reload(): void
  /** Current shell location. */
  readonly location: ShellLocation
  subscribe(listener: (location: ShellLocation) => void): () => void
  /** Route prefix of this MFE, when mounted as a route MFE. */
  readonly routePrefix: string | undefined
}

// ---------------------------------------------------------------------------
// Platform context
// ---------------------------------------------------------------------------

/**
 * What `usePlatform()` returns: the instance context state plus permission
 * helpers, telemetry and navigation. Everything is plain data or functions.
 */
export interface PlatformContextValue extends Omit<
  InstanceContextState,
  "featureFlags" | "runtime"
> {
  featureFlags: RegisteredFeatureFlags
  runtime: Omit<RuntimeEnvironmentInfo, "env"> & { env: RegisteredEnv }
  permissions: PermissionHelpers
  telemetry: Telemetry
  navigation: PlatformNavigation
  capabilities: CapabilityId[]
}

/** The `platform` member of the TanStack route context (`context.platform`). */
export interface PlatformRouteContext {
  readonly user: PlatformContextValue["user"]
  readonly permissionGroups: string[]
  readonly permissions: PermissionHelpers
  readonly tenant: PlatformContextValue["tenant"]
  readonly project: PlatformContextValue["project"]
  readonly job: PlatformContextValue["job"]
  readonly locale: string
  readonly timezone: string
  readonly theme: PlatformContextValue["theme"]
  readonly resolvedTheme: PlatformContextValue["resolvedTheme"]
  readonly featureFlags: RegisteredFeatureFlags
  readonly capabilities: CapabilityId[]
  readonly runtime: PlatformContextValue["runtime"]
  readonly telemetry: Telemetry
  readonly navigation: PlatformNavigation
  readonly mfeId: string
  readonly instanceId: string
  /** Increments on every context change; loaders that read it re-run after `router.invalidate()`. */
  readonly revision: number
  getState(): PlatformContextValue
  subscribe(listener: () => void): () => void
}

/**
 * The router `createMfe` builds for a route tree. Register it so TanStack can
 * type `Route.useLoaderData()`, `Link` targets and search params across the MFE:
 *
 * ```ts
 * declare module "@tanstack/react-router" {
 *   interface Register { router: MfeRouter<typeof routeTree> }
 * }
 * ```
 */
export type MfeRouter<TRouteTree extends AnyRoute> = Router<TRouteTree, "never", false>

/** Router context shape expected by `createRootRouteWithContext<MfeRouterContext>()`. */
export interface MfeRouterContext {
  platform: PlatformRouteContext
}

// ---------------------------------------------------------------------------
// Route static data
// ---------------------------------------------------------------------------

export type BreadcrumbLabel =
  string | ((match: RouteMatch<any, any, any, any, any, any, any>) => string)

export type BreadcrumbStaticData =
  | string
  | {
      label?: BreadcrumbLabel
      /** The label depends on params / loader data and may change per navigation. */
      dynamic?: boolean
      /** Keep the entry out of the bar (announcements still include it). */
      hidden?: boolean
      /** Key of `loaderData` holding the label. */
      fromLoader?: string
    }

export interface NavigationStaticData {
  title: string
  description?: string
  icon?: string
  keywords?: string[]
  order?: number
  hidden?: boolean
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: BreadcrumbStaticData
    navigation?: NavigationStaticData
    permissionGroups?: string[]
  }
}

/** Manual breadcrumb override for the current route (`useBreadcrumb`). */
export type BreadcrumbOverride =
  string | Partial<Pick<BreadcrumbEntry, "label" | "href" | "state" | "hidden">>

// ---------------------------------------------------------------------------
// Widgets and definitions
// ---------------------------------------------------------------------------

export interface WidgetDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  id?: string
  component: ComponentType<TProps>
  /** Standard Schema validating the props the host passes (validated synchronously on mount and `setProps`). */
  propsSchema?: AnySchema<TProps>
  title?: string
  description?: string
}

export type MountKind = "mfe" | "widget" | "surface"

/** What enhancers and `wrap` receive. */
export interface MfeEnhancerContext {
  bridge: HostBridge
  instance: MfeInstance
  kind: MountKind
  /** Root element of this React root (`data-platform-root`); null for surfaces mounted by the host. */
  rootElement: HTMLElement | null
  /** Disposed with the mount: push cleanups here. */
  disposer: Disposer
  /** Per-mount cache for lazily created resources (overlay roots…). */
  cache: Map<string, unknown>
}

export interface MfeEnhancer {
  name: string
  wrap(children: ReactNode, context: MfeEnhancerContext): ReactNode
}

export interface CreateMfeOptions {
  /** Defaults to the build-time constant injected by `@platform/vite`. */
  mfeId?: string
  /** Display name shown by the shell (palette, breadcrumb root). */
  displayName?: string
  routeTree?: AnyRoute
  widgets?: Record<string, WidgetDefinition<any>> | WidgetDefinition<any>[]
  registrations?: RemoteDefinition["registrations"]
  errorComponent?: ComponentType<{ error: unknown; reset: () => void }>
  pendingComponent?: ComponentType
  notFoundComponent?: ComponentType<{ data?: unknown }>
  wrap?: (children: ReactNode, context: MfeEnhancerContext) => ReactNode
  /** Extra TanStack router options merged into `createMfeRouter`. */
  router?: Record<string, unknown>
}

export interface MfeDefinition extends RemoteDefinition {
  readonly displayName: string | undefined
  readonly routeTree: AnyRoute | undefined
  readonly widgetDefinitions: ReadonlyMap<string, WidgetDefinition<any>>
  readonly enhancers: readonly MfeEnhancer[]
  readonly options: CreateMfeOptions
  mount(options: MountOptions): MountHandle
  mountWidget(options: WidgetMountOptions): WidgetHandle
  /** Add an enhancer (used by `withTecton`); returns the same definition. */
  use(enhancer: MfeEnhancer): MfeDefinition
}

// ---------------------------------------------------------------------------
// Settings renderers and surfaces
// ---------------------------------------------------------------------------

export interface SettingsControllerOptions<TValue = unknown> {
  items: SettingsOption<TValue>[]
  loading: boolean
  error: string | null
  retry(): void
}

/** What a custom settings renderer receives. The framework owns the value. */
export interface SettingsController<TValue = unknown> {
  value: TValue
  setValue(value: TValue): void
  reset(): void
  validation: FieldValidationState
  loading: boolean
  error: string | null
  ids: { input: string; label: string; description: string; error: string }
  dependencies: Record<string, unknown>
  options?: SettingsControllerOptions<TValue>
  readOnly?: boolean
  disabled?: boolean
}

export type SettingsRenderer<TValue = unknown> = ComponentType<{
  controller: SettingsController<TValue>
}>

/**
 * A custom renderer after conversion by the SDK: the host mounts it into its
 * own element, updates the controller on every change and disposes it. This
 * is what reaches the settings registry as `field.renderer`.
 */
export interface SettingsRendererSurface<TValue = unknown> {
  readonly kind: "platform-settings-renderer"
  mount(
    container: HTMLElement,
    controller: SettingsController<TValue>
  ): { update(controller: SettingsController<TValue>): void; dispose(): void }
}

/** Settings field as MFE code writes it: the renderer is an ordinary component. */
export type SettingsFieldInput<TValue = unknown, TState = Record<string, unknown>> = Omit<
  SettingsFieldDefinition<TValue, TState>,
  "renderer"
> & {
  renderer?: SettingsRenderer<TValue> | SettingsRendererSurface<TValue>
}

export type SettingsGroupInput<
  TFields extends Record<string, SettingsFieldInput<any, any>> = Record<
    string,
    SettingsFieldInput<any, any>
  >,
> = Omit<SettingsGroupDefinition, "fields"> & { fields: TFields }

/** Independent field registration merged into the group `group`. */
export type SettingsFieldRegistration<TValue = unknown> = SettingsFieldInput<TValue> & {
  group: string | Omit<SettingsGroupDefinition, "fields">
  key: string
}

/** Help entry as MFE code writes it: `content` may be a component. */
export type HelpEntryInput = Omit<HelpEntryDefinition, "content"> & {
  content?: ComponentType | MountableSurface
}

export type ReleaseNoteInput = Omit<ReleaseNoteDefinition, "content"> & {
  content?: ComponentType | MountableSurface
}

/** Command as MFE code writes it; identical to the core definition, typed `platform`. */
export type CommandInput = Omit<CommandDefinition, "handler"> & {
  handler?: (context: {
    signal: AbortSignal
    source: "palette" | "shortcut" | "api"
    platform: PlatformContextValue
  }) => void | Promise<void>
}

export interface RegisterCommandOptions {
  /** Namespace the command with the instance id (always true for widgets). */
  instanceScoped?: boolean
}

export type { MountableSurface }
