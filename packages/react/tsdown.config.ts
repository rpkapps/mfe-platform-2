import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", tecton: "src/tecton.tsx", testing: "src/testing.tsx" },
  format: ["esm"],
  dts: true,
  platform: "browser",
  clean: true,
  sourcemap: true,
  checks: { pluginTimings: false },
  deps: {
    alwaysBundle: [/^@platform-internal\//],
    neverBundle: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      /^@tanstack\//,
      /^@tecton\//,
      "zod",
      "@standard-schema/spec",
    ],
  },
})
