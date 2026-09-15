import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { name: "widget-a", environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["./src/__tests__/setup.ts"], css: false },
})
