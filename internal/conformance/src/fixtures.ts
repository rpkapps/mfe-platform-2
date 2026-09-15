/**
 * Shared fixture data for the conformance applications and the E2E suite.
 * Everything the shell, the remotes and the tests agree on lives here so a
 * change is made once.
 */
export const PORTS = {
  shell: 4100,
  shellDev: 4110,
  assetTracker: 4201,
  legacyReports: 4202,
  widgetA: 4203,
  widgetB: 4204,
  /** Nothing listens here: the "unavailable remote" fixture. */
  unavailable: 4999,
} as const

export const MFE_IDS = {
  assetTracker: "asset-tracker",
  legacyReports: "legacy-reports",
  widgetA: "widget-a",
  widgetB: "widget-b",
  broken: "broken-remote",
  incompatible: "incompatible-remote",
  unavailable: "unavailable-remote",
  disabled: "disabled-remote",
  restricted: "restricted-remote",
} as const

export const ROUTE_PREFIXES = {
  assetTracker: "/asset-tracker",
  /** Legacy URL kept through a `routePrefix` override. */
  legacyReports: "/legacy/reports",
} as const

export interface FixtureUser {
  id: string
  displayName: string
  email: string
  groups: string[]
}

export const USERS: Record<"admin" | "viewer" | "restricted", FixtureUser> = {
  admin: { id: "u-admin", displayName: "Ada Lovelace", email: "ada@example.com", groups: ["viewer", "assets:read", "assets:write", "reports:read", "reports:export", "admin"] },
  viewer: { id: "u-viewer", displayName: "Grace Hopper", email: "grace@example.com", groups: ["viewer", "assets:read", "reports:read"] },
  restricted: { id: "u-restricted", displayName: "Guest User", email: "guest@example.com", groups: ["viewer"] },
}

export const TENANT = { id: "t-acme", name: "Acme Energy" }
export const PROJECTS = [
  { id: "p-north", name: "North Field" },
  { id: "p-south", name: "South Field" },
]
export const JOBS = [
  { id: "j-1001", name: "Well 1001 workover", status: "active" },
  { id: "j-1002", name: "Well 1002 survey", status: "planned" },
]

export const FEATURE_FLAGS = { "assets.bulk-edit": true, "reports.beta-charts": false, "shell.new-nav": true }

export interface Asset {
  id: string
  name: string
  status: "online" | "offline" | "maintenance"
  site: string
}

export const ASSETS: Asset[] = [
  { id: "pump-42", name: "Pump 42", status: "online", site: "North Field" },
  { id: "valve-7", name: "Valve 7", status: "maintenance", site: "North Field" },
  { id: "compressor-3", name: "Compressor 3", status: "offline", site: "South Field" },
]

export interface Report {
  id: string
  title: string
  owner: string
}

export const REPORTS: Report[] = [
  { id: "daily-production", title: "Daily production", owner: "operations" },
  { id: "quarterly-emissions", title: "Quarterly emissions", owner: "hse" },
]

/** Runtime environment values the shell passes to each MFE (public by contract). */
export const RUNTIME_ENV = {
  [MFE_IDS.assetTracker]: { API_BASE_URL: "https://api.example.com/assets", PAGE_SIZE: 25, FEATURE_MAP: true },
  [MFE_IDS.legacyReports]: { API_BASE_URL: "https://api.example.com/reports", EXPORT_FORMATS: "csv,xlsx" },
} as const

/** Stable `data-testid` values shared by apps and tests. */
export const TEST_IDS = {
  shell: {
    root: "shell-root",
    userName: "shell-user-name",
    themeToggle: "shell-theme-toggle",
    userSwitch: "shell-user-switch",
    projectSwitch: "shell-project-switch",
    breadcrumbs: "shell-breadcrumbs",
    paletteTrigger: "shell-palette-trigger",
    paletteInput: "shell-palette-input",
    paletteResults: "shell-palette-results",
    appFinder: "shell-app-finder",
    outlet: "shell-outlet",
    outletState: "shell-outlet-state",
    devtoolsToggle: "platform-devtools-toggle",
    devtoolsPanel: "platform-devtools-panel",
    notifications: "shell-notifications",
    settingsHost: "shell-settings-host",
    helpSlot: "shell-help-slot",
    releaseNotesSlot: "shell-release-notes-slot",
    counter: "shell-counter",
  },
  assetTracker: {
    root: "asset-tracker-root",
    reactVersion: "asset-tracker-react-version",
    userName: "asset-tracker-user-name",
    renderCount: "asset-tracker-render-count",
    themeValue: "asset-tracker-theme",
    counter: "asset-tracker-counter",
    storageColumns: "asset-tracker-storage-columns",
    storageAdd: "asset-tracker-storage-add",
    storageReset: "asset-tracker-storage-reset",
    openDialog: "asset-tracker-open-dialog",
    dialog: "asset-tracker-dialog",
    guardMessage: "asset-tracker-guard-message",
    assetTitle: "asset-tracker-asset-title",
    hmrLabel: "asset-tracker-hmr-label",
    envValue: "asset-tracker-env-value",
    telemetryButton: "asset-tracker-telemetry",
    navSettings: "asset-tracker-nav-settings",
    navAssets: "asset-tracker-nav-assets",
    customSettings: "asset-tracker-custom-settings",
    customSettingsValue: "asset-tracker-custom-settings-value",
  },
  legacyReports: {
    root: "legacy-reports-root",
    reactVersion: "legacy-reports-react-version",
    counter: "legacy-reports-counter",
    openModal: "legacy-reports-open-modal",
    modal: "legacy-reports-modal",
    guardMessage: "legacy-reports-guard-message",
    reportTitle: "legacy-reports-report-title",
    hmrLabel: "legacy-reports-hmr-label",
    storageValue: "legacy-reports-storage-value",
    envValue: "legacy-reports-env-value",
  },
  widgets: {
    assetCard: "widget-asset-card",
    assetCardOpen: "widget-asset-card-open",
    assetCardDialog: "widget-asset-card-dialog",
    kpiTile: "widget-kpi-tile",
    modalWidget: "widget-modal",
    modalWidgetOpen: "widget-modal-open",
    modalWidgetDialog: "widget-modal-dialog",
    modalWidgetNested: "widget-modal-nested-open",
    modalWidgetNestedDialog: "widget-modal-nested-dialog",
    counterWidget: "widget-counter",
    counterWidgetIncrement: "widget-counter-increment",
    counterWidgetValue: "widget-counter-value",
    stackedModal: "widget-stacked-modal",
    stackedModalOpen: "widget-stacked-modal-open",
    stackedModalDialog: "widget-stacked-modal-dialog",
    reportSummary: "widget-report-summary",
    hmrLabel: "widget-hmr-label",
  },
} as const

export const DOCS_ORIGIN = "https://platform.docs.local"
