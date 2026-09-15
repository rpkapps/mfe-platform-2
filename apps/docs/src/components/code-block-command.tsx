"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon, CopyIcon, TerminalIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tecton/react/components/tabs"

const PM_KEY = "platform-docs:package-manager"
type PackageManager = "pnpm" | "npm" | "yarn" | "bun"

function readPackageManager(): PackageManager {
  try {
    const value = window.localStorage.getItem(PM_KEY)
    if (value === "pnpm" || value === "npm" || value === "yarn" || value === "bun") return value
  } catch {
    // ignore
  }
  return "pnpm"
}

/**
 * Derives the pnpm / yarn / bun equivalents of an npm command (same rules as
 * the shadcn docs). Returns null when the command is not an npm command.
 */
export function getPackageManagerCommands(raw: string) {
  const command = raw.trim()
  if (command.includes("\n")) return null
  if (command.startsWith("npm install")) {
    return {
      npm: command,
      yarn: command.replace("npm install", "yarn add"),
      pnpm: command.replace("npm install", "pnpm add"),
      bun: command.replace("npm install", "bun add"),
    }
  }
  if (command.startsWith("npx create-")) {
    return {
      npm: command,
      yarn: command.replace("npx create-", "yarn create "),
      pnpm: command.replace("npx create-", "pnpm create "),
      bun: command.replace("npx", "bunx --bun"),
    }
  }
  if (command.startsWith("npm create")) {
    return {
      npm: command,
      yarn: command.replace("npm create", "yarn create"),
      pnpm: command.replace("npm create", "pnpm create"),
      bun: command.replace("npm create", "bun create"),
    }
  }
  if (command.startsWith("npx")) {
    return {
      npm: command,
      yarn: command.replace("npx", "yarn dlx"),
      pnpm: command.replace("npx", "pnpm dlx"),
      bun: command.replace("npx", "bunx --bun"),
    }
  }
  if (command.startsWith("npm run")) {
    return {
      npm: command,
      yarn: command.replace("npm run", "yarn"),
      pnpm: command.replace("npm run", "pnpm"),
      bun: command.replace("npm run", "bun"),
    }
  }
  return null
}

/** Package-manager tabs for an install command (like the shadcn docs). */
export function CodeBlockCommand({
  commands,
  className,
}: {
  commands: Record<PackageManager, string>
  className?: string
}) {
  const [packageManager, setPackageManager] = React.useState<PackageManager>("pnpm")
  const [hasCopied, setHasCopied] = React.useState(false)

  React.useEffect(() => {
    setPackageManager(readPackageManager())
  }, [])

  React.useEffect(() => {
    if (!hasCopied) return
    const timer = setTimeout(() => setHasCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [hasCopied])

  const order: PackageManager[] = ["pnpm", "npm", "yarn", "bun"]

  return (
    <figure
      data-rehype-pretty-code-figure=""
      data-not-typeset
      className={cn("overflow-x-auto", className)}
    >
      <Tabs
        selectedKey={packageManager}
        className="gap-0"
        onSelectionChange={(key) => {
          const next = String(key) as PackageManager
          setPackageManager(next)
          try {
            window.localStorage.setItem(PM_KEY, next)
          } catch {
            // ignore
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1">
          <div className="flex size-4 items-center justify-center rounded-[1px] bg-foreground opacity-70">
            <TerminalIcon className="size-3 text-code" />
          </div>
          <TabsList className="h-auto rounded-none bg-transparent p-0">
            {order.map((key) => (
              <TabsTrigger
                key={key}
                id={key}
                className="h-7 border border-transparent pt-0.5 shadow-none! data-selected:border-input data-selected:bg-background!"
              >
                {key}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="no-scrollbar overflow-x-auto">
          {order.map((key) => (
            <TabsContent key={key} id={key} className="mt-0 px-4 py-3.5">
              <pre className="p-0!">
                <code className="relative font-mono text-sm leading-none" data-language="bash">
                  {commands[key]}
                </code>
              </pre>
            </TabsContent>
          ))}
        </div>
      </Tabs>
      <Button
        data-slot="copy-button"
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2 z-10 size-7 opacity-70 hover:opacity-100 focus-visible:opacity-100"
        onPress={async () => {
          try {
            await navigator.clipboard.writeText(commands[packageManager])
            setHasCopied(true)
          } catch {
            // ignore
          }
        }}
        aria-label="Copy"
      >
        {hasCopied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </figure>
  )
}
