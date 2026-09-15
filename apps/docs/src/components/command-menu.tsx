"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "cn"
import type * as PageTree from "fumadocs-core/page-tree"
import { ArrowRightIcon, CornerDownLeftIcon, FileTextIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@tecton/react/components/command"

import { siteConfig } from "@/lib/site"
import { getSidebarGroups } from "@/lib/tree"

const itemClassName =
  "h-9 rounded-md border border-transparent px-3! font-medium data-focused:border-input data-focused:bg-input/50 data-selected:border-input data-selected:bg-input/50"

const groupClassName =
  "p-0! **:[[cmdk-group-heading]]:scroll-mt-16 **:[[cmdk-group-heading]]:p-3! **:[[cmdk-group-heading]]:pb-1!"

function CommandMenuKbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "bg-background text-muted-foreground pointer-events-none flex h-5 items-center justify-center gap-1 rounded border px-1 font-sans text-[0.7rem] font-medium select-none [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

export function CommandMenu({ tree }: { tree: PageTree.Root }) {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        if (
          (e.target instanceof HTMLElement && e.target.isContentEditable) ||
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        ) {
          return
        }
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const groups = React.useMemo(() => {
    const result: {
      heading: string
      items: { id: string; url: string; name: string }[]
    }[] = []
    // React Aria collections need unique keys: the same url may appear in
    // several groups ("/docs" is both the Docs page and the Introduction).
    const withIds = (heading: string, items: { url: string; name: string }[]) =>
      items.map((item) => ({ ...item, id: `${heading}:${item.url}` }))
    result.push({
      heading: "Pages",
      items: withIds(
        "Pages",
        siteConfig.nav.map((item) => ({ url: item.href, name: item.title }))
      ),
    })
    for (const group of getSidebarGroups(tree)) {
      const items = group.entries.map((entry) => ({ url: entry.url, name: entry.name }))
      if (items.length) result.push({ heading: group.name, items: withIds(group.name, items) })
    }
    return result
  }, [tree])

  return (
    <>
      <Button
        variant="outline"
        className="bg-muted text-foreground hover:bg-muted/50 dark:bg-card relative h-8 w-full justify-start rounded-lg border-none pl-3 font-normal shadow-none transition-colors md:w-48 lg:w-40 xl:w-64"
        onPress={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <span className="hidden xl:inline-flex">Search documentation...</span>
        <span className="inline-flex xl:hidden">Search...</span>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search documentation..."
        description="Search for a page to open..."
        className="bg-popover ring-border/60 top-[15%] rounded-xl! border-none bg-clip-padding p-2! pb-11! shadow-2xl ring-4"
      >
        <Command className="**:data-[slot=input-group]:border-input **:data-[slot=input-group]:bg-input/50 rounded-none bg-transparent **:data-[slot=command-input-wrapper]:p-0 **:data-[slot=command-input-wrapper]:pb-1 **:data-[slot=input-group]:h-9! **:data-[slot=input-group]:rounded-md!">
          <CommandInput placeholder="Search documentation..." />
          <CommandList
            className="no-scrollbar max-h-[60svh] min-h-80 scroll-pt-2 scroll-pb-1.5"
            onAction={(key) => {
              setOpen(false)
              navigate({ to: String(key).slice(String(key).indexOf(":") + 1) })
            }}
            renderEmptyState={() => (
              <CommandEmpty className="text-muted-foreground py-12 text-center text-sm">
                No results found.
              </CommandEmpty>
            )}
          >
            {groups.map((group) => (
              <CommandGroup
                key={group.heading}
                heading={group.heading}
                className={groupClassName}
              >
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    id={item.id}
                    textValue={`${group.heading} ${item.name}`}
                    className={itemClassName}
                  >
                    {group.heading === "Pages" ? <ArrowRightIcon /> : <FileTextIcon />}
                    {item.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="bg-muted/60 text-muted-foreground absolute inset-x-0 bottom-0 z-20 flex h-10 items-center gap-2 rounded-b-xl border-t px-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <CommandMenuKbd>
              <CornerDownLeftIcon />
            </CommandMenuKbd>{" "}
            Go to Page
          </div>
        </div>
      </CommandDialog>
    </>
  )
}
