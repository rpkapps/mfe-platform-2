import { defineConfig } from "vite"
import { platform } from "@platform/vite"

// React 18 remote without Tecton: plain Tailwind, same platform plugin.
export default defineConfig({
  // The conformance runtime configuration addresses every remote as
  // 127.0.0.1 (see scripts/conformance-env.mjs) and the E2E suites wait on the
  // same host. Vite defaults `server.host` to `localhost` and leaves DNS order
  // verbatim, so on a dual-stack machine it can bind ::1 only and every
  // 127.0.0.1 request is refused.
  server: { host: "127.0.0.1", port: 4202, strictPort: true },
  preview: { port: 4202, strictPort: true },
  plugins: [platform({ tecton: false })],
})
