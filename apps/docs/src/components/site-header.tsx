"use client"

import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { cn } from "cn"
import type * as PageTree from "fumadocs-core/page-tree"

import { Button } from "@tecton/react/components/button"
import { Separator } from "@tecton/react/components/separator"
import { Sheet, SheetHeader, SheetTitle, SheetTrigger } from "@tecton/react/components/sheet"

import { CommandMenu } from "@/components/command-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { PlatformLogo } from "@/components/platform-logo"
import { activeNavHref, siteConfig } from "@/lib/site"
import { getSidebarGroups } from "@/lib/tree"

export function SiteHeader({ tree }: { tree: PageTree.Root }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <header className="bg-background sticky top-0 z-50 w-full">
      <div className="container-wrapper px-6">
        <div className="flex h-(--header-height) items-center **:data-[slot=separator]:h-4! **:data-[slot=separator]:self-center">
          <MobileNav tree={tree} pathname={pathname} className="flex lg:hidden" />
          <MainNav pathname={pathname} className="hidden lg:flex" />
          <div className="ml-auto flex items-center gap-2 md:flex-1 md:justify-end">
            <div className="hidden w-full flex-1 md:flex md:w-auto md:flex-none">
              <CommandMenu tree={tree} />
            </div>
            <Separator orientation="vertical" className="ml-2 hidden lg:block" />
            <ModeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}

function MainNav({ pathname, className }: { pathname: string; className?: string }) {
  const active = activeNavHref(pathname)
  return (
    <nav className={cn("items-center gap-0", className)}>
      <Link
        to="/"
        className="focus-visible:ring-ring/60 mr-4 flex items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2"
      >
        <PlatformLogo className="size-5" />
        <span>{siteConfig.name}</span>
      </Link>
      {siteConfig.nav.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          data-active={active === item.href}
          className="text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring/60 data-[active=true]:text-foreground relative inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {item.title}
        </Link>
      ))}
    </nav>
  )
}

function MobileNav({
  tree,
  pathname,
  className,
}: {
  tree: PageTree.Root
  pathname: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  const groups = getSidebarGroups(tree)

  return (
    <SheetTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className={cn(
          "extend-touch-target h-8 touch-manipulation items-center justify-start gap-2.5 p-0! hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent",
          className
        )}
        aria-label="Toggle menu"
      >
        <div className="relative flex h-8 w-4 items-center justify-center">
          <div className="relative size-4">
            <span
              className={cn(
                "bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100",
                open ? "top-[0.4rem] -rotate-45" : "top-1"
              )}
            />
            <span
              className={cn(
                "bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100",
                open ? "top-[0.4rem] rotate-45" : "top-2.5"
              )}
            />
          </div>
        </div>
        <span className="flex h-8 items-center text-lg leading-none font-medium">Menu</span>
      </Button>
      <Sheet side="left" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PlatformLogo className="size-5" />
            {siteConfig.name}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-12 px-6 pb-6">
          <div className="flex flex-col gap-4">
            <div className="text-muted-foreground text-sm font-medium">Menu</div>
            <div className="flex flex-col gap-3">
              {siteConfig.nav.map((item) => (
                <Link key={item.href} to={item.href} className="text-2xl font-medium">
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
          {groups.map((group) => (
            <div key={group.name} className="flex flex-col gap-4">
              <div className="text-muted-foreground text-sm font-medium">{group.name}</div>
              <div className="flex flex-col gap-3">
                {group.entries.map((entry) => (
                  <Link
                    key={entry.url}
                    to={entry.url}
                    className={cn("text-2xl font-medium", entry.depth === 1 && "pl-4 text-xl")}
                  >
                    {entry.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </SheetTrigger>
  )
}
