import { useEffect, useMemo } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { buildDependencyGraph } from "../graph"
import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Empty, Section } from "../ui"
import { GraphNode, type GraphNodeData } from "./graph-node"

/** Share scopes get a colour each; the node reads it from `data-scope-index`. */
const SCOPE_COLORS = [
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
  "var(--muted-foreground)",
]

const NODE_TYPES = { platform: GraphNode }

const MINIMAP_NODE_COLOR = (node: Node) => {
  const kind = (node.data as GraphNodeData).kind
  if (kind === "shell") return "var(--primary)"
  if (kind === "remote") return "var(--ring)"
  if (kind === "bundled") return "var(--muted-foreground)"
  return "var(--border)"
}

export function DependenciesPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const graph = useMemo(() => buildDependencyGraph(snapshot), [snapshot])
  const scopeIndex = useMemo(
    () => Object.fromEntries(Object.keys(graph.scopes).map((scope, index) => [scope, index])),
    [graph]
  )
  const computedNodes: Node[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "platform",
        position: node.position,
        data: {
          label: node.label,
          detail: node.detail,
          kind: node.kind,
          scope: node.scope,
          scopeIndex:
            node.scope === undefined
              ? undefined
              : (scopeIndex[node.scope] ?? 0) % SCOPE_COLORS.length,
        } satisfies GraphNodeData,
        draggable: true,
      })),
    [graph, scopeIndex]
  )
  const computedEdges: Edge[] = useMemo(
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
  // Held in state so dragging a node survives the snapshot refresh underneath it.
  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges)
  useEffect(() => {
    setNodes((current) => {
      const moved = new Map(current.map((node) => [node.id, node.position]))
      return computedNodes.map((node) => ({
        ...node,
        position: moved.get(node.id) ?? node.position,
      }))
    })
  }, [computedNodes, setNodes])
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges])

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
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={NODE_TYPES}
              fitView
              // `fitView` alone shrinks a wide graph to `minZoom` until the
              // labels are unreadable. Clamped at both ends it opens legible
              // and the user pans; zooming further out is still theirs to ask
              // for with the controls.
              fitViewOptions={{ padding: 0.15, minZoom: 0.6, maxZoom: 1 }}
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={1.6}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                bgColor="var(--muted)"
                maskColor="color-mix(in oklch, var(--background) 72%, transparent)"
                nodeColor={MINIMAP_NODE_COLOR}
                nodeStrokeWidth={0}
              />
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
