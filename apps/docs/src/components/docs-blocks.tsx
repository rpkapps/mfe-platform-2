"use client"

import * as React from "react"
import { cn } from "cn"

import { Alert, AlertDescription, AlertTitle } from "@tecton/react/components/alert"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tecton/react/components/tabs"

/* ------------------------------------------------------------------------ */
/* CodeTabs — "Command" / "Manual" installation tabs. The chosen tab is       */
/* remembered across pages (like the shadcn docs' installation type).        */
/* ------------------------------------------------------------------------ */

const INSTALL_KEY = "platform-docs:installation-type"

function readInstallType() {
  try {
    return window.localStorage.getItem(INSTALL_KEY) ?? "cli"
  } catch {
    return "cli"
  }
}

export function CodeTabs({
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Tabs>, "children"> & {
  children: React.ReactNode
}) {
  const [value, setValue] = React.useState("cli")

  React.useEffect(() => {
    setValue(readInstallType())
  }, [])

  return (
    <Tabs
      data-not-typeset
      selectedKey={value}
      onSelectionChange={(key) => {
        const next = String(key)
        setValue(next)
        try {
          window.localStorage.setItem(INSTALL_KEY, next)
        } catch {
          // ignore
        }
      }}
      className={cn("relative mt-6 w-full gap-4", className)}
      {...props}
    >
      {children}
    </Tabs>
  )
}

/** shadcn docs use `value`; React Aria tabs use `id`. Accept both. */
export function DocsTabsTrigger({
  value,
  id,
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger> & { value?: string }) {
  return (
    <TabsTrigger
      id={id ?? value}
      className={cn(
        "h-auto px-0 pb-3 text-base font-medium text-muted-foreground hover:text-foreground data-selected:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export function DocsTabsContent({
  value,
  id,
  className,
  ...props
}: React.ComponentProps<typeof TabsContent> & { value?: string }) {
  return (
    <TabsContent
      id={id ?? value}
      className={cn(
        "relative *:[figure]:first:mt-0 [&>.steps]:mt-6 [&>[data-rehype-pretty-code-figure]:first-child]:mt-0",
        className
      )}
      {...props}
    />
  )
}

export function DocsTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      variant="line"
      className={cn("h-auto justify-start gap-6 rounded-none bg-transparent p-0", className)}
      {...props}
    />
  )
}

export function DocsTabs({
  className,
  defaultValue,
  ...props
}: React.ComponentProps<typeof Tabs> & { defaultValue?: string }) {
  return (
    <Tabs
      data-not-typeset
      defaultSelectedKey={defaultValue}
      className={cn("relative mt-6 w-full gap-4", className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------------ */
/* Steps                                                                     */
/* ------------------------------------------------------------------------ */

export function Steps({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "steps mb-12 [counter-reset:step] md:ml-4 md:border-l md:pl-8 [&>h3]:step",
        className
      )}
      {...props}
    />
  )
}

export function Step({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={className} {...props} />
}

/* ------------------------------------------------------------------------ */
/* Callout                                                                   */
/* ------------------------------------------------------------------------ */

export function Callout({
  title,
  children,
  icon,
  className,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<typeof Alert>, "variant"> & {
  icon?: React.ReactNode
  variant?: "default" | "info" | "warning"
}) {
  return (
    <Alert
      data-not-typeset
      data-variant={variant}
      className={cn(
        "mt-6 w-auto rounded-2xl border-surface bg-surface text-surface-foreground md:-mx-1 **:[code]:border",
        variant === "warning" && "[&>svg]:text-warning",
        variant === "info" && "[&>svg]:text-info",
        className
      )}
      {...props}
    >
      {icon}
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="text-card-foreground/80 [&_p]:my-0 [&_ul]:my-2 [&_ul]:list-disc">
        {children}
      </AlertDescription>
    </Alert>
  )
}

/* ------------------------------------------------------------------------ */
/* LinkedCard (used by index pages such as /docs/forms)                       */
/* ------------------------------------------------------------------------ */

export function LinkedCard({
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-not-typeset
      className={cn(
        "flex w-full flex-col items-center rounded-2xl bg-surface p-6 text-surface-foreground transition-colors hover:bg-surface/80 sm:p-10",
        className
      )}
      {...props}
    />
  )
}
