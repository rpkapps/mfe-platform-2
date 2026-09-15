/**
 * Shared fixture data for the conformance applications and the E2E suite.
 * Everything the shell, the remotes and the tests agree on lives here so a
 * change is made once.
 *
 * The domain is subsurface field development — wells, horizons and field
 * development alternatives — matching the Tecton blocks the applications are
 * built from. It is fixture data, not a backend: realistic enough that the
 * examples read as a product, small enough to hold in one file.
 */
export const PORTS = {
  shell: 4100,
  shellDev: 4110,
  wellPlanner: 4201,
  productionReports: 4202,
  subsurfaceWidgets: 4203,
  fieldWidgets: 4204,
  /** Nothing listens here: the "unavailable remote" fixture. */
  unavailable: 4999,
} as const

export const MFE_IDS = {
  wellPlanner: "well-planner",
  productionReports: "production-reports",
  subsurfaceWidgets: "subsurface-widgets",
  fieldWidgets: "field-widgets",
  broken: "broken-remote",
  incompatible: "incompatible-remote",
  unavailable: "unavailable-remote",
  disabled: "disabled-remote",
  restricted: "restricted-remote",
} as const

export const ROUTE_PREFIXES = {
  wellPlanner: "/well-planner",
  /** Legacy URL kept through a `routePrefix` override. */
  productionReports: "/legacy/reports",
} as const

export interface FixtureUser {
  id: string
  displayName: string
  email: string
  groups: string[]
}

export const USERS: Record<"admin" | "viewer" | "restricted", FixtureUser> = {
  admin: {
    id: "u-admin",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    groups: ["viewer", "wells:read", "wells:write", "reports:read", "reports:export", "admin"],
  },
  viewer: {
    id: "u-viewer",
    displayName: "Grace Hopper",
    email: "grace@example.com",
    groups: ["viewer", "wells:read", "reports:read"],
  },
  restricted: {
    id: "u-restricted",
    displayName: "Guest User",
    email: "guest@example.com",
    groups: ["viewer"],
  },
}

export const TENANT = { id: "t-nordsee", name: "Nordsee Energy" }
/** Licences, switched from the shell's context switcher. */
export const PROJECTS = [
  { id: "pl-265", name: "PL 265 · Johan Sverdrup" },
  { id: "pl-050", name: "PL 050 · Gullfaks" },
]
/** Rig programmes, the shell's "job" context. */
export const JOBS = [
  { id: "rp-2027-elara", name: "West Elara 2027 programme", status: "active" },
  { id: "rp-2026-atlantic", name: "Deepsea Atlantic infill", status: "planned" },
]

export const FEATURE_FLAGS = {
  "wells.bulk-edit": true,
  "reports.beta-charts": false,
  "shell.new-nav": true,
}

/* -------------------------------------------------------------------------- */
/* Wells                                                                       */
/* -------------------------------------------------------------------------- */

export type WellStatus = "producing" | "drilling" | "planned" | "suspended" | "abandoned"

export type WellType = "producer" | "injector" | "exploration" | "observation"

/** Status to label and semantic tone, so every surface colours a status the same way. */
export const WELL_STATUS_META: Record<
  WellStatus,
  { label: string; tone: "success" | "info" | "secondary" | "warning" | "destructive" }
> = {
  producing: { label: "Producing", tone: "success" },
  drilling: { label: "Drilling", tone: "info" },
  planned: { label: "Planned", tone: "secondary" },
  suspended: { label: "Suspended", tone: "warning" },
  abandoned: { label: "P&A", tone: "destructive" },
}

export const WELL_TYPE_META: Record<WellType, string> = {
  producer: "Producer",
  injector: "Injector",
  exploration: "Exploration",
  observation: "Observation",
}

export const FIELDS = ["Johan Sverdrup", "Gullfaks", "Snorre", "Troll", "Oseberg"] as const

export interface Well {
  id: string
  name: string
  field: string
  type: WellType
  status: WellStatus
  /** Total depth, m MD. */
  td: number
  /** Spud date, ISO. */
  spud: string
  operator: string
  rig: string
}

