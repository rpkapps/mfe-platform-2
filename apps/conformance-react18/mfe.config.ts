import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Legacy Reports",
  description: "Conformance MFE: React 18, no Tecton, legacy route prefix, migrations.",
  // Legacy URL kept for deep links; the default would be /legacy-reports.
  routePrefix: "/legacy/reports",
  navigation: { title: "Legacy Reports", description: "Production and emissions reports", icon: "file-text", keywords: ["reports", "export"], category: "Reporting", order: 2 },
  permissionGroups: ["reports:read"],
  env: {
    API_BASE_URL: { required: true },
    EXPORT_FORMATS: { default: "csv" },
  },
})
