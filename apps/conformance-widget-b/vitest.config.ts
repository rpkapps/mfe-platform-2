import { defineConfig } from "vitest/config"
import { platform } from "@platform/vite"

// The same plugin as vite.config.ts; under Vitest it only injects the MFE identity.

export default defineConfig({
  plugins: [platform()],
  test: {
    name: "widget-b",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
  },
})
