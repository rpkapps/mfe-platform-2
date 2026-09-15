import { createFileRoute } from "@tanstack/react-router"
import { MfeOutlet } from "@platform/host-react"
import { MFE_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@tecton/react/tecton/panel"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/failures")({
  staticData: { breadcrumb: "Failure lab" },
  component: FailureLab,
})

const cases = [
  {
    mfeId: MFE_IDS.broken,
    title: "Invalid manifest",
    code: "MANIFEST_INVALID",
    detail: "The manifest fails validation.",
  },
  {
    mfeId: MFE_IDS.incompatible,
    title: "Incompatible protocol",
    code: "PROTOCOL_INCOMPATIBLE",
    detail: "Protocol 99 is not loadable.",
  },
  {
    mfeId: MFE_IDS.unavailable,
    title: "Unavailable remote",
    code: "MANIFEST_FETCH_FAILED",
    detail: "Nothing listens on the manifest URL; the host retries with cache busting.",
  },
  {
    mfeId: MFE_IDS.disabled,
    title: "Disabled by runtime configuration",
    code: "REMOTE_DISABLED",
    detail: "mfes.disabled-remote.enabled = false.",
  },
  {
    mfeId: MFE_IDS.restricted,
    title: "Permission preflight",
    code: "PERMISSION_DENIED",
    detail: "Requires the superadmin group nobody has.",
  },
]

function FailureLab() {
  const host = useShellHost()
  if (!host) return null
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Diagnostics</PageHeaderEyebrow>
          <PageHeaderTitle>Failure lab</PageHeaderTitle>
          <PageHeaderDescription>
            Each boundary below fails in isolation: the shell and the other remotes keep
            working, and every failure renders the shell&rsquo;s own error state with the code
            the host raised.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {cases.map((item) => (
          <Panel key={item.mfeId} data-failure-case={item.mfeId}>
            <PanelHeader>
              <PanelTitle className="flex items-center gap-2">
                {item.title}
                <Badge variant="destructive" appearance="outline" className="font-mono">
                  {item.code}
                </Badge>
              </PanelTitle>
              <PanelDescription>{item.detail}</PanelDescription>
            </PanelHeader>
            <PanelContent>
              <MfeOutlet mfeId={item.mfeId} />
            </PanelContent>
          </Panel>
        ))}
      </div>
    </div>
  )
}
