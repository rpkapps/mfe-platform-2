// Runtime configuration for the conformance shell, expressed as the
// PLATFORM_* variables a Docker entrypoint would receive. Used by the E2E
// global setup and by `pnpm dev:conformance`.
export function conformanceEnv({ mode = "production", ports } = {}) {
  const p = {
    wellPlanner: 4201,
    productionReports: 4202,
    subsurfaceWidgets: 4203,
    fieldWidgets: 4204,
    unavailable: 4999,
    ...ports,
  }
  const manifest = (port) => `http://127.0.0.1:${port}/platform-manifest.json`
  const origins = [p.wellPlanner, p.productionReports, p.subsurfaceWidgets, p.fieldWidgets]
  return {
    PLATFORM_ENVIRONMENT: mode === "production" ? "test" : "development",
    PLATFORM_RELEASE_VERSION: "0.1.0-conformance",
    PLATFORM_SHARED_SUPPORT_URL: "https://support.example.com",
    PLATFORM_ALLOWED_ORIGINS: [
      ...origins.map((port) => `http://127.0.0.1:${port}`),
      `http://127.0.0.1:${p.unavailable}`,
      ...origins.map((port) => `http://localhost:${port}`),
    ].join(","),
    PLATFORM_DEVTOOLS_POLICY: "flag",
    PLATFORM_MFE_WELL_PLANNER_MANIFEST_URL: manifest(p.wellPlanner),
    PLATFORM_MFE_WELL_PLANNER_ENABLED: "true",
    PLATFORM_MFE_WELL_PLANNER_ENV_API_BASE_URL: "https://api.example.com/wells",
    PLATFORM_MFE_WELL_PLANNER_ENV_PAGE_SIZE: "25",
    PLATFORM_MFE_WELL_PLANNER_ENV_FEATURE_MAP: "true",
    PLATFORM_MFE_PRODUCTION_REPORTS_MANIFEST_URL: manifest(p.productionReports),
    PLATFORM_MFE_PRODUCTION_REPORTS_ENABLED: "true",
    PLATFORM_MFE_PRODUCTION_REPORTS_ENV_API_BASE_URL: "https://api.example.com/reports",
    PLATFORM_MFE_PRODUCTION_REPORTS_ENV_EXPORT_FORMATS: "csv,xlsx",
    PLATFORM_MFE_SUBSURFACE_WIDGETS_MANIFEST_URL: manifest(p.subsurfaceWidgets),
    PLATFORM_MFE_FIELD_WIDGETS_MANIFEST_URL: manifest(p.fieldWidgets),
    PLATFORM_MFE_UNAVAILABLE_REMOTE_MANIFEST_URL: manifest(p.unavailable),
    PLATFORM_MFE_DISABLED_REMOTE_ENABLED: "false",
    // Refused by the entrypoint on purpose (sensitive name); proves secrets never reach the browser.
    PLATFORM_MFE_WELL_PLANNER_ENV_API_TOKEN: "must-never-appear",
  }
}
