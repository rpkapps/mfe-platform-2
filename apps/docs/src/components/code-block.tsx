"use client"

import * as React from "react"
import { cn } from "cn"

import { CopyButton } from "@/components/copy-button"
import { getIconForLanguageExtension } from "@/components/language-icon"
import { highlightCode } from "@/lib/highlight"

const cache = new Map<string, Promise<string>>()

export function getHighlighted(code: string, lang: string) {
  const key = `${lang} ${code}`
  let promise = cache.get(key)
  if (!promise) {
    promise = highlightCode({ data: { code, lang } })
    cache.set(key, promise)
  }
  return promise
}

function Highlighted({ code, lang }: { code: string; lang: string }) {
  const html = React.use(getHighlighted(code, lang))
  return <div data-not-typeset dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Highlighted source with an optional file title and a copy button, rendered
 * with the same markup as an MDX code fence (`figure[data-rehype-pretty-code-figure]`).
 */
export function CodeBlock({
  code,
  lang = "tsx",
  title,
  className,
  maxLines,
  copyable = true,
}: {
  code: string
  lang?: string
  title?: string
  className?: string
  maxLines?: number
  copyable?: boolean
}) {
  const shown = maxLines ? code.split("\n").slice(0, maxLines).join("\n") : code

  return (
    <figure
      data-rehype-pretty-code-figure=""
      data-not-typeset
      className={cn("[&>div>pre]:max-h-96", className)}
    >
      {title && (
        <figcaption
          data-rehype-pretty-code-title=""
          data-language={lang}
          className="flex items-center gap-2 text-code-foreground [&_svg]:size-4 [&_svg]:text-code-foreground [&_svg]:opacity-70"
        >
          {getIconForLanguageExtension(lang)}
          <span className="truncate">{title}</span>
        </figcaption>
      )}
      {copyable && <CopyButton value={code} />}
      <React.Suspense
        fallback={
          <pre data-language={lang}>
            <code>
              {shown.split("\n").map((line, i) => (
                <span key={i} data-line="">
                  {line}
                </span>
              ))}
            </code>
          </pre>
        }
      >
        <Highlighted code={shown} lang={lang} />
      </React.Suspense>
    </figure>
  )
}
