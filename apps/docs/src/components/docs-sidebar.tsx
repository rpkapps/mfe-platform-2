"use client"

import * as React from "react"
import { useRouterState } from "@tanstack/react-router"
import { cn } from "cn"
import type * as PageTree from "fumadocs-core/page-tree"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@tecton/react/components/sidebar"

import { getSidebarGroups } from "@/lib/tree"

const SCROLL_KEY = "platform-docs:sidebar-scroll"

function readScrollState() {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "") as {
      pathname: string
      scrollTop: number
    }
  } catch {
    return null
  }
}

function saveScrollState(container: HTMLElement) {
  try {
    sessionStorage.setItem(
      SCROLL_KEY,
      JSON.stringify({ pathname: location.pathname, scrollTop: container.scrollTop })
    )
  } catch {
    // ignore
  }
}

const itemClassName =
  "relative h-[30px] w-fit overflow-visible border border-transparent text-[0.8rem] font-medium after:absolute after:inset-x-0 after:-inset-y-1 after:z-0 after:rounded-md data-[active=true]:border-accent data-[active=true]:bg-accent"

function SidebarLink({
  href,
  active,
  nested,
  children,
}: {
  href: string
  active: boolean
  nested?: boolean
  children: React.ReactNode
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        href={href}
        isActive={active}
        className={cn(itemClassName, nested && "text-muted-foreground ml-3")}
      >
        <span className="absolute inset-0 flex w-(--sidebar-menu-width) bg-transparent" />
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function DocsSidebar({
  tree,
  ...props
}: React.ComponentProps<typeof Sidebar> & { tree: PageTree.Root }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const container = contentRef.current
    if (!container) return

    const scrollState = readScrollState()
    if (scrollState?.pathname === pathname) {
      container.scrollTop = scrollState.scrollTop
    } else {
      const active = container.querySelector<HTMLElement>('[data-active="true"]')
      if (active) {
        const containerRect = container.getBoundingClientRect()
        const activeRect = active.getBoundingClientRect()
        if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
          container.scrollTop +=
            activeRect.top -
            containerRect.top -
            (container.clientHeight - activeRect.height) / 2
        }
      }
    }
    saveScrollState(container)
  }, [pathname])

  React.useEffect(() => {
    const container = contentRef.current
    if (!container) return
    const onScroll = () => saveScrollState(container)
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  const groups = getSidebarGroups(tree)

  return (
    <Sidebar
      className="sticky top-[calc(var(--header-height)+0.6rem)] z-30 hidden h-[calc(100svh-10rem)] overflow-hidden overscroll-none bg-transparent [--sidebar-menu-width:--spacing(56)] lg:flex"
      collapsible="none"
      {...props}
    >
      <div className="absolute top-12 right-2 bottom-0 hidden h-full w-px bg-[linear-gradient(to_bottom,transparent_0%,var(--border)_10%,var(--border)_90%,transparent_100%)] lg:flex" />
      <SidebarContent
        ref={contentRef}
        data-docs-sidebar-content=""
        className="scroll-fade no-scrollbar w-(--sidebar-menu-width) overflow-x-hidden pl-2.5"
      >
        {groups.map((group, index) => (
          <SidebarGroup key={group.name} className={cn(index === 0 && "pt-12")}>
            <SidebarGroupLabel className="text-muted-foreground font-medium">
              {group.name}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.entries.map((entry) => (
                  <SidebarLink
                    key={entry.url}
                    href={entry.url}
                    active={entry.url === pathname}
                    nested={entry.depth === 1}
                  >
                    {entry.name}
                  </SidebarLink>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
