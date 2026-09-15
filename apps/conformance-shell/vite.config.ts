import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// The conformance shell: a server-rendered TanStack Start application that
// hosts the platform. Only the shell is SSR; remotes mount on the client.
export default defineConfig({
  // The conformance runtime configuration addresses every remote as
  // 127.0.0.1 (see scripts/conformance-env.mjs) and the E2E suites wait on the
  // same host. Vite defaults `server.host` to `localhost` and leaves DNS order
  // verbatim, so on a dual-stack machine it can bind ::1 only and every
  // 127.0.0.1 request is refused.
  server: { host: "127.0.0.1", port: 4110, strictPort: true },
  preview: { host: "127.0.0.1" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // `@platform/host` is a workspace link here (source, not pre-bundled), so its
  // Tecton portal adapter reaches `react-aria` from inside node_modules where
  // Vite's dev optimizer does not discover it. An installed `@platform/host` is
  // pre-bundled together with its dependencies and needs no such entry.
  optimizeDeps: { include: ["@tecton/react > react-aria"] },
  build: {
    // The shell compiles React, TanStack Start, Tecton and the platform host
    // into one entry on purpose; routes and the developer tools are the parts
    // that code-split. The default 500 kB hint only ever fires on that entry.
    chunkSizeWarningLimit: 900,
    // Rolldown's plugin-timing hint reports the cost of Start and Tailwind on
    // every build and says nothing actionable.
    rolldownOptions: { checks: { pluginTimings: false } },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
