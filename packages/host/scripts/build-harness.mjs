// Builds the self-contained local shell harness into dist/harness/ (cross-platform: Node only).
import { fileURLToPath } from "node:url"
import { build } from "vite"

const configFile = fileURLToPath(new URL("../src/harness/vite.config.ts", import.meta.url))

try {
  await build({ configFile, logLevel: "info" })
  console.log("Harness built into dist/harness/")
} catch (error) {
  console.error("Harness build failed:", error)
  process.exitCode = 1
}
