import * as React from "react"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { LinkButton } from "@tecton/react/components/button"

import { DocsTableOfContents } from "@/components/docs-toc"
import { getMDXComponents } from "@/components/mdx"
import { docs } from "@/lib/docs"
import { getDocsPage } from "@/lib/page-tree"
import { siteConfig } from "@/lib/site"

export const Route = createFileRoute("/_site/docs/$")({
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/").filter(Boolean) ?? []
    const data = await getDocsPage({ data: slugs })
    if (!data) throw notFound()
    // async collection: fetch the code-split MDX body so it renders synchronously (also on SSR)
    await docs.getPage(data.path)?.preload()
    return data
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} – ${siteConfig.name}` },
          { name: "description", content: loaderData.description ?? "" },
        ]
      : [],
  }),
  component: DocsPage,
})

function DocsPage() {
  const data = Route.useLoaderData()

  return (
    <React.Suspense
      fallback={<div className="text-muted-foreground px-4 py-8 text-sm">Loading…</div>}
    >
      <Content key={data.path} path={data.path} previous={data.previous} next={data.next} />
    </React.Suspense>
  )
}

type Neighbour = { title: string; url: string } | null

function Content({
  path,
  previous,
  next,
}: {
  path: string
  previous: Neighbour
  next: Neighbour
}) {
  const page = docs.getPage(path)
  if (!page) throw new Error(`unknown page: ${path}`)
  const { toc } = React.use(page.load())
  const MDX = page.body

  return (
    <div
      data-slot="docs"
      className="flex scroll-mt-24 items-stretch pb-8 text-[1.05rem] sm:text-[15px] xl:w-full"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-(--top-spacing) shrink-0" />
        <div className="text-foreground mx-auto flex w-full max-w-160 min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-0 lg:py-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between md:items-start">
              <h1 className="scroll-m-24 text-3xl font-medium tracking-tight sm:text-3xl">
                {page.title}
              </h1>
              <div className="docs-nav flex items-center gap-2">
                <div className="ml-auto flex gap-2">
                  {previous && (
                    <LinkButton
                      variant="secondary"
                      size="icon-sm"
                      className="extend-touch-target size-8 shadow-none md:size-7"
                      href={previous.url}
                      aria-label="Previous"
                    >
                      <ArrowLeftIcon />
                    </LinkButton>
                  )}
                  {next && (
                    <LinkButton
                      variant="secondary"
                      size="icon-sm"
                      className="extend-touch-target size-8 shadow-none md:size-7"
                      href={next.url}
                      aria-label="Next"
                    >
                      <ArrowRightIcon />
                    </LinkButton>
                  )}
                </div>
              </div>
            </div>
            {page.description && (
              <p className="text-muted-foreground text-[1.05rem] sm:text-base sm:text-balance md:max-w-[80%]">
                {page.description}
              </p>
            )}
          </div>
          <div className="typeset w-full flex-1 pb-16 *:data-[slot=alert]:first:mt-0 sm:pb-0">
            <MDX components={getMDXComponents()} />
          </div>
          <div className="hidden h-16 w-full items-center gap-2 px-4 sm:flex sm:px-0">
            {previous && (
              <LinkButton
                variant="secondary"
                size="sm"
                className="shadow-none"
                href={previous.url}
              >
                <ArrowLeftIcon data-icon="inline-start" /> {previous.title}
              </LinkButton>
            )}
            {next && (
              <LinkButton
                variant="secondary"
                size="sm"
                className="ml-auto shadow-none"
                href={next.url}
              >
                {next.title} <ArrowRightIcon data-icon="inline-end" />
              </LinkButton>
            )}
          </div>
        </div>
      </div>
      <div className="sticky top-[calc(var(--header-height)+1px)] z-30 ml-auto hidden h-[90svh] w-(--sidebar-width) flex-col gap-4 overflow-hidden overscroll-none pb-8 xl:flex">
        <div className="h-(--top-spacing) shrink-0" />
        {toc.length ? (
          <div className="scroll-fade no-scrollbar flex flex-col gap-8 overflow-y-auto px-8">
            <DocsTableOfContents toc={toc} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
