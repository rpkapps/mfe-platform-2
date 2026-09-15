import { createFileRoute } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { AppFinder } from "@/components"
import { MFE_IDS, TEST_IDS } from "@platform-internal/conformance"

import { LinkButton } from "@tecton/react/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/")({
  component: Home,
})

const DESTINATIONS = [
  {
    title: "Well Planner",
    description:
      "React 19 and Tecton: concept select, the well inventory and a guarded detail page.",
    path: `/${MFE_IDS.wellPlanner}`,
  },
  {
    title: "Production Reports",
    description:
      "React 18 with no design system at all, kept on its legacy URL by a route prefix.",
    path: "/legacy/reports",
  },
  {
    title: "Operations dashboard",
    description: "Widgets from four remotes, each in its own React root, on one page.",
    path: "/dashboard",
  },
]

function Home() {
  const host = useShellHost()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Nordsee Energy</PageHeaderEyebrow>
          <PageHeaderTitle>Conformance shell</PageHeaderTitle>
          <PageHeaderDescription>
            A TanStack Start shell hosting React 19 and React 18 remotes side by side.
            Discoverable MFEs appear in the app finder; hidden widget libraries do not, yet
            their widgets, commands, help and release notes are available.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div data-testid={TEST_IDS.shell.appFinder} className="flex items-center gap-3">
        {host ? (
          <>
            <AppFinder />
            <span className="text-muted-foreground text-sm">
              Every discoverable application, grouped by category.
            </span>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Starting platform…</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {DESTINATIONS.map((item) => (
          <Card key={item.path}>
            <CardHeader>
              <CardDescription className="font-mono text-xs">{item.path}</CardDescription>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">{item.description}</p>
              <LinkButton variant="ghost" size="sm" href={item.path}>
                Open <ArrowRightIcon aria-hidden />
              </LinkButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
