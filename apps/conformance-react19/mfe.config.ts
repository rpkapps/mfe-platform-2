import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Asset Tracker",
  description: "Conformance MFE: React 19, Tecton, routes, widgets, commands, settings, storage.",
  navigation: { title: "Asset Tracker", description: "Track pumps, valves and compressors", icon: "boxes", keywords: ["assets", "equipment"], category: "Operations", order: 1 },
  permissionGroups: ["viewer"],
  env: {
    API_BASE_URL: { required: true, description: "Base URL of the assets API" },
    PAGE_SIZE: { default: 25, description: "Rows per page" },
    FEATURE_MAP: { default: false, description: "Show the map view" },
  },
})
