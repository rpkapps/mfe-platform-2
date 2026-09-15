import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", config: "src/config.ts" },
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: [/^@platform-internal\//],
})
