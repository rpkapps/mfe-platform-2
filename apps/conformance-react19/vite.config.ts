import { defineConfig } from "vite"
import { platform } from "@platform/vite"

// The whole platform integration is one plugin call: TanStack Router file
// routes, code splitting, manifest, CSS scoping, Tecton and federation.
export default defineConfig({
  server: { port: 4201, strictPort: true },
  preview: { port: 4201, strictPort: true },
  plugins: [platform()],
})
