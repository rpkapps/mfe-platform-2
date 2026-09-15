import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { name: "legacy-reports", environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["./src/__tests__/setup.ts"], css: false },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
})
