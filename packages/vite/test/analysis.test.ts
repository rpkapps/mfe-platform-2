import { readFileSync } from "node:fs"
import { join } from "node:path"

import { IMPLICIT_CAPABILITIES } from "@platform-internal/core"
import { describe, expect, it } from "vitest"

import {
  analyzeProjectSources,
  analyzeSourceFile,
  finalizeCapabilities,
  listSourceFiles,
  mergeAnalyses,
} from "../src/analysis"

const dir = join(__dirname, "fixtures", "analysis")
const analyze = (name: string) =>
  analyzeSourceFile(readFileSync(join(dir, name), "utf8"), join(dir, name))

describe("analyzeSourceFile", () => {
  it("collects commands from hooks, components and same-file constants", () => {
    const result = analyze("commands.tsx")
    expect(result.usesSdk).toBe(true)
    expect(result.capabilities.sort()).toEqual(["commands", "navigation", "telemetry"])
    expect(result.commands).toEqual([
      { id: "create-asset", label: "Create asset", route: "/assets/new", static: false },
      {
        id: "export-csv",
        label: "Export as CSV",
        description: "Download the current table",
        group: "Assets",
        keywords: ["download", "csv"],
        shortcut: "mod+shift+e",
        permissionGroups: ["assets:export"],
        route: "/assets",
        static: false,
      },
      { id: "refresh", label: "Refresh", group: "General", static: false },
    ])
    // buildDynamicCommand() is not an object literal: warned, not thrown. The
    // component-registered command whose label is a template literal is not warned
    // about — see below.
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain("not an object literal")
  })

  it("leaves a component's runtime-labelled command to register itself, silently", () => {
    // The pattern the CLI template and the widget docs both use: a widget command
    // labelled from its props. The label is only knowable at runtime, and the
    // palette cannot offer a row without one, so it is left out of the manifest —
    // with nothing for the developer to fix, and so nothing to warn about.
    const result = analyzeSourceFile(
      [
        'import { useRegisterCommand } from "@platform/react"',
        "export function AssetCard({ assetId }: { assetId: string }) {",
        '  useRegisterCommand({ id: "open-asset", label: `Open ${assetId}`, handler: () => {} })',
        "  return null",
        "}",
      ].join("\n"),
      "asset-card.tsx"
    )
    expect(result.commands).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it("reports a command it cannot identify, and a static one it cannot label", () => {
    // A non-literal id: the command cannot be named at all, whoever registers it.
    const unnamed = analyzeSourceFile(
      [
        'import { useRegisterCommand } from "@platform/react"',
        "export function C({ id }: { id: string }) {",
        '  useRegisterCommand({ id, label: "Open" })',
        "  return null",
        "}",
      ].join("\n"),
      "c.tsx"
    )
    expect(unnamed.warnings).toEqual([expect.stringContaining("needs a literal `id`")])
    // A static registration is module-scope data, so a label it cannot state is a
    // real omission — and the warning names the command.
    const staticNote = analyzeSourceFile(
      [
        'import { createMfe } from "@platform/react"',
        "const suffix = String(Date.now())",
        "export default createMfe({",
        '  mfeId: "asset-tracker",',
        '  registrations: { commands: [{ id: "export-csv", label: `Export ${suffix}` }] },',
        "})",
      ].join("\n"),
      "mfe.tsx"
    )
    expect(staticNote.warnings).toEqual([
      expect.stringContaining('static command "export-csv" needs a literal `label`'),
    ])
  })

  it("infers settings groups, field kinds and storage scopes", () => {
    const result = analyze("settings.tsx")
    expect(result.capabilities.sort()).toEqual(["settings", "storage.local", "storage.session"])
    expect(result.settings).toEqual([
      {
        key: "display",
        title: "Display",
        description: "How things look",
        keywords: ["theme"],
        managedBy: "framework",
        fields: [
          { key: "density", label: "Density", kind: "select" },
          { key: "pageSize", label: "Page size", description: "Rows per page", kind: "number" },
          { key: "compact", kind: "boolean" },
          { key: "columns", kind: "multi-select" },
          { key: "tags", kind: "unknown" },
          { key: "custom", kind: "text" },
          { key: "opaque", kind: "unknown" },
        ],
      },
      { key: "advanced", title: "advanced", managedBy: "mfe", route: "/settings", fields: [] },
    ])
    expect(result.settingsFields).toEqual([
      { group: "display", field: { key: "extra", label: "Extra", kind: "number" } },
      { group: "other", field: { key: "flag", kind: "boolean" } },
    ])
  })

  it("collects help entries and release notes from arrays, objects and components", () => {
    const result = analyze("help.tsx")
    expect(result.capabilities.sort()).toEqual([
      "breadcrumbs",
      "help",
      "notifications",
      "release-notes",
      "runtime-env",
    ])
    expect(result.help).toEqual([
      { id: "getting-started", title: "Getting started", keywords: ["intro"], route: "/help" },
      { id: "faq", title: "FAQ", href: "https://example.com/faq" },
      { id: "contact", title: "Contact support", description: "Reach the team" },
    ])
    expect(result.releaseNotes).toEqual([
      {
        id: "v1-2",
        version: "1.2.0",
        title: "Bulk export",
        date: "2026-01-01",
        summary: "Export many assets at once.",
      },
    ])
  })

  it("reads widgets and static registrations from createMfe", () => {
    const result = analyze("mfe.tsx")
    expect(result.capabilities).toEqual(["widgets"])
    expect(result.widgets).toEqual([
      { id: "status", title: "Status", description: "Live status" },
      { id: "asset-count", title: "Asset count" },
      { id: "status", title: "Status", description: "Live status" },
    ])
    expect(result.commands).toEqual([
      { id: "open-assets", label: "Open assets", route: "/assets", static: true },
    ])
    expect(result.help).toEqual([{ id: "overview", title: "Overview" }])
    expect(result.releaseNotes).toEqual([
      { id: "v1-0", version: "1.0.0", title: "Initial release" },
    ])
  })

  it("supports namespace imports and ignores files without SDK imports", () => {
    const namespaced = analyze("namespace.tsx")
    expect(namespaced.capabilities).toEqual(["context", "commands"])
    expect(namespaced.commands).toEqual([
      { id: "ns-command", label: "Namespaced", static: false },
    ])
    const plain = analyze("plain.tsx")
    expect(plain.usesSdk).toBe(false)
    expect(plain.capabilities).toEqual([])
  })

  it("never throws on unparsable code", () => {
    const result = analyzeSourceFile(
      'import { useRegisterCommand } from "@platform/react"\nexport const x = {{{',
      "broken.tsx"
    )
    expect(result.capabilities).toEqual([])
    expect(result.commands).toEqual([])
    expect(result.warnings.some((warning) => warning.includes("could not parse"))).toBe(true)
  })
})

describe("project analysis", () => {
  it("lists source files without generated, declaration and test files", () => {
    // `listSourceFiles` returns filesystem paths; the separator is the platform's
    // (`mergeAnalyses` is what normalises them before they reach the manifest).
    const files = listSourceFiles(dir).map((file) =>
      file.slice(dir.length + 1).replace(/\\/g, "/")
    )
    expect(files).toEqual([
      "commands.tsx",
      "help.tsx",
      "mfe.tsx",
      "namespace.tsx",
      "plain.tsx",
      "routes/dynamic.tsx",
      "routes/guarded.tsx",
      "routes/lazy.lazy.tsx",
      "routes/plain.tsx",
      "settings.tsx",
    ])
  })

  it("merges files, dedupes ids and attaches pending settings fields", () => {
    const project = analyzeProjectSources({ root: dir, sourceDirectory: dir })
    expect(project.files).toEqual([
      "commands.tsx",
      "help.tsx",
      "mfe.tsx",
      "namespace.tsx",
      "settings.tsx",
    ])
    expect(project.widgets.map((widget) => widget.id)).toEqual(["status", "asset-count"])
    expect(
      project.warnings.some((warning) => warning.includes('duplicate widgets "status"'))
    ).toBe(true)
    const display = project.settings.find((group) => group.key === "display")
    expect(display?.fields.map((field) => field.key)).toContain("extra")
    expect(project.settings.find((group) => group.key === "other")).toEqual({
      key: "other",
      title: "other",
      managedBy: "framework",
      fields: [{ key: "flag", kind: "boolean" }],
    })
    expect(project.commands.map((command) => command.id)).toEqual([
      "create-asset",
      "export-csv",
      "refresh",
      "open-assets",
      "ns-command",
    ])
    expect(project.capabilities.sort()).toEqual([
      "breadcrumbs",
      "commands",
      "context",
      "help",
      "navigation",
      "notifications",
      "release-notes",
      "runtime-env",
      "settings",
      "storage.local",
      "storage.session",
      "telemetry",
      "widgets",
    ])
  })

  it("finalizes capabilities with implicit ones, additions and removals", () => {
    expect(
      finalizeCapabilities(["commands"], IMPLICIT_CAPABILITIES, ["widgets"], ["telemetry"])
    ).toEqual(["commands", "context", "navigation", "overlays", "widgets"])
    expect(mergeAnalyses([], dir).capabilities).toEqual([])
  })
})
