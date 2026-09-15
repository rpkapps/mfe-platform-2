import { defineConfig } from "vite"
import { platform } from "@platform/vite"

export default defineConfig({
  server: { port: 4204, strictPort: true },
  preview: { port: 4204, strictPort: true },
  plugins: [platform({ tecton: false })],
})
