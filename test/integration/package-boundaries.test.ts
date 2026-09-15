import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/**
 * The platform is a micro-frontend runtime that ships adapters for React,
 * TanStack Router and Tecton; it does not depend on them. That claim is only
 * true if it is checked, because a single import or a stray peer dependency
 * quietly undoes it.
 *
 * Two checks:
 *
 * 1. Manifest — every package declares exactly the dependencies and peer
 *    dependencies listed here. An allow-list rather than a deny-list, so a new
 *    dependency is a deliberate edit to this file.
 * 2. Source — the packages that must stay framework-neutral never import the
 *    frameworks, not even as types.
 *
 * `enforced: false` marks a package the migration has not reached yet. Flip it
 * as each step lands; the list is the definition of done.
 */

interface ManifestRule {
  /** Workspace-relative directory. */
  dir: string
  dependencies: string[]
  peerDependencies: string[]
  enforced: boolean
  /** Why it is not enforced yet. */
  todo?: string
}

const CATALOG_INTERNAL = /^@platform-internal\//

const manifestRules: ManifestRule[] = [
  {
    // The runtime. Zero peers is the whole point: a non-React shell installs
    // this and writes its own bindings.
    dir: "packages/host",
    dependencies: ["@module-federation/runtime", "zod"],
    peerDependencies: [],
    enforced: false,
    todo: "A2 removes @xyflow/react; A3 moves the React/Tecton files out; A4 drops the peers",
  },
  {
    // React bindings for a shell. Platform API, not opinion — no design system.
    dir: "packages/host-react",
    dependencies: [],
    peerDependencies: ["react", "react-dom", "@tanstack/react-router"],
    enforced: false,
    todo: "created in A3",
  },
  {
    dir: "internal/core",
    dependencies: ["zod", "@standard-schema/spec"],
    peerDependencies: [],
    enforced: true,
  },
  {
    dir: "internal/diagnostics",
    dependencies: ["@platform-internal/core"],
    peerDependencies: [],
    enforced: true,
  },
  {
    dir: "internal/module-federation",
    dependencies: ["@platform-internal/core", "@module-federation/runtime"],
    peerDependencies: [],
    enforced: true,
  },
]

/** Package names a framework-neutral module may never import. */
const FRAMEWORK = [/^react$/, /^react-dom(\/|$)/, /^@tanstack\//, /^@tecton\//]
const DESIGN_SYSTEM = [/^@tecton\//, /^react-aria-components$/, /^sonner$/, /^lucide-react$/]

interface SourceRule {
  dir: string
  banned: RegExp[]
  enforced: boolean
  todo?: string
}

const sourceRules: SourceRule[] = [
  { dir: "internal/core/src", banned: FRAMEWORK, enforced: true },
  { dir: "internal/diagnostics/src", banned: FRAMEWORK, enforced: true },
  { dir: "internal/module-federation/src", banned: FRAMEWORK, enforced: true },
  {
    dir: "packages/host/src",
    banned: FRAMEWORK,
    enforced: false,
    todo: "A3 moves src/react/ and src/tanstack.ts out",
  },
  {
    // May use React — that is its job — but never a design system.
    dir: "packages/host-react/src",
    banned: DESIGN_SYSTEM,
    enforced: false,
    todo: "created in A3",
  },
]

function readManifest(dir: string): Record<string, unknown> | null {
  const file = join(root, dir, "package.json")
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
}

function names(field: unknown): string[] {
  return field ? Object.keys(field as Record<string, string>).sort() : []
}

function sourceFiles(dir: string): string[] {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return []
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const file = join(current, entry)
      if (statSync(file).isDirectory()) {
        walk(file)
        continue
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(file)
    }
  }
  walk(absolute)
  return out
}

/** Static and dynamic import specifiers, plus `export … from`. Type-only imports count. */
function importsOf(code: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /(?:^|\n)\s*(?:import|export)[\s\S]*?\sfrom\s*["']([^"']+)["']/g,
    /(?:^|[^.\w])import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
  ]
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]!)
  }
  return specifiers
}

describe("package manifests declare only their allowed dependencies", () => {
  for (const rule of manifestRules) {
    const label = rule.enforced ? rule.dir : `${rule.dir} (pending: ${rule.todo})`
    it.skipIf(!rule.enforced)(label, () => {
      const manifest = readManifest(rule.dir)
      expect(manifest, `${rule.dir}/package.json is missing`).not.toBeNull()
      expect(names(manifest!.dependencies)).toEqual([...rule.dependencies].sort())
      expect(names(manifest!.peerDependencies)).toEqual([...rule.peerDependencies].sort())
    })
  }
})

describe("framework-neutral sources never import a framework", () => {
  for (const rule of sourceRules) {
    const label = rule.enforced ? rule.dir : `${rule.dir} (pending: ${rule.todo})`
    it.skipIf(!rule.enforced)(label, () => {
      const files = sourceFiles(rule.dir)
      expect(files.length, `no sources found under ${rule.dir}`).toBeGreaterThan(0)
      const offences: string[] = []
      for (const file of files) {
        for (const specifier of importsOf(readFileSync(file, "utf8"))) {
          if (rule.banned.some((pattern) => pattern.test(specifier)))
            offences.push(`${relative(root, file)} imports "${specifier}"`)
        }
      }
      expect(offences).toEqual([])
    })
  }
})

describe("internal packages are bundled, never installed by consumers", () => {
  it("no public package lists @platform-internal/* as a runtime dependency", () => {
    const offences: string[] = []
    for (const dir of readdirSync(join(root, "packages"))) {
      const manifest = readManifest(join("packages", dir))
      if (!manifest) continue
      for (const name of names(manifest.dependencies)) {
        if (CATALOG_INTERNAL.test(name))
          offences.push(`packages/${dir} depends on ${name} (belongs in devDependencies)`)
      }
    }
    expect(offences).toEqual([])
  })
})
