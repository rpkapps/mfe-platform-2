import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// The shell owns its chrome now (src/components), so it owns the chrome's
// tests too. No platform plugin here: these are plain component tests.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    name: "conformance-shell",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
})
