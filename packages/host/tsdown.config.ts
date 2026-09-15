import { defineConfig } from "tsdown"

export default defineConfig([
  {
    entry: { index: "src/index.ts", testing: "src/testing.ts" },
    format: ["esm"],
    dts: true,
    platform: "browser",
    clean: true,
    sourcemap: true,
    checks: { pluginTimings: false },
    deps: {
      alwaysBundle: [/^@platform-internal\//],
      neverBundle: [/^@module-federation\//, "zod"],
    },
    copy: [{ from: "src/styles.css", to: "dist" }],
  },
  {
    entry: { entrypoint: "src/entrypoint.ts" },
    format: ["esm"],
    dts: true,
    platform: "node",
    clean: false,
    sourcemap: true,
    checks: { pluginTimings: false },
    deps: { alwaysBundle: [/^@platform-internal\//], neverBundle: ["zod"] },
    fixedExtension: false,
    banner: { js: "#!/usr/bin/env node" },
  },
])
