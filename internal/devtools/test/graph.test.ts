import { describe, expect, it } from "vitest"
import { parseRuntimeConfig } from "@platform-internal/core"
import { createSnapshot } from "@platform-internal/diagnostics"

import { buildDependencyGraph } from "../src/graph"
import { listDevtoolsPanels, registerDevtoolsPanel } from "../src/registry"

describe("dependency graph", () => {
  it("groups shared packages by scope and marks bundled copies", () => {
    const snapshot = createSnapshot({
      runtimeConfig: parseRuntimeConfig({}),
      remotes: [
        {
          mfeId: "a",
          state: "mounted",
          attempts: 1,
          discoverable: true,
          enabled: true,
          loaded: true,
          instances: [{ instanceId: "a#1", mfeId: "a", state: "mounted", attempts: 1 }],
        },
        {
          mfeId: "b",
          state: "mounted",
          attempts: 1,
          discoverable: true,
          enabled: true,
          loaded: true,
          instances: [],
        },
      ],
      shared: {
        a: [
          {
            name: "react",
            scope: "react19",
            outcome: "shared",
            version: "19.3.0",
            from: "shell",
            reason: "loaded-first",
          },
          {
            name: "zod",
            scope: "default",
            outcome: "bundled",
            version: "4.0.0",
            reason: "no provider",
          },
        ],
        b: [
          {
            name: "react",
            scope: "react18",
            outcome: "shared",
            version: "18.3.1",
            from: "mfe_a",
            reason: "highest",
          },
        ],
      },
    })
    const graph = buildDependencyGraph(snapshot)
    const ids = graph.nodes.map((node) => node.id)
    expect(ids).toContain("shell")
    expect(ids).toContain("remote:a")
    expect(ids).toContain("instance:a#1")
    expect(ids).toContain("package:react19/react@19.3.0")
    expect(ids).toContain("package:react18/react@18.3.1")
    expect(ids).toContain("bundled:a:zod")
    expect(graph.scopes).toEqual({
      default: ["bundled:a:zod"],
      react18: ["package:react18/react@18.3.1"],
      react19: ["package:react19/react@19.3.0"],
    })
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "shell",
        target: "package:react19/react@19.3.0",
        kind: "provides",
      })
    )
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "remote:a",
        target: "package:react18/react@18.3.1",
        kind: "provides",
      })
    )
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "remote:b",
        target: "package:react18/react@18.3.1",
        kind: "uses",
      })
    )
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: "remote:a", target: "bundled:a:zod", label: "bundled" })
    )
    expect(graph.nodes.find((node) => node.id === "bundled:a:zod")?.kind).toBe("bundled")
  })

  it("registers custom panels", () => {
    const dispose = registerDevtoolsPanel({ id: "custom", title: "Custom", render: () => null })
    expect(listDevtoolsPanels().map((panel) => panel.id)).toContain("custom")
    dispose()
    expect(listDevtoolsPanels().map((panel) => panel.id)).not.toContain("custom")
  })
})
