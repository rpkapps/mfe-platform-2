import { defineMfeConfig } from "@platform/vite/config"

// Hidden remote: not in the App Finder, no routes, still a valid platform
// remote that provides widgets, commands, help and release notes.
export default defineMfeConfig({
  displayName: "Widget Library A",
  description: "Conformance widgets: React 19, Tecton, overlapping modals, KPI tiles.",
  discoverable: false,
})
