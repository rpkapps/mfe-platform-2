import { defineConfig } from "tsdown"

export default defineConfig({
  // Named `devtools`, not `index`: a shell lazily imports this package, and the
  // chunk its bundler emits is named after this file. "devtools-*.js" in a
  // network panel is worth more than "dist-*.js".
  entry: { devtools: "src/index.ts" },
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
