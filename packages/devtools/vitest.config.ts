import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "devtools",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
})
