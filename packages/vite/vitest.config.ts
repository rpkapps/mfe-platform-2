import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "vite",
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
