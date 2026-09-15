import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Valid MFE",
  routePrefix: "/valid-mfe",
  navigation: { title: "Valid MFE", keywords: ["fixture"] },
  env: { API_BASE_URL: { required: false, default: "/api", description: "API" } },
  shared: { "date-fns": { singleton: false, scope: "default" }, react: { scope: "react19" } },
  capabilities: { remove: ["notifications"] },
})
