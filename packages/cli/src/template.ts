import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Template rendering for `platform create`. One template tree serves every
 * variant (Tecton / plain, React 18 / 19):
 *
 * - `__TOKEN__` placeholders are replaced verbatim.
 * - `{{#flag}} … {{/flag}}` keeps its content when the flag is true,
 *   `{{^flag}} … {{/flag}}` when it is false. A block tag that stands alone on
 *   a line — optionally wrapped in a comment (`// {{#tecton}}`,
 *   `{/* {{#tecton}} *\/}`, `/* … *\/`, `<!-- … -->`, `# …`) so template files
 *   stay valid TypeScript, CSS, JSON or Markdown — removes the whole line.
 *   Inline blocks on one line are replaced in place.
 * - `_gitignore` → `.gitignore` (dotfile renames, so package managers and
 *   editors leave the template alone) and `*.tmpl` loses its suffix.
 */
export interface TemplateContext {
  flags: Record<string, boolean>
  tokens: Record<string, string>
}

const BLOCK_LINE_RE = /^[ \t]*(?:\/\/|\/\*|\{\/\*|<!--|#)?[ \t]*\{\{([#^/])([\w-]+)\}\}[ \t]*(?:\*\/\}|\*\/|-->)?[ \t]*$/
const INLINE_BLOCK_RE = /\{\{([#^])([\w-]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g

export function renderTemplate(source: string, context: TemplateContext): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  const stack: { name: string; active: boolean }[] = []
  const active = () => stack.every((frame) => frame.active)
  for (const line of lines) {
    const block = BLOCK_LINE_RE.exec(line)
    if (block) {
      const [, kind, name] = block as unknown as [string, string, string]
      if (kind === "/") {
        const frame = stack.pop()
        if (!frame || frame.name !== name) throw new Error(`Template block mismatch: closing {{/${name}}} without a matching opening tag.`)
      } else {
        const value = Boolean(context.flags[name])
        stack.push({ name, active: kind === "#" ? value : !value })
      }
      continue
    }
    if (!active()) continue
    output.push(renderInline(line, context))
  }
  if (stack.length > 0) throw new Error(`Template block "${stack[stack.length - 1]!.name}" is never closed.`)
  return output.join("\n")
}

function renderInline(line: string, context: TemplateContext): string {
  const withBlocks = line.replace(INLINE_BLOCK_RE, (_match, kind: string, name: string, body: string) => {
    const value = Boolean(context.flags[name])
    return (kind === "#" ? value : !value) ? body : ""
  })
  return replaceTokens(withBlocks, context.tokens)
}

export function replaceTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/__([A-Z][A-Z0-9_]*?)__/g, (match, name: string) => (name in tokens ? tokens[name]! : match))
}

const DOTFILE_RENAMES: Record<string, string> = {
  _gitignore: ".gitignore",
  _npmrc: ".npmrc",
  _prettierrc: ".prettierrc",
  _prettierignore: ".prettierignore",
  _editorconfig: ".editorconfig",
  _env: ".env",
  _env_example: ".env.example",
}

/** Target name of a template file (`_gitignore` → `.gitignore`, `x.tmpl` → `x`). */
export function targetFileName(name: string): string {
  const renamed = DOTFILE_RENAMES[name] ?? name
  return renamed.endsWith(".tmpl") ? renamed.slice(0, -".tmpl".length) : renamed
}

const BINARY_RE = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i

export interface RenderedFile {
  /** Relative path in the target (already renamed). */
  path: string
  content: string | Buffer
}

/** Render every file of a template directory (recursively) without writing anything. */
export function renderTemplateDir(templateDir: string, context: TemplateContext, options: { exclude?: (relativePath: string) => boolean } = {}): RenderedFile[] {
  const files: RenderedFile[] = []
  const walk = (dir: string, target: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const source = join(dir, entry)
      const targetName = replaceTokens(targetFileName(entry), context.tokens)
      const targetPath = target ? `${target}/${targetName}` : targetName
      if (statSync(source).isDirectory()) {
        walk(source, targetPath)
        continue
      }
      if (options.exclude?.(targetPath)) continue
      if (BINARY_RE.test(entry)) {
        files.push({ path: targetPath, content: readFileSync(source) })
      } else {
        files.push({ path: targetPath, content: renderTemplate(readFileSync(source, "utf8"), context) })
      }
    }
  }
  walk(templateDir, "")
  return files
}

export function writeRenderedFiles(targetDir: string, files: RenderedFile[]): string[] {
  const written: string[] = []
  for (const file of files) {
    const destination = join(targetDir, ...file.path.split("/"))
    mkdirSync(join(destination, ".."), { recursive: true })
    writeFileSync(destination, file.content)
    written.push(relative(targetDir, destination).replace(/\\/g, "/"))
  }
  return written
}
