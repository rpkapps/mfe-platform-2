import * as React from "react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import type { MDXComponents } from "mdx/types"

import { Button } from "@tecton/react/components/button"
import { Kbd } from "@tecton/react/components/kbd"

import { CodeBlock } from "@/components/code-block"
import { CodeBlockCommand, getPackageManagerCommands } from "@/components/code-block-command"
import { CopyButton } from "@/components/copy-button"
import {
  Callout,
  CodeTabs,
  DocsTabs,
  DocsTabsContent,
  DocsTabsList,
  DocsTabsTrigger,
  LinkedCard,
  Step,
  Steps,
} from "@/components/docs-blocks"
import { getIconForLanguageExtension } from "@/components/language-icon"

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getNodeText(node.props.children)
  }
  return ""
}

function HeadingAnchor({ id, children }: { id?: string; children: React.ReactNode }) {
  if (!id) return children
  return (
    <a className="group no-underline" href={`#${id}`}>
      <span className="underline-offset-4 group-hover:underline">{children}</span>
      <span
        aria-hidden="true"
        className="ml-2 text-muted-foreground opacity-0 group-hover:opacity-100"
      >
        #
      </span>
    </a>
  )
}

function heading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function Heading({ children, id, ...props }: React.ComponentProps<typeof Tag>) {
    return (
      <Tag id={id} {...props}>
        <HeadingAnchor id={id}>{children}</HeadingAnchor>
      </Tag>
    )
  }
}

function DocsLink({ href = "", className, ...props }: React.ComponentProps<"a">) {
  const isInternal = href.startsWith("/") && !href.startsWith("//")
  // Static files (published schemas) are served by the site, not by the router.
  if (isInternal && !href.startsWith("/schemas/")) {
    return <Link to={href} className={className} {...(props as object)} />
  }
  const external = href.startsWith("http")
  return (
    <a
      href={href}
      className={className}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      {...props}
    />
  )
}

function getFenceLanguage(children: React.ReactNode): string | null {
  let language: string | null = null
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<Record<string, unknown>>(child)) {
      const value = child.props["data-language"]
      if (typeof value === "string") language = value
    }
  })
  return language
}

/**
 * Code fences compiled by fumadocs (rehype-code) arrive as <figure><pre><code>.
 * A single-line `bash` fence with an npm command becomes package-manager tabs.
 */
function Figure({ className, children, ...props }: React.ComponentProps<"figure">) {
  const isCode = "data-rehype-pretty-code-figure" in props
  const code = isCode ? getNodeText(children) : ""
  if (isCode && getFenceLanguage(children) === "bash") {
    const commands = getPackageManagerCommands(code)
    if (commands) return <CodeBlockCommand commands={commands} className={className} />
  }
  return (
    <figure className={className} {...props}>
      {isCode && <CopyButton value={code} />}
      {children}
    </figure>
  )
}

function Figcaption({ className, children, ...props }: React.ComponentProps<"figcaption">) {
  const language =
    "data-language" in props && typeof props["data-language"] === "string"
      ? props["data-language"]
      : null
  return (
    <figcaption
      className={cn(
        "flex items-center gap-2 text-code-foreground [&_svg]:size-4 [&_svg]:text-code-foreground [&_svg]:opacity-70",
        className
      )}
      {...props}
    >
      {language && getIconForLanguageExtension(language)}
      {children}
    </figcaption>
  )
}

function Pre({ className, children, ...props }: React.ComponentProps<"pre">) {
  return (
    <pre
      data-not-typeset
      className={cn(
        "no-scrollbar min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain overscroll-y-auto px-4 py-3.5 outline-none has-data-highlighted-line:px-0 has-data-line-numbers:px-0",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  )
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
    a: DocsLink,
    figure: Figure,
    figcaption: Figcaption,
    pre: Pre,
    // Typeset tables stay real tables; wide ones scroll horizontally.
    table: (props: React.ComponentProps<"table">) => (
      <div className="typeset-scroll scroll-fade-x no-scrollbar *:[table]:w-full">
        <table {...props} />
      </div>
    ),
    CodeBlock,
    CodeTabs,
    Tabs: DocsTabs,
    TabsList: DocsTabsList,
    TabsTrigger: DocsTabsTrigger,
    TabsContent: DocsTabsContent,
    Steps,
    Step,
    Callout,
    LinkedCard,
    Button: ({ className, ...props }: React.ComponentProps<typeof Button>) => (
      <Button className={cn("not-typeset", className)} {...props} />
    ),
    Kbd,
    Link: DocsLink,
    ...components,
  }
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
