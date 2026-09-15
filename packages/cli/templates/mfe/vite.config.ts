import { fileURLToPath } from "node:url"

import { platform } from "@platform/vite"
import { defineConfig } from "vite"

// The whole platform integration is one plugin call: React, TanStack Router folder routes
// (src/routes → src/routeTree.gen.ts, code splitting), Tailwind, CSS selector scoping,
// manifest generation, capability and shared-dependency inference, Module Federation and
// the development manifest (/platform-manifest.json). Options live in mfe.config.ts.
export default defineConfig({
  plugins: [platform()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
})
