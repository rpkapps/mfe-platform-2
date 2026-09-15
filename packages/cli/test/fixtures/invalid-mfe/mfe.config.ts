import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Invalid MFE",
  routePrefix: "/Invalid/",
  navigation: { title: "Invalid", colour: "red" },
  env: { API_TOKEN: { required: true }, API_BASE_URL: "/api" },
  shared: { react: { singleton: true, scope: "shared" }, "left-pad": true },
  capabilities: { remove: ["telemetry", "teleportation"] },
  unknownOption: true,
})
