import * as React from "react"
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router"
import { ThemeProvider, useTheme } from "next-themes"
import { RouterProvider as AriaRouterProvider } from "react-aria-components"
import { Breadcrumbs, CommandPalette, NotificationHost, PlatformDevtools, ShellOverlayProvider } from "@platform/host/react"
import { TEST_IDS, PROJECTS } from "@platform-internal/conformance"

import { AppShell, AppShellBody, AppShellBrand, AppShellHeader, AppShellHeaderActions, AppShellMain, AppShellNav } from "@tecton/react/tecton/app-shell"
import { Button } from "@tecton/react/components/button"

import { getRuntimeConfig } from "@/lib/runtime-config"
import { ShellPlatform, switchUser, useShellHost, type UserKey } from "@/lib/platform"
import appCss from "@/styles/app.css?url"

const ids = TEST_IDS.shell

export const Route = createRootRoute({
  loader: () => getRuntimeConfig(),
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Conformance Shell" }, { name: "color-scheme", content: "dark light" }],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: () => (
    <main className="p-6">
      <h1 className="text-xl font-medium">404</h1>
      <p className="text-muted-foreground">Nothing at this address in the shell.</p>
    </main>
  ),
})

function AriaRouter({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <AriaRouterProvider navigate={(to) => void router.navigate({ to })} useHref={(to) => router.buildLocation({ to }).href}>
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
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
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

const nav = [
  { to: "/", title: "Home" },
  { to: "/dashboard", title: "Dashboard" },
  { to: "/settings", title: "Settings" },
  { to: "/help", title: "Help" },
  { to: "/release-notes", title: "Release notes" },
  { to: "/failures", title: "Failure lab" },
] as const

function ShellChrome({ children }: { children: React.ReactNode }) {
  const host = useShellHost()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { resolvedTheme, setTheme } = useTheme()
  const [counter, setCounter] = React.useState(0)
  const [userKey, setUserKey] = React.useState<UserKey>("admin")
  const [projectIndex, setProjectIndex] = React.useState(0)

  React.useEffect(() => {
    if (!host) return
    const theme = resolvedTheme === "light" ? "light" : "dark"
    host.context.patch({ theme, resolvedTheme: theme })
  }, [host, resolvedTheme])

  const chrome = (
    <AppShell data-testid={ids.root} className="h-auto min-h-svh">
      <AppShellHeader>
        <AppShellBrand>
          <Link to="/">Conformance Shell</Link>
        </AppShellBrand>
        <AppShellNav>
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className="rounded-md px-2 py-1 text-sm text-foreground/70 hover:bg-muted hover:text-foreground data-[status=active]:text-foreground" activeOptions={{ exact: item.to === "/" }}>
              {item.title}
            </Link>
          ))}
          <Link to="/$" params={{ _splat: "asset-tracker" }} className="rounded-md px-2 py-1 text-sm text-foreground/70 hover:bg-muted hover:text-foreground">
            Asset Tracker
          </Link>
          <Link to="/$" params={{ _splat: "legacy/reports" }} className="rounded-md px-2 py-1 text-sm text-foreground/70 hover:bg-muted hover:text-foreground">
            Legacy Reports
          </Link>
        </AppShellNav>
        <AppShellHeaderActions>
          <Button size="sm" variant="outline" data-testid={ids.counter} onPress={() => setCounter((value) => value + 1)}>
            Shell {counter}
          </Button>
          <select
            aria-label="Current user"
            data-testid={ids.userSwitch}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={userKey}
            onChange={(event) => {
              const key = event.target.value as UserKey
              setUserKey(key)
              if (host) switchUser(host, key)
            }}
          >
            <option value="admin">Ada (admin)</option>
            <option value="viewer">Grace (viewer)</option>
            <option value="restricted">Guest (restricted)</option>
          </select>
          <select
            aria-label="Project"
            data-testid={ids.projectSwitch}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={projectIndex}
            onChange={(event) => {
              const index = Number(event.target.value)
              setProjectIndex(index)
              host?.context.patch({ project: PROJECTS[index]! })
            }}
          >
            {PROJECTS.map((project, index) => (
              <option key={project.id} value={index}>
                {project.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" data-testid={ids.themeToggle} onPress={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            Theme: {resolvedTheme ?? "dark"}
          </Button>
          <span data-testid={ids.userName} className="text-sm text-muted-foreground">
            {host?.context.getState().user?.displayName ?? "…"}
          </span>
          {host ? <CommandPalette /> : null}
        </AppShellHeaderActions>
      </AppShellHeader>
      <AppShellBody>
        <AppShellMain className="flex flex-col gap-4 p-4">
          <div data-testid={ids.breadcrumbs}>{host ? <Breadcrumbs /> : null}</div>
          <div data-current-path={pathname}>{children}</div>
        </AppShellMain>
      </AppShellBody>
      {host ? <NotificationHost /> : null}
      {host ? <PlatformDevtools /> : null}
    </AppShell>
  )
  return host ? <ShellOverlayProvider>{chrome}</ShellOverlayProvider> : chrome
}
