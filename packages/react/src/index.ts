// Bootstrap
export { createMfe, createWidget, isRemoteDefinition } from "./mfe"
export { createMfeRouter, disposeMfeRouter, type CreateMfeRouterOptions } from "./router"
export {
  createShellHistory,
  normalizeShellHref,
  type ShellHistory,
  type ShellHistoryOptions,
} from "./history"

// Providers and boundaries
export { PlatformProvider, type PlatformProviderProps } from "./provider"
export {
  MfeErrorBoundary,
  MfeErrorFallback,
  MfeLoading,
  DefaultRouteErrorComponent,
  DefaultPendingComponent,
  DefaultNotFoundComponent,
  type MfeErrorBoundaryProps,
  type MfeErrorFallbackProps,
  type MfeLoadingProps,
} from "./boundary"

// Hooks (primitives)
export {
  usePlatform,
  useCapability,
  usePermissions,
  useRuntimeEnv,
  useMfeInstance,
  useNavigation,
  useTelemetry,
  useNotifications,
  useOverlayContainer,
  useMountDisposer,
  type PermissionsValue,
  type NavigationValue,
} from "./hooks/context"
export {
  useRegisterCommand,
  useRegisterSettingsGroup,
  useRegisterSettingsField,
  useRegisterHelp,
  useRegisterReleaseNotes,
  CommandRegistration,
  SettingsRegistration,
  HelpRegistration,
  ReleaseNotesRegistration,
  type CommandRegistrationState,
} from "./hooks/registrations"
export { useBreadcrumb, BreadcrumbPublisher, buildBreadcrumbTrail } from "./breadcrumbs"

// Storage
export {
  createPlatformStorage,
  usePlatformStorage,
  useStorageDiagnostics,
  type PlatformStorage,
  type PlatformStorageOptions,
  type StorageBinding,
} from "./storage"

// Surfaces (component → mount/dispose)
export {
  createSurface,
  createSettingsRendererSurface,
  isMountableSurface,
  isSettingsRendererSurface,
} from "./surfaces"

// Types
export type {
  Register,
  RegisteredEnv,
  RegisteredFeatureFlags,
  MfeInstance,
  NavigateTarget,
  PlatformNavigation,
  PlatformContextValue,
  PlatformRouteContext,
  MfeRouterContext,
  MfeRouter,
  BreadcrumbLabel,
  BreadcrumbStaticData,
  NavigationStaticData,
  BreadcrumbOverride,
  WidgetDefinition,
  MountKind,
  MfeEnhancer,
  MfeEnhancerContext,
  CreateMfeOptions,
  MfeDefinition,
  SettingsController,
  SettingsControllerOptions,
  SettingsRenderer,
  SettingsRendererSurface,
  SettingsFieldInput,
  SettingsGroupInput,
  SettingsFieldRegistration,
  HelpEntryInput,
  ReleaseNoteInput,
  CommandInput,
  RegisterCommandOptions,
  MountableSurface,
} from "./types"

// Core contracts MFE developers need
export {
  PlatformError,
  isPlatformError,
  toPlatformError,
  ERROR_CODES,
  PLATFORM_PROTOCOL_VERSION,
  CAPABILITY_IDS,
  shallowEqual,
  type PlatformErrorCode,
  type CapabilityId,
  type CommandDefinition,
  type CommandRunContext,
  type CommandState,
  type SettingsGroupDefinition,
  type SettingsFieldDefinition,
  type SettingsOption,
  type OptionsProvider,
  type AsyncOptionsContext,
  type FieldValidationState,
  type HelpEntryDefinition,
  type ReleaseNoteDefinition,
  type BreadcrumbEntry,
  type BreadcrumbTrail,
  type Telemetry,
  type TelemetrySpan,
  type TelemetryAttributes,
  type HostBridge,
  type RemoteDefinition,
  type MountHandle,
  type WidgetHandle,
  type MountOptions,
  type WidgetMountOptions,
  type ShellLocation,
  type ShellNavigation,
  type PlatformUser,
  type TenantContext,
  type ProjectContext,
  type JobContext,
  type Theme,
  type InstanceContextState,
  type PermissionHelpers,
  type StorageScope,
  type StorageDiagnostic,
  type StorageStore,
  type AnySchema,
  type StandardSchemaV1,
  type Disposer,
  type Equality,
} from "@platform-internal/core"
