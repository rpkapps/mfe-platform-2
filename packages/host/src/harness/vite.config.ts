import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = fileURLToPath(new URL(".", import.meta.url))
const outDir = fileURLToPath(new URL("../../dist/harness", import.meta.url))

/** Self-contained local shell harness: React 19 + Tecton compiled in, served from `dist/harness/`. */
export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom", "react-aria-components", "react-aria"] },
  build: { outDir, emptyOutDir: true, sourcemap: true, target: "es2022" },
  server: { fs: { allow: [fileURLToPath(new URL("../../../../", import.meta.url))] } },
})
