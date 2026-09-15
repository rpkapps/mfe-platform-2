import { defineConfig } from "vitest/config"

// Package and runtime boundary tests: they import the BUILT packages
// (`dist/`) so they exercise what consumers install.
export default defineConfig({
  test: { name: "integration", environment: "node", include: ["test/integration/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 180_000 },
})
