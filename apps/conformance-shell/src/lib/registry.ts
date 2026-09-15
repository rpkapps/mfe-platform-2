import { MFE_IDS, PORTS, ROUTE_PREFIXES } from "@platform-internal/conformance"

/** Host/platform registry: the defaults when neither an override nor the runtime configuration names a manifest URL. */
export const registry = [
  { mfeId: MFE_IDS.assetTracker, manifestUrl: `http://127.0.0.1:${PORTS.assetTracker}/platform-manifest.json`, displayName: "Asset Tracker" },
  { mfeId: MFE_IDS.legacyReports, manifestUrl: `http://127.0.0.1:${PORTS.legacyReports}/platform-manifest.json`, displayName: "Legacy Reports", routePrefix: ROUTE_PREFIXES.legacyReports },
  { mfeId: MFE_IDS.widgetA, manifestUrl: `http://127.0.0.1:${PORTS.widgetA}/platform-manifest.json`, displayName: "Widget Library A" },
  { mfeId: MFE_IDS.widgetB, manifestUrl: `http://127.0.0.1:${PORTS.widgetB}/platform-manifest.json`, displayName: "Widget Library B" },
  { mfeId: MFE_IDS.broken, manifestUrl: "/fixtures/broken/platform-manifest.json", displayName: "Broken remote" },
  { mfeId: MFE_IDS.incompatible, manifestUrl: "/fixtures/incompatible/platform-manifest.json", displayName: "Incompatible remote" },
  { mfeId: MFE_IDS.restricted, manifestUrl: "/fixtures/restricted/platform-manifest.json", displayName: "Restricted remote" },
  { mfeId: MFE_IDS.unavailable, manifestUrl: `http://127.0.0.1:${PORTS.unavailable}/platform-manifest.json`, displayName: "Unavailable remote" },
  { mfeId: MFE_IDS.disabled, manifestUrl: `http://127.0.0.1:${PORTS.assetTracker}/platform-manifest.json`, displayName: "Disabled remote", enabled: false },
]
