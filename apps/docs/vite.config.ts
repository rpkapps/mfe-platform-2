import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fumadocsMdx } from "fumadocs-mdx/vite"

const config = defineConfig({
  server: { port: 3000 },
  // The prerender crawler fetches every page from a Vite preview server that
  // runs in the same process. Bind it to IPv4 explicitly: with `localhost`,
  // Node's fetch races ::1 against 127.0.0.1 and on Windows the ::1 attempt
  // times out under load while 127.0.0.1 is refused (ETIMEDOUT/ECONNREFUSED).
  preview: { host: "127.0.0.1" },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      // Rolldown's plugin-timing hint reports the cost of the MDX, Start and
      // Tailwind plugins on every build and says nothing actionable.
      checks: { pluginTimings: false },
      onwarn(warning, defaultHandler) {
        // The docs route preloads MDX bodies on client-side navigation, so the
        // async collection's runtime ships to the browser. Its "raw file"
        // branch is server-only and reaches for `node:fs/promises` behind a
        // dynamic import the browser never evaluates.
        if (
          warning.message?.includes("node:fs/promises") &&
          warning.message.includes("fumadocs-mdx")
        )
          return
        defaultHandler(warning)
      },
    },
  },
  plugins: [
    // Must run before tanstackStart/react so .mdx and `fumadocs-mdx/macro` calls are transformed first.
    fumadocsMdx({ index: false }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // Every page renders in one process, so more workers only add
        // contention; retry transient connection errors instead of aborting.
        concurrency: 4,
        retryCount: 3,
        retryDelay: 1000,
        // Only crawl the site's own pages; schema files and external links are
        // static assets or foreign origins.
        filter: (page) =>
          !page.path.includes("#") && (page.path === "/" || /^\/docs(\/|$)/.test(page.path)),
      },
    }),
    viteReact(),
  ],
})

export default config
