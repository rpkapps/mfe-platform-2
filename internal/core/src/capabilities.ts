/**
 * Capabilities are the features a host grants to a remote. A remote requests
 * them (inferred from its use of the SDK at build time, overridable in
 * mfe.config.ts); the host approves them by policy and exposes the approved set
 * through the platform context so MFEs can feature-detect.
 */
export const CAPABILITY_IDS = [
  "navigation",
  "context",
  "storage.local",
  "storage.session",
  "telemetry",
  "commands",
  "settings",
  "help",
  "release-notes",
  "breadcrumbs",
  "overlays",
  "notifications",
  "runtime-env",
  "widgets",
  "auth",
] as const

export type CapabilityId = (typeof CAPABILITY_IDS)[number]

export const CAPABILITY_DESCRIPTIONS: Record<CapabilityId, string> = {
  navigation: "Navigate through the shell-owned browser history.",
  context:
    "Read the platform context (user, groups, tenant, project, job, locale, theme, feature flags).",
  "storage.local": "Namespaced, schema-backed local storage.",
  "storage.session": "Namespaced, schema-backed session storage.",
  telemetry: "Emit events, errors and spans through the shell telemetry adapter.",
  commands: "Register command palette commands.",
  settings: "Register settings groups and fields.",
  help: "Register help entries.",
  "release-notes": "Register release notes.",
  breadcrumbs: "Publish breadcrumb entries for the shell breadcrumb bar.",
  overlays: "Render dialogs, popovers and menus into shell-managed overlay roots.",
  notifications: "Show toasts through the shell notification host.",
  "runtime-env": "Read the MFE's allow-listed runtime environment values.",
  widgets: "Expose widgets that the shell or other surfaces can mount.",
  auth: "Request an access token from the shell for calls to an authenticated backend.",
}

/** SDK API usage → capability, used by the Vite plugin's static inference. */
export const CAPABILITY_BY_API: Record<string, CapabilityId> = {
  useNavigation: "navigation",
  usePlatform: "context",
  useCapability: "context",
  usePermissions: "context",
  createPlatformStorage: "storage.local",
  usePlatformStorage: "storage.local",
  useTelemetry: "telemetry",
  useRegisterCommand: "commands",
  CommandRegistration: "commands",
  useRegisterSettingsGroup: "settings",
  useRegisterSettingsField: "settings",
  SettingsRegistration: "settings",
  useRegisterHelp: "help",
  HelpRegistration: "help",
  useRegisterReleaseNotes: "release-notes",
  ReleaseNotesRegistration: "release-notes",
  useBreadcrumb: "breadcrumbs",
  useNotifications: "notifications",
  useRuntimeEnv: "runtime-env",
  createWidget: "widgets",
  useCredentials: "auth",
  usePlatformFetch: "auth",
}

export function isCapabilityId(value: string): value is CapabilityId {
  return (CAPABILITY_IDS as readonly string[]).includes(value)
}

/** Capabilities every remote receives even without requesting them. */
export const IMPLICIT_CAPABILITIES: readonly CapabilityId[] = [
  "context",
  "navigation",
  "telemetry",
  "overlays",
]
