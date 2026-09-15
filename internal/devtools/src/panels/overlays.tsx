import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, KeyValue, Section } from "../ui"

export function OverlaysPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const { overlays } = snapshot
  return (
    <>
      <Section title="Overlay roots">
        <KeyValue entries={[["Roots", String(overlays.roots.length)], ["Open layers", String(overlays.layers.length)], ["Top z-index", String(overlays.top)]]} />
        <DataTable columns={["Owner MFE", "Instance", "Widget", "Contained"]} empty="No overlay roots created." rows={overlays.roots.map((root) => [root.owner.mfeId, <code key="i">{root.owner.instanceId}</code>, root.owner.widgetId ?? "—", root.contained ? "yes" : "no"])} />
      </Section>
      <Section title="Open layers (in opening order)">
        <DataTable columns={["Layer", "Owner", "z-index", "Opened"]} empty="No overlays open." rows={overlays.layers.map((layer) => [String(layer.id), `${layer.owner.mfeId} / ${layer.owner.instanceId}${layer.owner.widgetId ? ` / ${layer.owner.widgetId}` : ""}`, String(layer.zIndex), new Date(layer.openedAt).toLocaleTimeString()])} />
      </Section>
    </>
  )
}
