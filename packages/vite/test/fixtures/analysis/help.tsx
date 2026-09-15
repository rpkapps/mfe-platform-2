import { HelpRegistration, useRegisterHelp, useRegisterReleaseNotes, useBreadcrumb, useRuntimeEnv, useNotifications } from "@platform/react"

export function Help() {
  useBreadcrumb({ label: "Help" })
  useRuntimeEnv()
  useNotifications()
  useRegisterHelp([
    { id: "getting-started", title: "Getting started", keywords: ["intro"], route: "/help" },
    { id: "faq", title: "FAQ", href: "https://example.com/faq" },
  ])
  useRegisterReleaseNotes({ id: "v1-2", version: "1.2.0", title: "Bulk export", date: "2026-01-01", summary: "Export many assets at once." })
  return <HelpRegistration definition={{ id: "contact", title: "Contact support", description: "Reach the team" }} />
}
