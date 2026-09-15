import { defineConfig } from "vite"
import { platform } from "@platform/vite"

// React 18 remote without Tecton: plain Tailwind, same platform plugin.
export default defineConfig({
  server: { port: 4202, strictPort: true },
  preview: { port: 4202, strictPort: true },
  plugins: [platform({ tecton: false })],
})
