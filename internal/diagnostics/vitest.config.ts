import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "diagnostics",
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
})
