import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Production Reports",
  description: "Conformance MFE: React 18, no Tecton, legacy route prefix, migrations.",
  // Legacy URL kept for deep links; the default would be /production-reports.
  routePrefix: "/legacy/reports",
  navigation: {
    title: "Production Reports",
    description: "Daily production and quarterly emissions",
    icon: "file-text",
    keywords: ["reports", "production", "emissions", "export"],
    category: "Reporting",
    order: 2,
  },
  permissionGroups: ["reports:read"],
  env: {
    API_BASE_URL: { required: true },
    EXPORT_FORMATS: { default: "csv" },
  },
})
