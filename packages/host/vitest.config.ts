import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "host",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
})
