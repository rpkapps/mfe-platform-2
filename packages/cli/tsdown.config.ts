import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", bin: "src/bin.ts", eslint: "src/eslint/index.ts" },
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: true,
  checks: { pluginTimings: false },
  fixedExtension: false,
  deps: { alwaysBundle: [/^@platform-internal\//] },
  banner: (chunk) => (chunk.fileName === "bin.js" ? "#!/usr/bin/env node" : undefined),
})
