import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { name: "conformance", environment: "node", include: ["test/**/*.test.ts"] },
})
