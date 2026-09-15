import { createFileRoute, Link, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/settings")({
  staticData: { breadcrumb: "Settings", navigation: { title: "Asset settings", keywords: ["preferences"], order: 2 } },
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Framework-managed settings appear in the shell settings host. The MFE-managed page lives{" "}
        <Link to="/settings/custom" className="underline">
          here
        </Link>
        .
      </p>
      <Outlet />
    </div>
  )
}
