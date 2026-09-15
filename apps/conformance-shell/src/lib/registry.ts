import { MFE_IDS, PORTS, ROUTE_PREFIXES } from "@platform-internal/conformance"

/** Host/platform registry: the defaults when neither an override nor the runtime configuration names a manifest URL. */
export const registry = [
  {
    mfeId: MFE_IDS.wellPlanner,
    manifestUrl: `http://127.0.0.1:${PORTS.wellPlanner}/platform-manifest.json`,
    displayName: "Well Planner",
  },
  {
    mfeId: MFE_IDS.productionReports,
    manifestUrl: `http://127.0.0.1:${PORTS.productionReports}/platform-manifest.json`,
    displayName: "Production Reports",
    routePrefix: ROUTE_PREFIXES.productionReports,
  },
  {
    mfeId: MFE_IDS.subsurfaceWidgets,
    manifestUrl: `http://127.0.0.1:${PORTS.subsurfaceWidgets}/platform-manifest.json`,
    displayName: "Subsurface Widgets",
  },
  {
    mfeId: MFE_IDS.fieldWidgets,
    manifestUrl: `http://127.0.0.1:${PORTS.fieldWidgets}/platform-manifest.json`,
    displayName: "Field Widgets",
  },
  {
    mfeId: MFE_IDS.broken,
    manifestUrl: "/fixtures/broken/platform-manifest.json",
    displayName: "Broken remote",
  },
  {
    mfeId: MFE_IDS.incompatible,
    manifestUrl: "/fixtures/incompatible/platform-manifest.json",
    displayName: "Incompatible remote",
  },
  {
    mfeId: MFE_IDS.restricted,
    manifestUrl: "/fixtures/restricted/platform-manifest.json",
    displayName: "Restricted remote",
  },
  {
    mfeId: MFE_IDS.unavailable,
    manifestUrl: `http://127.0.0.1:${PORTS.unavailable}/platform-manifest.json`,
    displayName: "Unavailable remote",
  },
  {
    mfeId: MFE_IDS.disabled,
    manifestUrl: `http://127.0.0.1:${PORTS.wellPlanner}/platform-manifest.json`,
    displayName: "Disabled remote",
    enabled: false,
  },
]
