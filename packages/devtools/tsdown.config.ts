import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  platform: "browser",
  clean: true,
  sourcemap: true,
  checks: { pluginTimings: false },
  copy: [{ from: "src/styles.css", to: "dist" }],
  deps: {
    alwaysBundle: [/^@platform-internal\//],
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      /^@xyflow\//,
      /^@tecton\//,
      "react-aria-components",
      "lucide-react",
      "cn",
      "class-variance-authority",
    ],
  },
})
