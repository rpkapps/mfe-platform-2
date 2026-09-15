import { defineMfeConfig } from "../../../src/config"

export default defineMfeConfig({
  routePrefix: "/sample",
  navigation: { title: "Sample", description: "Sample remote", icon: "box", order: 5 },
  permissionGroups: ["sample:read"],
  capabilities: { add: ["notifications"] },
  env: {
    API_BASE_URL: { required: true, description: "Backend base URL" },
    FEATURE_X: { default: false },
  },
  shared: { zod: false },
})
