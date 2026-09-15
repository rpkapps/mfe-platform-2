import { defineConfig } from "vite"
import { platform } from "@platform/vite"

export default defineConfig({
  server: { port: 4203, strictPort: true },
  preview: { port: 4203, strictPort: true },
  plugins: [platform()],
})
