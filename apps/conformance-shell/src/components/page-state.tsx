import type { ReactNode } from "react"

import { LinkButton } from "@tecton/react/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@tecton/react/components/empty"

export interface PageStateProps {
  /** HTTP-style code shown above the title. */
  code: string
  title: string
  description: ReactNode
  /** Where "Back" goes; omitted renders no action. */
  href?: string
  actionLabel?: string
  children?: ReactNode
}

/**
 * A full-page status: 404, 403, an empty result. Modelled on Tecton's
 * `page-state` block so every dead end in the shell looks the same.
 */
export function PageState({
  code,
  title,
  description,
  href = "/",
  actionLabel = "Back to the shell",
  children,
}: PageStateProps) {
  return (
    <Empty className="m-auto max-w-md py-16">
      <EmptyHeader>
        <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">{code}</p>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {children}
        {href ? (
          <LinkButton variant="outline" size="sm" href={href}>
            {actionLabel}
          </LinkButton>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}
