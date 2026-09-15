export { createPlatformHost, stateForError } from "./host"
export {
  loadRuntimeConfig,
  readInlineRuntimeConfig,
  diffRuntimeConfig,
  RUNTIME_CONFIG_SCRIPT_ID,
  RUNTIME_CONFIG_URL,
} from "./runtime-config"
export type { LoadRuntimeConfigOptions } from "./runtime-config"
export {
  resolveManifestUrl,
  assertOriginAllowed,
  fetchManifest,
  createOverrideStore,
  defaultManifestUrl,
  MANIFEST_OVERRIDES_KEY,
  MANIFEST_QUERY_PREFIX,
} from "./manifests"
export {
  createBridge,
  createSettingsValuePort,
  settingsStorageKey,
  approveCapabilities,
} from "./bridge"
export { createCommandSearchIndex, collectEntries, scoreEntry, SEARCH_GROUPS } from "./search"
export type { SearchEntry, SearchResult, SearchKind, CommandSearchIndex } from "./search"
export { runCommand, createCommandRunner, commandHref, isCommandAvailable } from "./commands"
export { installShortcutListener, isEditableTarget } from "./shortcuts"
export { settingsController, readSettingsGroupValues } from "./settings-controller"
export type {
  SettingsController,
  SettingsFieldController,
  SettingsFieldState,
} from "./settings-controller"
export {
  shouldLoadDevtools,
  loadDevtools,
  decideDevtools,
  readDevtoolsFlag,
  setDevtoolsFlag,
  DEVTOOLS_FLAG_KEY,
  DEVTOOLS_QUERY,
} from "./devtools"
export type { DevtoolsDecision, DevtoolsModule, DevtoolsLoader } from "./devtools"
export { NO_FAULTS } from "./faults"
export type { HostFaults } from "./faults"
export type * from "./types"

// Core helpers a shell composes the host from (adapters, navigation, storage backends,
// errors). Re-exported so shells outside this workspace never depend on the internal package.
export {
  composeTelemetryAdapters,
  createConsoleTelemetryAdapter,
  createMemoryTelemetryAdapter,
  createTelemetry,
  noopTelemetry,
  createBrowserNavigation,
  createMemoryNavigation,
  createBrowserStorageBackend,
  createMemoryStorageBackend,
  createShellContextStore,
  createPermissionHelpers,
  PlatformError,
  isPlatformError,
  toPlatformError,
  ERROR_CODES,
  PLATFORM_PROTOCOL_VERSION,
  CAPABILITY_IDS,
  CAPABILITY_DESCRIPTIONS,
  validateManifest,
  parseRuntimeConfig,
  generateRuntimeConfig,
  shallowEqual,
  isUnderPrefix,
  parseHref,
  matchesShortcut,
  normalizeShortcut,
  announceBreadcrumbs,
  truncateBreadcrumbs,
} from "@platform-internal/core"
export type {
  Telemetry,
  TelemetryAdapter,
  TelemetryAttributes,
  TelemetryContext,
  TelemetrySpan,
  ShellNavigation,
  ShellLocation,
  StorageBackend,
  StorageScope,
  ShellContextState,
  ShellContextStore,
  PlatformUser,
  MfeManifest,
  RuntimeConfig,
  RuntimeConfigInput,
  CapabilityId,
  PlatformErrorCode,
  DiagnosticEvent,
  RegistrationOwner,
  RegisteredCommand,
  RegisteredSettingsGroup,
  NotificationPort,
  CredentialAdapter,
  CredentialPort,
  TokenRequest,
  HostBridge,
  RemoteDefinition,
  RemoteLoader,
  NavigateOptions,
  BreadcrumbEntry,
  CommandState,
  MountableSurface,
  OverlayRoot,
  RegisteredHelpEntry,
  RegisteredReleaseNote,
  SettingsOption,
} from "@platform-internal/core"
