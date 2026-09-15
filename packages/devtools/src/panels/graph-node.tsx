import { Handle, Position, type NodeProps } from "@xyflow/react"

import type { DependencyNodeKind } from "../graph"

export interface GraphNodeData extends Record<string, unknown> {
  label: string
  detail?: string
  kind: DependencyNodeKind
  scope?: string
  scopeIndex?: number
}

const KIND_LABEL: Record<DependencyNodeKind, string> = {
  shell: "Shell",
  remote: "MFE",
  instance: "Instance",
  package: "Shared",
  bundled: "Bundled",
}

/**
 * One node in the dependency graph. A real component rather than a string with
 * an embedded newline, so the kind, the name and the detail can be typeset
 * separately and the card can carry the theme's own surfaces.
 */
export function GraphNode({ data, selected }: NodeProps) {
  const node = data as GraphNodeData
  return (
    <div
      className="platform-devtools-node"
      data-kind={node.kind}
      data-scope={node.scope}
      data-scope-index={node.scopeIndex}
      data-selected={selected || undefined}
    >
      <Handle type="target" position={Position.Left} className="platform-devtools-handle" />
      <p className="platform-devtools-node-kind">{KIND_LABEL[node.kind]}</p>
      <p className="platform-devtools-node-label">{node.label}</p>
      {node.detail ? <p className="platform-devtools-node-detail">{node.detail}</p> : null}
      <Handle type="source" position={Position.Right} className="platform-devtools-handle" />
    </div>
  )
}
