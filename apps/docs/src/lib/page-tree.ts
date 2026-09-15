import { createServerFn } from "@tanstack/react-start"

// Serialized page tree for the docs sidebar (deserialized on the client with
// `useFumadocsLoader`).
export const getPageTree = createServerFn({ method: "GET" }).handler(async () => {
  const { source } = await import("./source")
  return {
    pageTree: await source.serializePageTree(source.getPageTree()),
  }
})

export const getDocsPage = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const { source } = await import("./source")
    const page = source.getPage(slugs)
    if (!page) {
      return null
    }
    const neighbours = source.getPages()
    const index = neighbours.findIndex((p) => p.url === page.url)
    const pick = (p: (typeof neighbours)[number] | undefined) =>
      p ? { title: p.data.title, url: p.url } : null
    return {
      path: page.path,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      previous: pick(neighbours[index - 1]),
      next: pick(neighbours[index + 1]),
    }
  })
