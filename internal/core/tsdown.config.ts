import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  platform: "neutral",
  clean: true,
  sourcemap: true,
  checks: { pluginTimings: false },
})
