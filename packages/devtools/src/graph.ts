import type { DiagnosticSnapshot } from "@platform-internal/diagnostics"

export interface DependencyNode {
  id: string
  kind: "shell" | "remote" | "instance" | "package" | "bundled"
  label: string
  /** Share scope (version group) for packages. */
  scope?: string
  detail?: string
  position: { x: number; y: number }
}

export interface DependencyEdge {
  id: string
  source: string
  target: string
  kind: "uses" | "provides" | "mounts"
  label?: string
}

export interface DependencyGraph {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  /** Scope → package node ids, for grouping and the legend. */
  scopes: Record<string, string[]>
}

const COLUMN = 260
const ROW = 72

/**
 * Nodes: the shell, every loaded remote (with its instances) and every
 * shared package@version grouped by share scope. Edges: `provides` from a
 * provider to a package, `uses` from a remote to the package it resolved.
 * Bundled packages are per-remote dashed nodes. Deterministic layout.
 */
export function buildDependencyGraph(snapshot: DiagnosticSnapshot): DependencyGraph {
  const nodes: DependencyNode[] = []
  const edges: DependencyEdge[] = []
  const scopes: Record<string, string[]> = {}
  const packageIds = new Map<string, string>()
  const remoteIds = new Set(snapshot.remotes.map((remote) => remote.mfeId))
  const providerNode = (from: string | undefined) => {
    if (!from) return "shell"
    if (from === "shell") return "shell"
    const byFederationName = snapshot.remotes.find(
      (remote) => remote.mfeId === from || from === `mfe_${remote.mfeId.replace(/-/g, "_")}`
    )
    return byFederationName
      ? `remote:${byFederationName.mfeId}`
      : remoteIds.has(from)
        ? `remote:${from}`
        : "shell"
  }

  nodes.push({
    id: "shell",
    kind: "shell",
    label: "Shell",
    detail: snapshot.host.environment,
    position: { x: 0, y: 0 },
  })

  let remoteRow = 0
  for (const remote of snapshot.remotes) {
    if (!remote.loaded && remote.instances.length === 0) continue
    const id = `remote:${remote.mfeId}`
    nodes.push({
      id,
      kind: "remote",
      label: remote.displayName ?? remote.mfeId,
      detail: `${remote.state}${remote.version ? ` · v${remote.version}` : ""}${remote.reactVersion ? ` · React ${remote.reactVersion}` : ""}`,
      position: { x: COLUMN, y: ROW * (remoteRow + 1) },
    })
    edges.push({ id: `mounts:${remote.mfeId}`, source: "shell", target: id, kind: "mounts" })
    let instanceRow = 0
    for (const instance of remote.instances) {
      if (instance.state === "disposed") continue
      const instanceNodeId = `instance:${instance.instanceId}`
      nodes.push({
        id: instanceNodeId,
        kind: "instance",
        label: instance.widgetId ? `${instance.widgetId} widget` : "route instance",
        detail: `${instance.instanceId} · ${instance.state}`,
        position: { x: COLUMN * 2, y: ROW * (remoteRow + 1) + instanceRow * 40 },
      })
      edges.push({
        id: `instance:${instance.instanceId}`,
        source: id,
        target: instanceNodeId,
        kind: "mounts",
      })
      instanceRow += 1
    }
    remoteRow += Math.max(1, instanceRow)
  }

  let packageRow = 0
  const scopeOrder = Object.keys(snapshot.shared)
    .flatMap((mfeId) => snapshot.shared[mfeId]!.map((row) => row.scope))
    .filter((scope, index, all) => all.indexOf(scope) === index)
    .sort()
  for (const scope of scopeOrder) scopes[scope] = []

  for (const [mfeId, rows] of Object.entries(snapshot.shared)) {
    const remoteNodeId = `remote:${mfeId}`
    if (!nodes.some((node) => node.id === remoteNodeId)) {
      nodes.push({
        id: remoteNodeId,
        kind: "remote",
        label: mfeId,
        detail: "registered",
        position: { x: COLUMN, y: ROW * (remoteRow + 1) },
      })
      remoteRow += 1
    }
    for (const row of rows) {
      if (row.outcome === "shared") {
        const key = `${row.scope}/${row.name}@${row.version ?? "?"}`
        let nodeId = packageIds.get(key)
        if (!nodeId) {
          nodeId = `package:${key}`
          packageIds.set(key, nodeId)
          nodes.push({
            id: nodeId,
            kind: "package",
            label: `${row.name}@${row.version ?? "?"}`,
            scope: row.scope,
            detail: `scope ${row.scope}`,
            position: { x: COLUMN * 3, y: ROW * (packageRow + 1) },
          })
          packageRow += 1
          scopes[row.scope] = [...(scopes[row.scope] ?? []), nodeId]
          const provider = providerNode(row.from)
          edges.push({
            id: `provides:${provider}:${key}`,
            source: provider,
            target: nodeId,
            kind: "provides",
            label: "provides",
          })
        }
        edges.push({
          id: `uses:${mfeId}:${key}`,
          source: remoteNodeId,
          target: nodeId,
          kind: "uses",
          label: row.reason.includes("loaded") ? "uses (loaded-first)" : "uses",
        })
      } else {
        const nodeId = `bundled:${mfeId}:${row.name}`
        nodes.push({
          id: nodeId,
          kind: "bundled",
          label: `${row.name}@${row.version ?? "?"} (bundled)`,
          scope: row.scope,
          detail: row.reason,
          position: { x: COLUMN * 3, y: ROW * (packageRow + 1) },
        })
        packageRow += 1
        scopes[row.scope] = [...(scopes[row.scope] ?? []), nodeId]
        edges.push({
          id: `uses:${mfeId}:${nodeId}`,
          source: remoteNodeId,
          target: nodeId,
          kind: "uses",
          label: "bundled",
        })
      }
    }
  }
  return { nodes, edges, scopes }
}
