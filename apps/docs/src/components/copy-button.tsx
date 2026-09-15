"use client"

import { cn } from "cn"

import { CopyButton as TectonCopyButton } from "@tecton/react/tecton/copy-button"

/** Copy button positioned in the corner of a code block (shadcn docs style). */
export function CopyButton({
  className,
  ...props
}: React.ComponentProps<typeof TectonCopyButton>) {
  return (
    <TectonCopyButton
      size="icon-sm"
      className={cn(
        "absolute top-3 right-2 z-10 size-7 bg-code text-muted-foreground hover:text-foreground hover:opacity-100 focus-visible:opacity-100",
        className
      )}
      {...props}
    />
  )
}
