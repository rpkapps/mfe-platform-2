// Global fumadocs-mdx options (collections are declared with the macro API in src/lib/docs.ts).
import { defineConfig } from "fumadocs-mdx/config"

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
    },
  },
})