export const WELLS: Well[] = [
  {
    id: "w01",
    name: "16/2-D-12 H",
    field: "Johan Sverdrup",
    type: "producer",
    status: "producing",
    td: 4820,
    spud: "2023-02-14",
    operator: "Nordsee Energy",
    rig: "Deepsea Atlantic",
  },
  {
    id: "w02",
    name: "16/2-D-14 H",
    field: "Johan Sverdrup",
    type: "producer",
    status: "drilling",
    td: 5210,
    spud: "2026-07-02",
    operator: "Nordsee Energy",
    rig: "Deepsea Atlantic",
  },
  {
    id: "w03",
    name: "16/2-E-3 AH",
    field: "Johan Sverdrup",
    type: "injector",
    status: "producing",
    td: 3960,
    spud: "2022-10-30",
    operator: "Nordsee Energy",
    rig: "Transocean Enabler",
  },
  {
    id: "w04",
    name: "16/2-E-7",
    field: "Johan Sverdrup",
    type: "observation",
    status: "suspended",
    td: 2890,
    spud: "2021-05-18",
    operator: "Nordsee Energy",
    rig: "Transocean Enabler",
  },
  {
    id: "w05",
    name: "34/10-A-12 H",
    field: "Gullfaks",
    type: "producer",
    status: "planned",
    td: 4640,
    spud: "2027-01-12",
    operator: "Nordsee Energy",
    rig: "West Elara",
  },
  {
    id: "w06",
    name: "34/10-A-14 H",
    field: "Gullfaks",
    type: "producer",
    status: "planned",
    td: 5750,
    spud: "2027-03-04",
    operator: "Nordsee Energy",
    rig: "West Elara",
  },
  {
    id: "w07",
    name: "34/10-B-3 AH",
    field: "Gullfaks",
    type: "injector",
    status: "producing",
    td: 3320,
    spud: "2019-08-22",
    operator: "Nordsee Energy",
    rig: "Gullfaks B",
  },
  {
    id: "w08",
    name: "34/10-C-21",
    field: "Gullfaks",
    type: "producer",
    status: "abandoned",
    td: 2740,
    spud: "1998-11-03",
    operator: "Nordsee Energy",
    rig: "Gullfaks C",
  },
  {
    id: "w09",
    name: "34/7-P-15",
    field: "Snorre",
    type: "producer",
    status: "producing",
    td: 6120,
    spud: "2020-04-09",
    operator: "Nordsee Energy",
    rig: "Snorre A",
  },
  {
    id: "w10",
    name: "34/7-P-19 H",
    field: "Snorre",
    type: "producer",
    status: "drilling",
    td: 6480,
    spud: "2026-08-15",
    operator: "Nordsee Energy",
    rig: "Snorre A",
  },
  {
    id: "w11",
    name: "34/7-I-4",
    field: "Snorre",
    type: "injector",
    status: "producing",
    td: 4110,
    spud: "2018-02-27",
    operator: "Nordsee Energy",
    rig: "Snorre B",
  },
  {
    id: "w12",
    name: "31/2-K-8 H",
    field: "Troll",
    type: "producer",
    status: "producing",
    td: 7350,
    spud: "2021-09-11",
    operator: "Nordsee Energy",
    rig: "Askepott",
  },
  {
    id: "w13",
    name: "31/2-K-11 AH",
    field: "Troll",
    type: "producer",
    status: "suspended",
    td: 6890,
    spud: "2017-06-30",
    operator: "Nordsee Energy",
    rig: "Askepott",
  },
  {
    id: "w14",
    name: "31/2-G-2",
    field: "Troll",
    type: "observation",
    status: "planned",
    td: 1980,
    spud: "2027-05-20",
    operator: "Nordsee Energy",
    rig: "Askeladden",
  },
  {
    id: "w15",
    name: "30/6-N-5 H",
    field: "Oseberg",
    type: "producer",
    status: "producing",
    td: 4270,
    spud: "2022-03-16",
    operator: "Nordsee Energy",
    rig: "Oseberg C",
  },
  {
    id: "w16",
    name: "30/6-N-9",
    field: "Oseberg",
    type: "injector",
    status: "drilling",
    td: 3540,
    spud: "2026-11-08",
    operator: "Nordsee Energy",
    rig: "Oseberg C",
  },
  {
    id: "w17",
    name: "30/6-X-1",
    field: "Oseberg",
    type: "exploration",
    status: "abandoned",
    td: 3180,
    spud: "2015-07-24",
    operator: "Nordsee Energy",
    rig: "Deepsea Nordkapp",
  },
  {
    id: "w18",
    name: "30/6-X-3 A",
    field: "Oseberg",
    type: "exploration",
    status: "planned",
    td: 3900,
    spud: "2027-09-01",
    operator: "Nordsee Energy",
    rig: "Deepsea Nordkapp",
  },
]

/* -------------------------------------------------------------------------- */
/* Field development alternatives                                              */
/* -------------------------------------------------------------------------- */

export type FdaStatus = "ongoing" | "nominated" | "approved" | "rejected"

export const FDA_STATUS_META: Record<
  FdaStatus,
  { label: string; tone: "info" | "success" | "secondary" | "destructive" }
> = {
  ongoing: { label: "Ongoing", tone: "info" },
  nominated: { label: "Nominated", tone: "success" },
  approved: { label: "Approved", tone: "secondary" },
  rejected: { label: "Rejected", tone: "destructive" },
}

