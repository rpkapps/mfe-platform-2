import { defineDocs } from "fumadocs-mdx/macro"

// Isomorphic: imported by routes (client + server). Only frontmatter and the
// lazy MDX body imports reach the browser bundle.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    async: true,
  },
})
