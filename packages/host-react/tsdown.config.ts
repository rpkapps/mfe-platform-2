import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", tanstack: "src/tanstack.ts" },
  format: ["esm"],
  dts: true,
  platform: "browser",
  clean: true,
  sourcemap: true,
  checks: { pluginTimings: false },
  copy: [{ from: "src/styles.css", to: "dist" }],
  deps: {
    // Nothing is inlined: everything this package needs from the platform comes
    // through `@platform/host`, which is a peer because a shell must have
    // exactly one host runtime — and one copy of the core it bundles.
    neverBundle: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      /^@tanstack\//,
      /^@platform\//,
    ],
  },
})
