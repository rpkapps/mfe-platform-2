import { useMemo } from "react"
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { buildDependencyGraph, type DependencyNode } from "../graph"
import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Empty, Section } from "../ui"

const SCOPE_COLORS = [
  "var(--info-surface)",
  "var(--success-surface)",
  "var(--warning-surface)",
  "var(--destructive-surface)",
  "var(--muted)",
]

function nodeStyle(
  node: DependencyNode,
  scopeIndex: Record<string, number>
): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    borderRadius: 6,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    width: 200,
  }
  if (node.kind === "shell")
    return {
      ...base,
      background: "var(--primary)",
      color: "var(--primary-foreground)",
      borderColor: "var(--primary)",
    }
  if (node.kind === "remote") return { ...base, borderColor: "var(--ring)" }
  if (node.kind === "instance") return { ...base, borderStyle: "dotted" }
  if (node.kind === "bundled")
    return {
      ...base,
      borderStyle: "dashed",
      background: "var(--muted)",
      color: "var(--muted-foreground)",
    }
  const color = SCOPE_COLORS[(scopeIndex[node.scope ?? ""] ?? 0) % SCOPE_COLORS.length]
  return { ...base, background: color }
}

export function DependenciesPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const graph = useMemo(() => buildDependencyGraph(snapshot), [snapshot])
  const scopeIndex = useMemo(
    () => Object.fromEntries(Object.keys(graph.scopes).map((scope, index) => [scope, index])),
    [graph]
  )
  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: { label: node.detail ? `${node.label}\n${node.detail}` : node.label },
        style: { ...nodeStyle(node, scopeIndex), whiteSpace: "pre-wrap" },
        draggable: true,
      })),
    [graph, scopeIndex]
  )
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.kind === "uses",
        style:
          edge.kind === "provides"
            ? { stroke: "var(--success)" }
            : edge.kind === "mounts"
              ? { stroke: "var(--muted-foreground)" }
              : {
                  stroke: "var(--info)",
                  strokeDasharray: edge.label === "bundled" ? "4 4" : undefined,
                },
      })),
    [graph]
  )
  const rows = Object.entries(snapshot.shared).flatMap(([mfeId, list]) =>
    list.map((row) => [
      mfeId,
      row.name,
      row.scope,
      row.requiredVersion ?? "*",
      row.outcome,
      row.version ?? "—",
      row.from ?? "—",
      row.reason,
    ])
  )
  return (
    <>
      <Section title="Dependency graph">
        {graph.nodes.length <= 1 ? (
          <Empty>Load a remote to see shared and bundled packages by version group.</Empty>
        ) : (
          <div className="platform-devtools-graph" data-platform-devtools-graph="">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
            >
              <Background />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        )}
        <ul className="platform-devtools-legend" aria-label="Legend">
          <li>
            <span
              className="platform-devtools-swatch"
              style={{ background: "var(--primary)" }}
            />{" "}
            shell
          </li>
          <li>
            <span
              className="platform-devtools-swatch"
              style={{ border: "1px solid var(--ring)" }}
            />{" "}
            MFE
          </li>
          <li>
            <span
              className="platform-devtools-swatch"
              style={{ border: "1px dotted var(--border)" }}
            />{" "}
            instance
          </li>
          {Object.keys(graph.scopes).map((scope) => (
            <li key={scope}>
              <span
                className="platform-devtools-swatch"
                style={{
                  background: SCOPE_COLORS[(scopeIndex[scope] ?? 0) % SCOPE_COLORS.length],
                }}
              />{" "}
              shared package · scope <code>{scope}</code>
            </li>
          ))}
          <li>
            <span
              className="platform-devtools-swatch"
              style={{
                border: "1px dashed var(--muted-foreground)",
                background: "var(--muted)",
              }}
            />{" "}
            bundled copy
          </li>
          <li>
            solid green edge: provides · animated blue edge: uses · dashed: bundled fallback
          </li>
        </ul>
      </Section>
      <Section title="Resolution per MFE">
        <DataTable
          columns={[
            "MFE",
            "Package",
            "Scope",
            "Required",
            "Outcome",
            "Version",
            "Provider",
            "Reason",
          ]}
          rows={rows}
          empty="No shared dependency negotiation recorded yet."
        />
      </Section>
    </>
  )
}