/** Low / moderate / high, rendered as a segmented meter. */
export type Grade = "low" | "moderate" | "high"

export const GRADE_SEGMENTS: Record<Grade, number> = { low: 2, moderate: 4, high: 6 }

export interface Fda {
  id: string
  code: string
  title: string
  description: string
  status: FdaStatus
  wells: number
  updated: string
  /** Net present value, mmusd. */
  npv: number
  /** Internal rate of return, %. */
  irr: number
  /** Capital expenditure, mmusd. */
  capex: number
  /** First oil, quarter and year. */
  firstOil: string
  complexity: Grade
  risk: Grade
  emissions: Grade
}

export const FDAS: Fda[] = [
  {
    id: "fda-1-02",
    code: "FDA 1.02",
    title: "Satellite drill locations",
    description:
      "Targets a nearby accumulation drilled independently, with production routed back to a host facility.",
    status: "ongoing",
    wells: 4,
    updated: "2 days ago",
    npv: 170.3,
    irr: 20.1,
    capex: 270.5,
    firstOil: "Q2 2030",
    complexity: "moderate",
    risk: "high",
    emissions: "low",
  },
  {
    id: "fda-2-3",
    code: "FDA 2.3",
    title: "Phased tie-back",
    description:
      "Two-phase subsea tie-back to the existing host, deferring the second template until phase one production is confirmed.",
    status: "nominated",
    wells: 6,
    updated: "5 hours ago",
    npv: 350.4,
    irr: 21.0,
    capex: 220.3,
    firstOil: "Q1 2029",
    complexity: "moderate",
    risk: "low",
    emissions: "moderate",
  },
  {
    id: "fda-3-1",
    code: "FDA 3.1",
    title: "Standalone platform",
    description:
      "A dedicated wellhead platform with local processing, removing the dependency on host capacity after 2032.",
    status: "rejected",
    wells: 9,
    updated: "3 weeks ago",
    npv: 288.6,
    irr: 14.7,
    capex: 640.0,
    firstOil: "Q4 2031",
    complexity: "high",
    risk: "moderate",
    emissions: "high",
  },
]

/* -------------------------------------------------------------------------- */
/* Horizons and production                                                     */
/* -------------------------------------------------------------------------- */

export interface Horizon {
  id: string
  name: string
  formation: string
  /** True vertical depth subsea, m. */
  tvdss: number
  colour: string
}

export const HORIZONS: Horizon[] = [
  { id: "k70", name: "K70", formation: "Spekk FM Top", tvdss: 1840, colour: "#29a6a6" },
  { id: "l70", name: "L70", formation: "Are FM Top", tvdss: 2110, colour: "#4f8ef7" },
  { id: "j80", name: "J80", formation: "Melke FM Top", tvdss: 2380, colour: "#7c5cff" },
  { id: "m10", name: "M10", formation: "Garn FM Top", tvdss: 2645, colour: "#e0a33e" },
  { id: "m40", name: "M40", formation: "Ile FM Top", tvdss: 2910, colour: "#d9654b" },
  { id: "n20", name: "N20", formation: "Tofte FM Top", tvdss: 3180, colour: "#6ba84f" },
]

export interface ProductionPoint {
  /** Month, ISO year-month. */
  month: string
  /** Oil rate, bbl/d. */
  oil: number
  /** Gas rate, mmscf/d. */
  gas: number
  /** Water cut, %. */
  waterCut: number
}

export const PRODUCTION: ProductionPoint[] = [
  { month: "2026-01", oil: 41200, gas: 62.4, waterCut: 18 },
  { month: "2026-02", oil: 40850, gas: 61.9, waterCut: 19 },
  { month: "2026-03", oil: 42360, gas: 63.8, waterCut: 19 },
  { month: "2026-04", oil: 41980, gas: 63.1, waterCut: 21 },
  { month: "2026-05", oil: 39740, gas: 59.6, waterCut: 23 },
  { month: "2026-06", oil: 38620, gas: 58.2, waterCut: 24 },
  { month: "2026-07", oil: 40110, gas: 60.4, waterCut: 24 },
  { month: "2026-08", oil: 41530, gas: 62.0, waterCut: 25 },
  { month: "2026-09", oil: 42980, gas: 64.3, waterCut: 25 },
  { month: "2026-10", oil: 43640, gas: 65.1, waterCut: 26 },
  { month: "2026-11", oil: 42210, gas: 63.4, waterCut: 27 },
  { month: "2026-12", oil: 41870, gas: 62.8, waterCut: 28 },
]

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportRow {
  label: string
  value: number
  unit: string
}

export interface Report {
  id: string
  title: string
  owner: string
  period: string
  rows: ReportRow[]
}

