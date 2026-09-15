import { createFileRoute } from "@tanstack/react-router"
import { MfeOutlet } from "@platform/host/react"
import { MFE_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/failures")({
  staticData: { breadcrumb: "Failure lab" },
  component: FailureLab,
})

const cases = [
  { mfeId: MFE_IDS.broken, title: "Invalid manifest", detail: "The manifest fails validation (MANIFEST_INVALID)." },
  { mfeId: MFE_IDS.incompatible, title: "Incompatible protocol", detail: "Protocol 99 is not loadable (PROTOCOL_INCOMPATIBLE)." },
  { mfeId: MFE_IDS.unavailable, title: "Unavailable remote", detail: "Nothing listens on the manifest URL; retries with cache busting (MANIFEST_FETCH_FAILED)." },
  { mfeId: MFE_IDS.disabled, title: "Disabled by runtime configuration", detail: "`mfes.disabled-remote.enabled = false` (REMOTE_DISABLED)." },
  { mfeId: MFE_IDS.restricted, title: "Permission preflight", detail: "Requires the `superadmin` group nobody has (PERMISSION_DENIED)." },
]

function FailureLab() {
  const host = useShellHost()
  if (!host) return null
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Failure lab</h1>
      <p className="text-sm text-muted-foreground">Each boundary below fails in isolation: the shell and the other remotes keep working.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {cases.map((item) => (
          <section key={item.mfeId} data-failure-case={item.mfeId} className="rounded-md border border-border p-3">
            <h2 className="font-medium">{item.title}</h2>
            <p className="mb-2 text-xs text-muted-foreground">{item.detail}</p>
            <MfeOutlet mfeId={item.mfeId} />
          </section>
        ))}
      </div>
    </div>
  )
}
