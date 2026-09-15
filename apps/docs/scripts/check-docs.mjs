// docs:check — verifies that error-code docs paths, navigation entries and
// internal links resolve, and that llms.txt is up to date.
import { existsSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import {
  appRoot,
  contentDir,
  coreSchemasDir,
  headingIds,
  listMdxFiles,
  loadCore,
  pageFileFor,
  publicSchemasDir,
  readFrontmatter,
  renderLlmsTxt,
  repoRoot,
  walkContent,
} from "./docs-lib.mjs"

const problems = []
const problem = (message) => problems.push(message)
const rel = (file) => relative(appRoot, file).replace(/\\/g, "/")

const pageCache = new Map()
function pageInfo(file) {
  if (!pageCache.has(file)) {
    const { data, body } = readFrontmatter(file)
    pageCache.set(file, { data, ids: headingIds(body) })
  }
  return pageCache.get(file)
}

/** Resolve `/docs/path#anchor`; returns an error string or null. */
function checkDocsUrl(url) {
  const [path, anchor] = url.split("#")
  const file = pageFileFor(path)
  if (!file) return `page not found for ${path}`
  if (anchor && !pageInfo(file).ids.has(anchor)) {
    return `anchor #${anchor} not found in ${rel(file)} (headings: ${[...pageInfo(file).ids].join(", ")})`
  }
  return null
}

// 1. ERROR_CODES docs paths
const core = await loadCore()
for (const [code, { docs }] of Object.entries(core.ERROR_CODES)) {
  const error = checkDocsUrl(`/docs${docs}`)
  if (error) problem(`ERROR_CODES.${code}.docs = "${docs}": ${error}`)
}

// 2. meta.json entries exist, and every page is reachable from meta.json
const reachable = new Set()
for (const item of walkContent()) {
  if (item.type === "missing") problem(`${rel(join(item.dir, "meta.json"))}: entry "${item.entry}" has no page or folder`)
  if (item.type === "page") reachable.add(item.file)
}
for (const file of listMdxFiles()) {
  if (!reachable.has(file)) problem(`${rel(file)} is not listed in a meta.json`)
  const { data } = pageInfo(file)
  if (!data.title) problem(`${rel(file)}: missing frontmatter title`)
  if (!data.description) problem(`${rel(file)}: missing frontmatter description`)
}

// 3. internal links
const linkPattern = /\]\(([^)\s]+)\)/g
for (const file of listMdxFiles()) {
  const text = readFileSync(file, "utf8")
  let inFence = false
  let lineNumber = 0
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1]
      const where = `${rel(file)}:${lineNumber}`
      if (/^(https?:|mailto:)/.test(target)) continue
      if (target.startsWith("#")) {
        if (!pageInfo(file).ids.has(target.slice(1))) problem(`${where}: anchor ${target} not found in the page`)
      } else if (target.startsWith("/docs")) {
        const error = checkDocsUrl(target)
        if (error) problem(`${where}: ${target} → ${error}`)
      } else if (target.startsWith("/schemas/")) {
        const name = target.slice("/schemas/".length)
        if (!existsSync(join(publicSchemasDir, name)) && !existsSync(join(coreSchemasDir, name))) {
          problem(`${where}: schema ${target} does not exist (run docs:generate)`)
        }
      } else if (target === "/" || target === "/llm.txt" || target === "/llms.txt" || target === "/AGENTS.md") {
        // site root and repository files
      } else if (target.startsWith("/")) {
        problem(`${where}: unknown internal link ${target}`)
      } else {
        problem(`${where}: relative link ${target} (use absolute /docs/… links)`)
      }
    }
  }
}

// 4. llms.txt up to date
const llmsFile = join(repoRoot, "llms.txt")
if (!existsSync(llmsFile)) problem("llms.txt is missing at the repository root (run docs:generate)")
else if (readFileSync(llmsFile, "utf8") !== renderLlmsTxt()) problem("llms.txt is out of date (run pnpm --filter docs docs:generate)")
for (const match of renderLlmsTxt().matchAll(/\]\((https:\/\/platform\.docs\.local)(\/docs[^)\s]*)\)/g)) {
  const error = checkDocsUrl(match[2])
  if (error) problem(`llms.txt: ${match[2]} → ${error}`)
}
if (!existsSync(join(repoRoot, "llm.txt"))) problem("llm.txt is missing at the repository root (run docs:generate)")

// 5. generated pages present
for (const name of ["error-codes", "capabilities", "schemas"]) {
  if (!existsSync(join(contentDir, "reference", "generated", `${name}.mdx`))) problem(`reference/generated/${name}.mdx is missing (run docs:generate)`)
}

if (problems.length) {
  console.error(`docs:check found ${problems.length} problem(s):`)
  for (const message of problems) console.error(`  - ${message}`)
  process.exit(1)
}
console.log(`docs:check: ${listMdxFiles().length} pages, ${Object.keys(core.ERROR_CODES).length} error codes, links and llms.txt OK`)
