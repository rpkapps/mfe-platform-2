import { defineMfeConfig } from "@platform/vite/config"

// Hidden remote: not in the App Finder, no routes, still a valid platform
// remote that provides widgets, commands, help and release notes.
export default defineMfeConfig({
  displayName: "Subsurface Widgets",
  description:
    "Conformance widgets: React 19, Tecton, well summaries, production KPIs, stacked dialogs.",
  discoverable: false,
})