export const REPORTS: Report[] = [
  {
    id: "daily-production",
    title: "Daily production",
    owner: "operations",
    period: "31 December 2026",
    rows: [
      { label: "Oil", value: 41870, unit: "bbl/d" },
      { label: "Gas", value: 62.8, unit: "mmscf/d" },
      { label: "Water injected", value: 28400, unit: "bbl/d" },
      { label: "Uptime", value: 99.1, unit: "%" },
    ],
  },
  {
    id: "quarterly-emissions",
    title: "Quarterly emissions",
    owner: "hse",
    period: "Q4 2026",
    rows: [
      { label: "CO₂", value: 138_400, unit: "t" },
      { label: "Methane", value: 412, unit: "t" },
      { label: "Flared gas", value: 2.7, unit: "mmscf" },
      { label: "Intensity", value: 7.4, unit: "kg/boe" },
    ],
  },
]

/** Runtime environment values the shell passes to each MFE (public by contract). */
export const RUNTIME_ENV = {
  [MFE_IDS.wellPlanner]: {
    API_BASE_URL: "https://api.example.com/wells",
    PAGE_SIZE: 25,
    FEATURE_MAP: true,
  },
  [MFE_IDS.productionReports]: {
    API_BASE_URL: "https://api.example.com/reports",
    EXPORT_FORMATS: "csv,xlsx",
  },
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
    appFinderTrigger: "shell-app-finder-trigger",
    shortcutsDialog: "shell-shortcuts-dialog",
    outlet: "shell-outlet",
    outletState: "shell-outlet-state",
    devtoolsToggle: "platform-devtools-toggle",
    devtoolsPanel: "platform-devtools-panel",
    devtoolsClose: "platform-devtools-close",
    devtoolsResize: "platform-devtools-resize",
    notifications: "shell-notifications",
    settingsHost: "shell-settings-host",
    helpSlot: "shell-help-slot",
    releaseNotesSlot: "shell-release-notes-slot",
  },
  wellPlanner: {
    root: "well-planner-root",
    reactVersion: "well-planner-react-version",
    userName: "well-planner-user-name",
    renderCount: "well-planner-render-count",
    themeValue: "well-planner-theme",
    counter: "well-planner-counter",
    storageColumns: "well-planner-storage-columns",
    storageAdd: "well-planner-storage-add",
    storageReset: "well-planner-storage-reset",
    openDialog: "well-planner-open-dialog",
    dialog: "well-planner-dialog",
    guardMessage: "well-planner-guard-message",
    wellTitle: "well-planner-well-title",
    wellSearch: "well-planner-well-search",
    wellCount: "well-planner-well-count",
    wellTable: "well-planner-well-table",
    wellEmpty: "well-planner-well-empty",
    hmrLabel: "well-planner-hmr-label",
    envValue: "well-planner-env-value",
    telemetryButton: "well-planner-telemetry",
    navSettings: "well-planner-nav-settings",
    navWells: "well-planner-nav-wells",
    customSettings: "well-planner-custom-settings",
    customSettingsValue: "well-planner-custom-settings-value",
    authFetch: "well-planner-auth-fetch",
    authFetchCrossOrigin: "well-planner-auth-fetch-cross-origin",
    authResult: "well-planner-auth-result",
  },
  productionReports: {
    root: "production-reports-root",
    reactVersion: "production-reports-react-version",
    counter: "production-reports-counter",
    openModal: "production-reports-open-modal",
    modal: "production-reports-modal",
    guardMessage: "production-reports-guard-message",
    reportTitle: "production-reports-report-title",
    hmrLabel: "production-reports-hmr-label",
    storageValue: "production-reports-storage-value",
    envValue: "production-reports-env-value",
  },
  widgets: {
    // well-planner (React 19, Tecton)
    wellSummary: "widget-well-summary",
    wellSummaryOpen: "widget-well-summary-open",
    wellSummaryDialog: "widget-well-summary-dialog",
    // subsurface-widgets (React 19, Tecton)
    productionKpi: "widget-production-kpi",
    fdaStatus: "widget-fda-status",
    fdaStatusOpen: "widget-fda-status-open",
    fdaStatusDialog: "widget-fda-status-dialog",
    fdaStatusNested: "widget-fda-status-nested-open",
    fdaStatusNestedDialog: "widget-fda-status-nested-dialog",
    // production-reports (React 18, no design system)
    reportSummary: "widget-report-summary",
    reportSummaryOpen: "widget-report-summary-open",
    exportModal: "widget-export-modal",
    exportModalOpen: "widget-export-modal-open",
    exportModalDialog: "widget-export-modal-dialog",
    // field-widgets (React 18, no design system)
    rigStatus: "widget-rig-status",
    rigStatusAdvance: "widget-rig-status-advance",
    rigStatusValue: "widget-rig-status-value",
    hmrLabel: "widget-hmr-label",
  },
} as const

export const DOCS_ORIGIN = "https://platform.docs.local"
