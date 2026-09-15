import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "react",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
})
