// Runtime configuration for the conformance shell, expressed as the
// PLATFORM_* variables a Docker entrypoint would receive. Used by the E2E
// global setup and by `pnpm dev:conformance`.
export function conformanceEnv({ mode = "production", ports } = {}) {
  const p = {
    assetTracker: 4201,
    legacyReports: 4202,
    widgetA: 4203,
    widgetB: 4204,
    unavailable: 4999,
    ...ports,
  }
  const manifest = (port) => `http://127.0.0.1:${port}/platform-manifest.json`
  return {
    PLATFORM_ENVIRONMENT: mode === "production" ? "test" : "development",
    PLATFORM_RELEASE_VERSION: "0.1.0-conformance",
    PLATFORM_SHARED_SUPPORT_URL: "https://support.example.com",
    PLATFORM_ALLOWED_ORIGINS: `http://127.0.0.1:${p.assetTracker},http://127.0.0.1:${p.legacyReports},http://127.0.0.1:${p.widgetA},http://127.0.0.1:${p.widgetB},http://127.0.0.1:${p.unavailable},http://localhost:${p.assetTracker},http://localhost:${p.legacyReports},http://localhost:${p.widgetA},http://localhost:${p.widgetB}`,
    PLATFORM_DEVTOOLS_POLICY: "flag",
    PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL: manifest(p.assetTracker),
    PLATFORM_MFE_ASSET_TRACKER_ENABLED: "true",
    PLATFORM_MFE_ASSET_TRACKER_ENV_API_BASE_URL: "https://api.example.com/assets",
    PLATFORM_MFE_ASSET_TRACKER_ENV_PAGE_SIZE: "25",
    PLATFORM_MFE_ASSET_TRACKER_ENV_FEATURE_MAP: "true",
    PLATFORM_MFE_LEGACY_REPORTS_MANIFEST_URL: manifest(p.legacyReports),
    PLATFORM_MFE_LEGACY_REPORTS_ENABLED: "true",
    PLATFORM_MFE_LEGACY_REPORTS_ENV_API_BASE_URL: "https://api.example.com/reports",
    PLATFORM_MFE_LEGACY_REPORTS_ENV_EXPORT_FORMATS: "csv,xlsx",
    PLATFORM_MFE_WIDGET_A_MANIFEST_URL: manifest(p.widgetA),
    PLATFORM_MFE_WIDGET_B_MANIFEST_URL: manifest(p.widgetB),
    PLATFORM_MFE_UNAVAILABLE_REMOTE_MANIFEST_URL: manifest(p.unavailable),
    PLATFORM_MFE_DISABLED_REMOTE_ENABLED: "false",
    // Refused by the entrypoint on purpose (sensitive name); proves secrets never reach the browser.
    PLATFORM_MFE_ASSET_TRACKER_ENV_API_TOKEN: "must-never-appear",
  }
}
