import { defineConfig } from "tsdown"

const neverBundle = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  /^@tanstack\//,
  /^@tecton\//,
  /^@module-federation\//,
  /^@xyflow\//,
  "react-aria-components",
  "react-aria",
  "lucide-react",
  "cn",
  "sonner",
  "zod",
  "class-variance-authority",
]

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      react: "src/react.tsx",
      tanstack: "src/tanstack.ts",
      harness: "src/harness-entry.tsx",
    },
    format: ["esm"],
    dts: true,
    platform: "browser",
    clean: true,
    sourcemap: true,
    checks: { pluginTimings: false },
    deps: { alwaysBundle: [/^@platform-internal\//], neverBundle },
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
