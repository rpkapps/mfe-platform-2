import * as React from "react"
import type * as PageTree from "fumadocs-core/page-tree"

export type TreeFolder = PageTree.Folder
export type TreePage = PageTree.Item

/** All pages of a folder, depth first (nested folders are flattened). */
export function getPagesFromFolder(folder: TreeFolder): TreePage[] {
  const pages: TreePage[] = []
  for (const child of folder.children) {
    if (child.type === "page") pages.push(child)
    else if (child.type === "folder") pages.push(...getPagesFromFolder(child))
  }
  return pages
}

/** Top-level pages of the tree. */
export function getRootPages(tree: PageTree.Root): TreePage[] {
  return tree.children.filter((node): node is TreePage => node.type === "page")
}

/** Top-level folders of the tree. */
export function getRootFolders(tree: PageTree.Root): TreeFolder[] {
  return tree.children.filter((node): node is TreeFolder => node.type === "folder")
}

export interface SidebarEntry {
  url: string
  name: string
  /** 0 for a top-level page or a folder index, 1 for a page inside a folder. */
  depth: 0 | 1
}

export interface SidebarGroup {
  name: string
  entries: SidebarEntry[]
}

/**
 * The root `meta.json` orders pages and folders with `---Section---`
 * separators. Each separator starts a sidebar group; folders inside a group
 * contribute their index page (depth 0) and their pages (depth 1).
 */
export function getSidebarGroups(tree: PageTree.Root): SidebarGroup[] {
  const groups: SidebarGroup[] = []
  let current: SidebarGroup = { name: "Docs", entries: [] }
  const push = (entry: SidebarEntry) => current.entries.push(entry)
  for (const node of tree.children) {
    if (node.type === "separator") {
      if (current.entries.length) groups.push(current)
      current = { name: nodeName(node), entries: [] }
    } else if (node.type === "page") {
      push({ url: node.url, name: nodeName(node), depth: 0 })
    } else if (node.type === "folder") {
      if (node.index) push({ url: node.index.url, name: nodeName(node), depth: 0 })
      for (const page of getPagesFromFolder(node)) {
        if (node.index && page.url === node.index.url) continue
        push({ url: page.url, name: nodeName(page), depth: node.index ? 1 : 0 })
      }
    }
  }
  if (current.entries.length) groups.push(current)
  return groups
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
}

function decodeEntities(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
}

function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join("")
  if (
    React.isValidElement<{
      children?: React.ReactNode
      dangerouslySetInnerHTML?: { __html: string }
    }>(node)
  ) {
    // `useFumadocsLoader` turns names into <span dangerouslySetInnerHTML />.
    const html = node.props.dangerouslySetInnerHTML?.__html
    if (typeof html === "string") return decodeEntities(html.replace(/<[^>]+>/g, ""))
    return nodeText(node.props.children)
  }
  return ""
}

/**
 * Plain-text name of a page-tree node. Names deserialized by
 * `useFumadocsLoader` are React nodes, so the text is extracted recursively.
 */
export function nodeName(node: { name?: React.ReactNode }) {
  return nodeText(node.name).trim()
}
