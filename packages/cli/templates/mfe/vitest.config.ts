import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
})
