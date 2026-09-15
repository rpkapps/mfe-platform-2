import { defineConfig } from "vite"
import { platform } from "@platform/vite"

// The whole platform integration is one plugin call: TanStack Router file
// routes, code splitting, manifest, CSS scoping, Tecton and federation.
export default defineConfig({
  // The conformance runtime configuration addresses every remote as
  // 127.0.0.1 (see scripts/conformance-env.mjs) and the E2E suites wait on the
  // same host. Vite defaults `server.host` to `localhost` and leaves DNS order
  // verbatim, so on a dual-stack machine it can bind ::1 only and every
  // 127.0.0.1 request is refused.
  server: { host: "127.0.0.1", port: 4201, strictPort: true },
  preview: { port: 4201, strictPort: true },
  plugins: [platform()],
})
