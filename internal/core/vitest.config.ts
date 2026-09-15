import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "core",
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
})
