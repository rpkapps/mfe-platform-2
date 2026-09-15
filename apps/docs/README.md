# MFE Platform documentation site

TanStack Start + TanStack Router + Vite + Fumadocs MDX, styled with `@tecton/react` (Tecton tokens, fonts and themes). The structure mirrors the Tecton UI documentation application.

## Scripts

| Script               | What it does                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`           | Vite dev server on http://localhost:3000                                                                                                                                                                                                |
| `pnpm build`         | Production build with prerendering of `/` and every `/docs/*` page                                                                                                                                                                      |
| `pnpm preview`       | Serve the build                                                                                                                                                                                                                         |
| `pnpm typecheck`     | `tsc --noEmit` (run `pnpm build` or `pnpm dev` once first: `src/routeTree.gen.ts` is generated)                                                                                                                                         |
| `pnpm lint`          | ESLint with the repository configuration                                                                                                                                                                                                |
| `pnpm docs:generate` | Copies `internal/core/schemas/*.json` to `public/schemas/`, regenerates `content/docs/reference/generated/*` from the core package (`ERROR_CODES`, capabilities, schema index) and writes `llm.txt` / `llms.txt` at the repository root |
| `pnpm docs:check`    | Verifies that every `ERROR_CODES[*].docs` path resolves to a page (and heading anchor), that every `meta.json` entry exists and every page is listed, that every internal link and anchor resolves, and that `llms.txt` is up to date   |

`docs:generate` imports the built core package: run `pnpm --filter @platform-internal/core build` first (or `pnpm build` at the root).

## Layout

```text
content/docs/**            MDX pages (frontmatter: title, description); meta.json orders them
content/docs/meta.json     root navigation: ---Section--- separators become sidebar groups
content/docs/reference/generated/   generated — never edit (docs:generate)
public/schemas/            generated — never edit (docs:generate, gitignored)
src/routes/                __root, _site (header/footer), _site/index (landing), _site/docs, _site/docs/$
src/lib/                   docs collection (fumadocs macro), source loader, page tree server fns, site config, tree helpers, shiki
src/components/            header, sidebar, toc, command menu, mode toggle, MDX components, code blocks, callouts, tabs, steps
src/styles/app.css         docs chrome: only @layer base / @layer components / @utility; prose through typeset.css
scripts/                   generate.mjs, check-docs.mjs, docs-lib.mjs (Node, cross-platform)
```

## Writing pages

- Add the page under `content/docs/`, list it in the folder's `meta.json`, then run `pnpm docs:generate` (updates `llms.txt`) and `pnpm docs:check`.
- Use absolute links (`/docs/storage#malformed-data`). Anchors are GitHub-style slugs of the heading text.
- MDX components available without imports: `Callout`, `Steps`/`Step`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `CodeTabs`, `CodeBlock`, `LinkedCard`, `Kbd`, `Button`. A single-line `bash` fence with an `npx`/`npm` command renders package-manager tabs.
- Error codes: every `ERROR_CODES[*].docs` path in `internal/core/src/errors.ts` must point at an existing page and heading.
