import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "module-federation",
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
})
