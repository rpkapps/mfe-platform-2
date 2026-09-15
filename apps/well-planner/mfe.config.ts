import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Well Planner",
  description:
    "Conformance MFE: React 19, Tecton, routes, widgets, commands, settings, storage.",
  navigation: {
    title: "Well Planner",
    description: "Plan wells and compare field development alternatives",
    icon: "drill",
    keywords: ["wells", "drilling", "fda", "subsurface"],
    category: "Subsurface",
    order: 1,
  },
  permissionGroups: ["viewer"],
  env: {
    API_BASE_URL: { required: true, description: "Base URL of the wells API" },
    PAGE_SIZE: { default: 25, description: "Rows per page" },
    FEATURE_MAP: { default: false, description: "Show the map view" },
  },
})
