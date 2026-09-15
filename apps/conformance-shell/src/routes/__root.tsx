import * as React from "react"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router"
import { ThemeProvider, useTheme } from "next-themes"
import { RouterProvider as AriaRouterProvider } from "react-aria-components"
import {
  CommandPalette,
  NotificationHost,
  PageState,
  PlatformDevtools,
  ShellHeader,
  ShellOverlayProvider,
  ShortcutsDialog,
  type DevtoolsControl,
} from "@/components"
import { TEST_IDS, PROJECTS } from "@platform-internal/conformance"

import { AppShell, AppShellBody, AppShellMain } from "@tecton/react/tecton/app-shell"

import { getRuntimeConfig } from "@/lib/runtime-config"
import { ShellPlatform, switchUser, useShellHost, type UserKey } from "@/lib/platform"
import appCss from "@/styles/app.css?url"

const ids = TEST_IDS.shell

export const Route = createRootRoute({
  loader: () => getRuntimeConfig(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Conformance Shell" },
      { name: "color-scheme", content: "dark light" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: () => (
    <PageState
      code="404"
      title="Nothing at this address"
      description="The shell has no page here, and no application claims the path."
    />
  ),
})

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-svh font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AriaRouter>{children}</AriaRouter>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const { config } = Route.useLoaderData()
  const router = useRouter()
  return (
    <ShellPlatform runtimeConfig={config} router={router}>
      <ShellChrome>
        <Outlet />
      </ShellChrome>
    </ShellPlatform>
  )
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const host = useShellHost()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { resolvedTheme } = useTheme()
  const [userKey, setUserKey] = React.useState<UserKey>("admin")
  const [projectIndex, setProjectIndex] = React.useState(0)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const devtools = React.useRef<DevtoolsControl | null>(null)

  React.useEffect(() => {
    if (!host) return
    const theme = resolvedTheme === "light" ? "light" : "dark"
    host.context.patch({ theme, resolvedTheme: theme })
  }, [host, resolvedTheme])

  // `?` opens the shortcut list, the way every shell that copies this file
  // should: the palette owns `mod+k` itself.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      event.preventDefault()
      setShortcutsOpen(true)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const chrome = (
    <AppShell data-testid={ids.root}>
      <ShellHeader
        hasHost={Boolean(host)}
        userKey={userKey}
        onUserChange={(key) => {
          setUserKey(key)
          if (host) switchUser(host, key)
        }}
        projectIndex={projectIndex}
        onProjectChange={(index) => {
          setProjectIndex(index)
          host?.context.patch({ project: PROJECTS[index]! })
        }}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onToggleDevtools={() => devtools.current?.toggle()}
      />
      <AppShellBody>
        <AppShellMain className="flex flex-col gap-6 p-4 md:p-6">
          <div data-current-path={pathname}>{children}</div>
        </AppShellMain>
      </AppShellBody>
      {host ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
      {host ? <ShortcutsDialog isOpen={shortcutsOpen} onOpenChange={setShortcutsOpen} /> : null}
      {host ? <NotificationHost /> : null}
      {host ? <PlatformDevtools controlRef={devtools} /> : null}
    </AppShell>
  )
  return host ? <ShellOverlayProvider>{chrome}</ShellOverlayProvider> : chrome
}
