import * as React from "react"
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router"
import { TanstackProvider } from "fumadocs-core/framework/tanstack"
import { ThemeProvider } from "next-themes"
import { RouterProvider as AriaRouterProvider } from "react-aria-components"

import { Toaster } from "@tecton/react/components/sonner"

import { siteConfig } from "@/lib/site"
import appCss from "@/styles/app.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: siteConfig.name },
      { name: "description", content: siteConfig.description },
      { name: "color-scheme", content: "dark light" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-2xl font-medium">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
  component: () => <Outlet />,
})

/**
 * Client-side routing for every React Aria `Link` (sidebar items, breadcrumbs,
 * `Button` links…): `href` navigates through the TanStack router instead of a
 * full page load.
 */
function AriaRouter({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <AriaRouterProvider
      navigate={(to) => void router.navigate({ to })}
      useHref={(to) => router.buildLocation({ to }).href}
    >
      {children}
    </AriaRouterProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="[--header-height:calc(var(--spacing)*14)] lg:[--header-height:calc(var(--spacing)*16)]"
    >
      <head>
        <HeadContent />
      </head>
      <body className="group/body min-h-svh overscroll-none bg-background font-sans text-foreground antialiased [--footer-height:calc(var(--spacing)*14)] xl:[--footer-height:calc(var(--spacing)*24)]">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TanstackProvider>
            <AriaRouter>{children}</AriaRouter>
          </TanstackProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
