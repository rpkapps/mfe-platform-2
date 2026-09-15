import { createServerFn } from "@tanstack/react-start"

// shiki lives only in the server bundle: the handler body is stripped from the
// client build. Output uses dual themes so `.dark` switches via CSS variables.
// Lines get `data-line` so the docs stylesheet treats them like MDX fences.
export const highlightCode = createServerFn({ method: "POST" })
  .validator((input: { code: string; lang: string }) => input)
  .handler(async ({ data }) => {
    const { codeToHtml } = await import("shiki")
    return codeToHtml(data.code, {
      lang: data.lang,
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
      transformers: [
        {
          pre(node) {
            node.properties["data-language"] = data.lang
          },
          code(node) {
            node.properties["data-language"] = data.lang
          },
          line(node) {
            node.properties["data-line"] = ""
          },
        },
      ],
    })
  })
