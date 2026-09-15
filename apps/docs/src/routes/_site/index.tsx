import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BlocksIcon,
  BoxesIcon,
  LayersIcon,
  RouteIcon,
  ServerIcon,
  ShieldCheckIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@tecton/react/components/badge"
import { LinkButton } from "@tecton/react/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"
import { CopyButton } from "@tecton/react/tecton/copy-button"

import { CodeBlock } from "@/components/code-block"
import { siteConfig } from "@/lib/site"

export const Route = createFileRoute("/_site/")({
  component: Home,
})

const packages = [
  {
    icon: BlocksIcon,
    name: "@platform/mfe-react",
    title: "MFE SDK",
    description:
      "createMfe, createWidget, platform context, slice subscriptions, storage, commands, settings, help, release notes, breadcrumbs and telemetry. The only runtime package an MFE needs.",
    href: "/docs/reference/platform-react",
  },
  {
    icon: WrenchIcon,
    name: "@platform/vite",
    title: "Vite plugin",
    description:
      "Turns an ordinary TanStack Router project into a remote: route tree, code splitting, manifest, capability inference, shared dependencies, CSS scoping and Module Federation.",
    href: "/docs/reference/platform-vite",
  },
  {
    icon: TerminalIcon,
    name: "@platform/cli",
    title: "Scaffolding and tooling",
    description:
      "platform create, dev, build, manifest, validate, lint and test, plus the shareable ESLint plugin and flat config (@platform/cli/eslint).",
    href: "/docs/reference/platform-cli",
  },
  {
    icon: ServerIcon,
    name: "@platform/host",
    title: "Shell runtime",
    description:
      "Manifest resolution, dependency negotiation, isolated mounting, command palette, settings host, breadcrumbs, overlay manager, runtime configuration, diagnostics and lazy devtools.",
    href: "/docs/reference/platform-host",
  },
]

const principles = [
  {
    icon: RouteIcon,
    title: "Ordinary TanStack Router",
    description:
      "File routes, beforeLoad, loaders, search params, pending and error components work as documented by TanStack. The platform adds a typed context.platform and a shell-backed history.",
    href: "/docs/routing/route-guards",
  },
  {
    icon: LayersIcon,
    title: "Isolated by construction",
    description:
      "Every MFE and widget renders in its own React root with scoped CSS and owner-tagged overlay roots. React 18 and React 19 remotes run side by side.",
    href: "/docs/isolation/react-roots",
  },
  {
    icon: BoxesIcon,
    title: "Federation you never configure",
    description:
      "The Vite plugin generates the Module Federation config and the manifest; the host negotiates shared dependencies by version group. MFE code never imports @module-federation/*.",
    href: "/docs/module-federation",
  },
  {
    icon: ShieldCheckIcon,
    title: "Failures stay where they happen",
    description:
      "Every boundary has loading, error, unavailable and retry states. A failed remote, widget, command or settings field never takes the shell down.",
    href: "/docs/failure-handling",
  },
]

const example = `// src/routes/assets/$assetId.tsx
import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/assets/$assetId")({
  beforeLoad: ({ context }) => {
    if (!context.platform.permissions.hasGroup("assets:read")) {
      throw redirect({ to: "/" })
    }
  },
  loader: ({ context, params }) => {
    const span = context.platform.telemetry.span("load-asset")
    return fetchAsset(params.assetId).finally(() => span.end())
  },
  staticData: {
    breadcrumb: { fromLoader: "name" },
    permissionGroups: ["assets:read"],
  },
  component: AssetPage,
})`

function Home() {
  return (
    <div className="container-wrapper flex flex-1 flex-col px-6">
      <div className="container flex flex-1 flex-col gap-16 py-12 md:py-20">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge size="md">TanStack Router · Vite · React 18 + 19</Badge>
              <Badge size="md" variant="secondary" appearance="outline">
                Tecton UI
              </Badge>
            </div>
            <h1 className="text-4xl font-medium tracking-tight text-balance md:text-5xl">
              Micro-frontends that feel like a normal TanStack Router app.
            </h1>
            <p className="text-muted-foreground max-w-prose text-base md:text-lg">
              {siteConfig.description} Write routes, components and business logic; the platform
              owns federation, history, isolation, storage namespacing, overlays and the shell.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href="/docs" size="lg">
                Get started <ArrowRightIcon data-icon="inline-end" />
              </LinkButton>
              <LinkButton href="/docs/guides" size="lg" variant="outline">
                Browse the guides
              </LinkButton>
            </div>
            <div className="bg-card text-muted-foreground flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-xs">
              <TerminalIcon className="size-3.5" />
              <span>{siteConfig.createCommand}</span>
              <CopyButton value={siteConfig.createCommand} size="icon-xs" />
            </div>
          </div>
          <CodeBlock code={example} lang="tsx" title="src/routes/assets/$assetId.tsx" />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Four packages</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <Card key={pkg.name} className="flex flex-col">
                <CardHeader>
                  <pkg.icon className="text-muted-foreground mb-2 size-5" />
                  <CardTitle className="font-mono text-sm">{pkg.name}</CardTitle>
                  <CardDescription>
                    <span className="text-foreground font-medium">{pkg.title}.</span>{" "}
                    {pkg.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Link
                    to={pkg.href}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Reference <ArrowRightIcon className="ml-1 inline size-3.5" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((item) => (
            <Card key={item.title} className="flex flex-col">
              <CardHeader>
                <item.icon className="text-muted-foreground mb-2 size-5" />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Link
                  to={item.href}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  Learn more <ArrowRightIcon className="ml-1 inline size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="bg-card flex flex-col gap-4 rounded-xl border p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-medium">Built for people and coding agents.</h2>
            <p className="text-muted-foreground max-w-prose text-sm">
              Predictable file locations, one canonical pattern per task, actionable errors with
              a docs link, and machine-readable manifests, schemas, <code>llm.txt</code> and{" "}
              <code>llms.txt</code>.
            </p>
          </div>
          <LinkButton href="/docs/ai-friendly" variant="secondary" size="sm">
            AI-friendly design
          </LinkButton>
        </section>
      </div>
    </div>
  )
}
