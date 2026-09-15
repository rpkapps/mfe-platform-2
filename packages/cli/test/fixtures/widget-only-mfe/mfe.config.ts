import { defineMfeConfig } from "@platform/vite/config"

export default defineMfeConfig({
  displayName: "Widget only",
  routePrefix: "/widget-only-mfe",
  discoverable: false,
})
