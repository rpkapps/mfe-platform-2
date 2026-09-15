/**
 * The shell's chrome. These components used to ship from `@platform/host`,
 * which is why that package needed React, TanStack Router and the whole Tecton
 * stack as peer dependencies. They are built entirely on the platform's
 * headless API — `createCommandSearchIndex`, `settingsController`, `runCommand`,
 * `installShortcutListener` from `@platform/host`, and the hooks from
 * `@platform/host-react` — so another shell copies them and restyles them
 * rather than depending on them.
 */
export { CommandPalette } from "./palette"
export type { CommandPaletteProps } from "./palette"
export { SettingsHost } from "./settings"
export type { SettingsHostProps } from "./settings"
export { HelpSlot, ReleaseNotesSlot } from "./surfaces"
export type { HelpSlotProps, ReleaseNotesSlotProps } from "./surfaces"
export { Breadcrumbs } from "./breadcrumbs"
export type { BreadcrumbsProps } from "./breadcrumbs"
export { AppFinder } from "./app-finder"
export type { AppFinderProps } from "./app-finder"
export { NotificationHost, createSonnerNotificationPort } from "./notifications"
export type { NotificationHostProps } from "./notifications"
export { PlatformDevtools } from "./devtools"
export type { PlatformDevtoolsProps } from "./devtools"
export { ShellOverlayProvider } from "./overlay"
export { LoadingState, RemoteErrorState } from "./status"
