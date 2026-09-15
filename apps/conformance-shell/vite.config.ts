import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// The conformance shell: a server-rendered TanStack Start application that
// hosts the platform. Only the shell is SSR; remotes mount on the client.
export default defineConfig({
  server: { port: 4110, strictPort: true },
  preview: { host: "127.0.0.1" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
