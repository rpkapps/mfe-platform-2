import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import {
  CAPABILITY_BY_API,
  inferKind,
  type CapabilityId,
  type CommandContribution,
  type HelpContribution,
  type ReleaseNoteContribution,
  type SettingsContribution,
  type WidgetContribution,
} from "@platform-internal/core"

import {
  literalValue,
  objectProperties,
  parseSource,
  propertyValue,
  stringArray,
  stringLiteral,
  t,
  traverseAst,
  unwrapExpression,
  type NodePath,
} from "./ast"

export const SDK_PACKAGE = "@platform/react"

const STORAGE_APIS = new Set(["createPlatformStorage", "usePlatformStorage"])
const REGISTRATION_COMPONENTS: Record<
  string,
  "command" | "settings" | "help" | "releaseNotes"
> = {
  CommandRegistration: "command",
  SettingsRegistration: "settings",
  HelpRegistration: "help",
  ReleaseNotesRegistration: "releaseNotes",
}

export interface PendingSettingsField {
  group: string
  field: SettingsContribution["fields"][number]
}

export interface FileAnalysis {
  file: string
  /** Capabilities implied by SDK usage in this file (implicit ones excluded). */
  capabilities: CapabilityId[]
  commands: CommandContribution[]
  settings: SettingsContribution[]
  settingsFields: PendingSettingsField[]
  help: HelpContribution[]
  releaseNotes: ReleaseNoteContribution[]
  widgets: WidgetContribution[]
  warnings: string[]
  /** True when the file imports anything from the SDK. */
  usesSdk: boolean
}

function emptyAnalysis(file: string): FileAnalysis {
  return {
    file,
    capabilities: [],
    commands: [],
    settings: [],
    settingsFields: [],
    help: [],
    releaseNotes: [],
    widgets: [],
    warnings: [],
    usesSdk: false,
  }
}

/** One-level identifier resolution: `const def = {...}; useRegisterCommand(def)`. */
function resolveNode(path: NodePath, node: t.Node | null | undefined): t.Node | undefined {
  const value = unwrapExpression(node)
  if (!value) return undefined
  if (t.isIdentifier(value)) {
    const binding = path.scope.getBinding(value.name)
    const declarator = binding?.path.node
    if (declarator && t.isVariableDeclarator(declarator) && declarator.init)
      return unwrapExpression(declarator.init) ?? undefined
    return value
  }
  return value
}

function routeString(node: t.Node | undefined): string | undefined {
  if (!node) return undefined
  const direct = stringLiteral(node)
  if (direct !== undefined) return direct
  const to = stringLiteral(propertyValue(objectProperties(node).get("to")))
  return to
}

/** Names the fields that were not literals, so a warning points at the one to fix. */
function missingLiterals(fields: Record<string, string | undefined>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value === undefined)
    .map(([name]) => `\`${name}\``)
}

function listFields(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!
}

export function extractCommand(
  node: t.Node | undefined,
  file: string,
  warnings: string[],
  isStatic = false
): CommandContribution | undefined {
  if (!node || !t.isObjectExpression(node)) {
    warnings.push(
      `${file}: a command definition is not an object literal; it is not listed in the manifest.`
    )
    return undefined
  }
  const props = objectProperties(node)
  const id = stringLiteral(propertyValue(props.get("id")))
  const label = stringLiteral(propertyValue(props.get("label")))
  if (id === undefined) {
    warnings.push(
      `${file}: a command definition needs a literal \`id\` to be listed in the manifest.`
    )
    return undefined
  }
  if (label === undefined) {
    // A command a component registers may label itself from its props — a widget
    // command reads `Open ${asset.name}`, which is the documented pattern — and the
    // palette has no row to offer without a label, so the command is simply left to
    // register itself when the MFE loads. Nothing is lost and there is nothing to
    // fix, so this is silent. A static registration is module-scope data with no
    // props in scope, so a label it cannot state is worth reporting.
    if (isStatic)
      warnings.push(
        `${file}: the static command "${id}" needs a literal \`label\` to be listed in the manifest.`
      )
    return undefined
  }
  const command: CommandContribution = { id, label, static: isStatic }
  const description = stringLiteral(propertyValue(props.get("description")))
  if (description !== undefined) command.description = description
  const group = stringLiteral(propertyValue(props.get("group")))
  if (group !== undefined) command.group = group
  const keywords = stringArray(propertyValue(props.get("keywords")))
  if (keywords) command.keywords = keywords
  const shortcut = stringLiteral(propertyValue(props.get("shortcut")))
  if (shortcut !== undefined) command.shortcut = shortcut
  const permissionGroups = stringArray(propertyValue(props.get("permissionGroups")))
  if (permissionGroups) command.permissionGroups = permissionGroups
  const route = routeString(propertyValue(props.get("route")))
  if (route !== undefined) command.route = route
  return command
}

function extractSettingsField(
  key: string,
  node: t.Node | undefined,
  file: string,
  warnings: string[]
): SettingsContribution["fields"][number] {
  const field: SettingsContribution["fields"][number] = { key }
  if (!node || !t.isObjectExpression(node)) {
    warnings.push(
      `${file}: settings field "${key}" is not an object literal; its kind is unknown.`
    )
    field.kind = "unknown"
    return field
  }
  const props = objectProperties(node)
  const label = stringLiteral(propertyValue(props.get("label")))
  if (label !== undefined) field.label = label
  const description = stringLiteral(propertyValue(props.get("description")))
  if (description !== undefined) field.description = description
  const keywords = stringArray(propertyValue(props.get("keywords")))
  if (keywords) field.keywords = keywords
  const explicitKind = stringLiteral(propertyValue(props.get("kind")))
  const hasOptions = props.has("options")
  if (
    explicitKind &&
    ["boolean", "text", "number", "select", "multi-select", "unknown"].includes(explicitKind)
  ) {
    field.kind = explicitKind as NonNullable<typeof field.kind>
  } else {
    const defaultValue = literalValue(propertyValue(props.get("defaultValue")))
    field.kind = defaultValue.ok
      ? inferKind(defaultValue.value, hasOptions)
      : hasOptions
        ? "select"
        : "unknown"
  }
  return field
}

export function extractSettingsGroup(
  node: t.Node | undefined,
  file: string,
  warnings: string[]
): SettingsContribution | undefined {
  if (!node || !t.isObjectExpression(node)) {
    warnings.push(
      `${file}: a settings group definition is not an object literal; it is not listed in the manifest.`
    )
    return undefined
  }
  const props = objectProperties(node)
  const key = stringLiteral(propertyValue(props.get("key")))
  if (key === undefined) {
    warnings.push(
      `${file}: a settings group needs a literal \`key\` to be listed in the manifest.`
    )
    return undefined
  }
  const group: SettingsContribution = {
    key,
    title: stringLiteral(propertyValue(props.get("title"))) ?? key,
    managedBy: "framework",
    fields: [],
  }
  const description = stringLiteral(propertyValue(props.get("description")))
  if (description !== undefined) group.description = description
  const keywords = stringArray(propertyValue(props.get("keywords")))
  if (keywords) group.keywords = keywords
  const managedBy = stringLiteral(propertyValue(props.get("managedBy")))
  if (managedBy === "mfe" || managedBy === "framework") group.managedBy = managedBy
  const route = routeString(propertyValue(props.get("route")))
  if (route !== undefined) group.route = route
  const fields = propertyValue(props.get("fields"))
  if (fields && t.isObjectExpression(fields)) {
    for (const [fieldKey, property] of objectProperties(fields))
      group.fields.push(extractSettingsField(fieldKey, propertyValue(property), file, warnings))
  } else if (fields)
    warnings.push(
      `${file}: settings group "${key}" has non-literal fields; they are not listed in the manifest.`
    )
  return group
}

export function extractHelp(
  node: t.Node | undefined,
  file: string,
  warnings: string[]
): HelpContribution | undefined {
  if (!node || !t.isObjectExpression(node)) {
    warnings.push(
      `${file}: a help entry is not an object literal; it is not listed in the manifest.`
    )
    return undefined
  }
  const props = objectProperties(node)
  const id = stringLiteral(propertyValue(props.get("id")))
  const title = stringLiteral(propertyValue(props.get("title")))
  if (id === undefined || title === undefined) {
    const missing = listFields(missingLiterals({ id, title }))
    warnings.push(
      `${file}: a help entry${id ? ` ("${id}")` : ""} needs a literal ${missing} to be listed in the manifest.`
    )
    return undefined
  }
  const help: HelpContribution = { id, title }
  const description = stringLiteral(propertyValue(props.get("description")))
  if (description !== undefined) help.description = description
  const keywords = stringArray(propertyValue(props.get("keywords")))
  if (keywords) help.keywords = keywords
  const href = stringLiteral(propertyValue(props.get("href")))
  if (href !== undefined) help.href = href
  const route = routeString(propertyValue(props.get("route")))
  if (route !== undefined) help.route = route
  return help
}

export function extractReleaseNote(
  node: t.Node | undefined,
  file: string,
  warnings: string[]
): ReleaseNoteContribution | undefined {
  if (!node || !t.isObjectExpression(node)) {
    warnings.push(
      `${file}: a release note is not an object literal; it is not listed in the manifest.`
    )
    return undefined
  }
  const props = objectProperties(node)
  const id = stringLiteral(propertyValue(props.get("id")))
  const version = stringLiteral(propertyValue(props.get("version")))
  const title = stringLiteral(propertyValue(props.get("title")))
  if (id === undefined || version === undefined || title === undefined) {
    const missing = listFields(missingLiterals({ id, version, title }))
    warnings.push(
      `${file}: a release note${id ? ` ("${id}")` : ""} needs a literal ${missing} to be listed in the manifest.`
    )
    return undefined
  }
  const note: ReleaseNoteContribution = { id, version, title }
  const date = stringLiteral(propertyValue(props.get("date")))
  if (date !== undefined) note.date = date
  const summary = stringLiteral(propertyValue(props.get("summary")))
  if (summary !== undefined) note.summary = summary
  const keywords = stringArray(propertyValue(props.get("keywords")))
  if (keywords) note.keywords = keywords
  const href = stringLiteral(propertyValue(props.get("href")))
  if (href !== undefined) note.href = href
  return note
}

function extractWidget(
  node: t.Node | undefined,
  fallbackId: string | undefined,
  file: string,
  warnings: string[]
): WidgetContribution | undefined {
  const props = objectProperties(node)
  const id = stringLiteral(propertyValue(props.get("id"))) ?? fallbackId
  if (id === undefined) {
    warnings.push(
      `${file}: a createWidget call without a literal \`id\` is not listed in the manifest.`
    )
    return undefined
  }
  const widget: WidgetContribution = { id }
  const title = stringLiteral(propertyValue(props.get("title")))
  if (title !== undefined) widget.title = title
  const description = stringLiteral(propertyValue(props.get("description")))
  if (description !== undefined) widget.description = description
  const permissionGroups = stringArray(propertyValue(props.get("permissionGroups")))
  if (permissionGroups) widget.permissionGroups = permissionGroups
  return widget
}

function listOf(node: t.Node | undefined): (t.Node | undefined)[] {
  const value = unwrapExpression(node)
  if (t.isArrayExpression(value))
    return value.elements.map((element) => unwrapExpression(element) ?? undefined)
  return [value ?? undefined]
}

/**
 * Analyse one source file: SDK imports → capabilities, registration hooks and
 * components → contributed surfaces, `createMfe` → widgets and static
 * registrations. Never throws on user code.
 */
export function analyzeSourceFile(code: string, file: string): FileAnalysis {
  const analysis = emptyAnalysis(file)
  if (!code.includes(SDK_PACKAGE)) return analysis
  let ast
  try {
    ast = parseSource(code, file)
  } catch (error) {
    analysis.warnings.push(
      `${file}: could not parse (${error instanceof Error ? error.message : String(error)}); SDK usage is not inferred.`
    )
    return analysis
  }
  const locals = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const statement of ast.program.body) {
    if (!t.isImportDeclaration(statement)) continue
    const source = statement.source.value
    if (source !== SDK_PACKAGE && !source.startsWith(`${SDK_PACKAGE}/`)) continue
    if (statement.importKind === "type") continue
    analysis.usesSdk = true
    for (const specifier of statement.specifiers) {
      if (t.isImportSpecifier(specifier)) {
        if (specifier.importKind === "type") continue
        const imported = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value
        locals.set(specifier.local.name, imported)
      } else if (t.isImportNamespaceSpecifier(specifier)) namespaces.add(specifier.local.name)
    }
  }
  if (!analysis.usesSdk) return analysis

  const capabilities = new Set<CapabilityId>()
  const storageScopes = new Set<"local" | "session">()
  let storageUsed = false
  // `createMfe({ widgets })` analyses the `createWidget` calls it contains and
  // takes each id from the record key, but those calls are also visited on
  // their own. Claimed ones are skipped; the rest defer their "no literal id"
  // warning until the whole file has been walked, because a widget can be
  // declared above the `createMfe` call that names it.
  const claimedWidgets = new Set<t.Node>()
  const unnamedWidgets: t.Node[] = []
  for (const imported of locals.values()) {
    if (STORAGE_APIS.has(imported)) continue
    const capability = CAPABILITY_BY_API[imported]
    if (capability) capabilities.add(capability)
  }

  const sdkName = (callee: t.Node | null | undefined): string | undefined => {
    const node = unwrapExpression(callee)
    if (t.isIdentifier(node)) return locals.get(node.name)
    if (
      t.isMemberExpression(node) &&
      !node.computed &&
      t.isIdentifier(node.object) &&
      t.isIdentifier(node.property) &&
      namespaces.has(node.object.name)
    )
      return node.property.name
    return undefined
  }
  const jsxName = (name: t.JSXOpeningElement["name"]): string | undefined => {
    if (t.isJSXIdentifier(name)) return locals.get(name.name)
    if (
      t.isJSXMemberExpression(name) &&
      t.isJSXIdentifier(name.object) &&
      namespaces.has(name.object.name)
    )
      return name.property.name
    return undefined
  }

  const handleDefinition = (
    kind: "command" | "settings" | "help" | "releaseNotes",
    node: t.Node | undefined
  ) => {
    switch (kind) {
      case "command": {
        const command = extractCommand(node, file, analysis.warnings)
        if (command) analysis.commands.push(command)
        break
      }
      case "settings": {
        const group = extractSettingsGroup(node, file, analysis.warnings)
        if (group) analysis.settings.push(group)
        break
      }
      case "help":
        for (const entry of listOf(node)) {
          const help = extractHelp(entry, file, analysis.warnings)
          if (help) analysis.help.push(help)
        }
        break
      case "releaseNotes":
        for (const entry of listOf(node)) {
          const note = extractReleaseNote(entry, file, analysis.warnings)
          if (note) analysis.releaseNotes.push(note)
        }
        break
    }
  }

  traverseAst(ast, {
    MemberExpression(path) {
      const node = path.node
      if (
        node.computed ||
        !t.isIdentifier(node.object) ||
        !t.isIdentifier(node.property) ||
        !namespaces.has(node.object.name)
      )
        return
      const name = node.property.name
      if (STORAGE_APIS.has(name)) return
      const capability = CAPABILITY_BY_API[name]
      if (capability) capabilities.add(capability)
    },
    CallExpression(path) {
      const name = sdkName(path.node.callee)
      if (!name) return
      const first = resolveNode(path, path.node.arguments[0])
      switch (name) {
        case "createPlatformStorage":
        case "usePlatformStorage": {
          storageUsed = true
          const scope = stringLiteral(propertyValue(objectProperties(first).get("scope")))
          storageScopes.add(scope === "session" ? "session" : "local")
          break
        }
        case "useRegisterCommand":
          handleDefinition("command", first)
          break
        case "useRegisterSettingsGroup":
          handleDefinition("settings", first)
          break
        case "useRegisterSettingsField": {
          const props = objectProperties(first)
          const group = stringLiteral(propertyValue(props.get("group")))
          const key = stringLiteral(propertyValue(props.get("key")))
          if (group === undefined || key === undefined)
            analysis.warnings.push(
              `${file}: useRegisterSettingsField needs a literal ${listFields(
                missingLiterals({ group, key })
              )} to be listed in the manifest.`
            )
          else
            analysis.settingsFields.push({
              group,
              field: extractSettingsField(key, first, file, analysis.warnings),
            })
          break
        }
        case "useRegisterHelp":
          handleDefinition("help", first)
          break
        case "useRegisterReleaseNotes":
          handleDefinition("releaseNotes", first)
          break
        case "createWidget": {
          if (first && claimedWidgets.has(first)) break
          if (first && stringLiteral(propertyValue(objectProperties(first).get("id")))) {
            const widget = extractWidget(first, undefined, file, analysis.warnings)
            if (widget) analysis.widgets.push(widget)
          } else if (first) unnamedWidgets.push(first)
          else
            analysis.warnings.push(
              `${file}: a createWidget call without a literal \`id\` is not listed in the manifest.`
            )
          break
        }
        case "createMfe": {
          const props = objectProperties(first)
          const widgets = resolveNode(path, propertyValue(props.get("widgets")))
          if (widgets && t.isObjectExpression(widgets)) {
            for (const [id, property] of objectProperties(widgets)) {
              const value = resolveNode(path, propertyValue(property))
              const call =
                value && t.isCallExpression(value) && sdkName(value.callee) === "createWidget"
                  ? resolveNode(path, value.arguments[0])
                  : undefined
              if (call) claimedWidgets.add(call)
              const widget = extractWidget(call, id, file, analysis.warnings)
              if (widget) analysis.widgets.push({ ...widget, id })
            }
          } else if (widgets && t.isArrayExpression(widgets)) {
            for (const element of widgets.elements) {
              const value = resolveNode(path, element)
              if (
                value &&
                t.isCallExpression(value) &&
                sdkName(value.callee) === "createWidget"
              ) {
                const argument = resolveNode(path, value.arguments[0])
                if (argument) claimedWidgets.add(argument)
                const widget = extractWidget(argument, undefined, file, analysis.warnings)
                if (widget) analysis.widgets.push(widget)
              } else
                analysis.warnings.push(
                  `${file}: a widget in createMfe({ widgets }) is not an inline createWidget call; it is not listed in the manifest.`
                )
            }
          } else if (widgets)
            analysis.warnings.push(
              `${file}: createMfe({ widgets }) is not an object or array literal; widgets are not listed in the manifest.`
            )
          const registrations = resolveNode(path, propertyValue(props.get("registrations")))
          if (registrations && t.isObjectExpression(registrations)) {
            const groups = objectProperties(registrations)
            for (const entry of listOf(
              resolveNode(path, propertyValue(groups.get("commands")))
            )) {
              if (!entry) continue
              const command = extractCommand(entry, file, analysis.warnings, true)
              if (command) analysis.commands.push(command)
            }
            for (const entry of listOf(resolveNode(path, propertyValue(groups.get("help"))))) {
              if (!entry) continue
              const help = extractHelp(entry, file, analysis.warnings)
              if (help) analysis.help.push(help)
            }
            for (const entry of listOf(
              resolveNode(path, propertyValue(groups.get("releaseNotes")))
            )) {
              if (!entry) continue
              const note = extractReleaseNote(entry, file, analysis.warnings)
              if (note) analysis.releaseNotes.push(note)
            }
          } else if (registrations)
            analysis.warnings.push(
              `${file}: createMfe({ registrations }) is not an object literal; static registrations are not listed in the manifest.`
            )
          break
        }
        default:
          break
      }
    },
    JSXOpeningElement(path) {
      const name = jsxName(path.node.name)
      if (!name) return
      const kind = REGISTRATION_COMPONENTS[name]
      if (!kind) return
      const attribute = path.node.attributes.find(
        (attr): attr is t.JSXAttribute =>
          t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === "definition"
      )
      if (!attribute || !t.isJSXExpressionContainer(attribute.value)) {
        analysis.warnings.push(
          `${file}: <${name}> without a literal \`definition\` prop is not listed in the manifest.`
        )
        return
      }
      handleDefinition(kind, resolveNode(path, attribute.value.expression))
    },
  })

  for (const node of unnamedWidgets) {
    if (claimedWidgets.has(node)) continue
    analysis.warnings.push(
      `${file}: a createWidget call without a literal \`id\` is not listed in the manifest.`
    )
  }

  if (storageUsed) {
    for (const scope of storageScopes)
      capabilities.add(scope === "session" ? "storage.session" : "storage.local")
  } else if ([...locals.values()].some((name) => STORAGE_APIS.has(name)))
    capabilities.add("storage.local")
  analysis.capabilities = [...capabilities]
  return analysis
}

export interface ProjectAnalysis {
  capabilities: CapabilityId[]
  commands: CommandContribution[]
  settings: SettingsContribution[]
  help: HelpContribution[]
  releaseNotes: ReleaseNoteContribution[]
  widgets: WidgetContribution[]
  warnings: string[]
  files: string[]
}

const SOURCE_FILE_RE = /\.(tsx|ts|jsx|js|mjs|mts)$/
const EXCLUDED_FILE_RE = /(\.gen\.[tj]sx?|\.d\.ts|\.(test|spec|stories)\.[tj]sx?)$/
const EXCLUDED_DIRS = new Set(["node_modules", "__tests__", "__mocks__", "dist", ".platform"])

export function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  const files: string[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name)
      const stat = statSync(file)
      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(name)) walk(file)
        continue
      }
      if (SOURCE_FILE_RE.test(name) && !EXCLUDED_FILE_RE.test(name)) files.push(file)
    }
  }
  walk(dir)
  return files
}

/** Merge per-file analyses; the first definition of an id wins, duplicates warn. */
export function mergeAnalyses(analyses: FileAnalysis[], root: string): ProjectAnalysis {
  const result: ProjectAnalysis = {
    capabilities: [],
    commands: [],
    settings: [],
    help: [],
    releaseNotes: [],
    widgets: [],
    warnings: [],
    files: [],
  }
  const capabilities = new Set<CapabilityId>()
  const seen = {
    commands: new Set<string>(),
    settings: new Set<string>(),
    help: new Set<string>(),
    releaseNotes: new Set<string>(),
    widgets: new Set<string>(),
  }
  const pendingFields: PendingSettingsField[] = []
  const dedupe = <T>(
    kind: keyof typeof seen,
    items: T[],
    key: (item: T) => string,
    target: T[],
    file: string
  ) => {
    for (const item of items) {
      const id = key(item)
      if (seen[kind].has(id)) {
        result.warnings.push(
          `${file}: duplicate ${kind} "${id}"; the first definition is used.`
        )
        continue
      }
      seen[kind].add(id)
      target.push(item)
    }
  }
  for (const analysis of analyses) {
    const file = relative(root, analysis.file).replace(/\\/g, "/")
    if (analysis.usesSdk) result.files.push(file)
    for (const capability of analysis.capabilities) capabilities.add(capability)
    dedupe("commands", analysis.commands, (command) => command.id, result.commands, file)
    dedupe("settings", analysis.settings, (group) => group.key, result.settings, file)
    dedupe("help", analysis.help, (help) => help.id, result.help, file)
    dedupe("releaseNotes", analysis.releaseNotes, (note) => note.id, result.releaseNotes, file)
    dedupe("widgets", analysis.widgets, (widget) => widget.id, result.widgets, file)
    pendingFields.push(...analysis.settingsFields)
    result.warnings.push(...analysis.warnings)
  }
  for (const pending of pendingFields) {
    let group = result.settings.find((entry) => entry.key === pending.group)
    if (!group) {
      group = { key: pending.group, title: pending.group, managedBy: "framework", fields: [] }
      result.settings.push(group)
    }
    if (!group.fields.some((field) => field.key === pending.field.key))
      group.fields.push(pending.field)
  }
  result.capabilities = [...capabilities]
  return result
}

export function analyzeProjectSources(options: {
  root: string
  sourceDirectory?: string
}): ProjectAnalysis {
  const dir = options.sourceDirectory ?? join(options.root, "src")
  const analyses = listSourceFiles(dir).map((file) =>
    analyzeSourceFile(readFileSync(file, "utf8"), file)
  )
  return mergeAnalyses(analyses, options.root)
}

/** Final capability request: usage ∪ implicit ∪ `add`, minus `remove`, in canonical order. */
export function finalizeCapabilities(
  inferred: Iterable<CapabilityId>,
  implicit: readonly CapabilityId[],
  add: CapabilityId[] = [],
  remove: CapabilityId[] = []
): CapabilityId[] {
  const set = new Set<CapabilityId>([...implicit, ...inferred, ...add])
  for (const capability of remove) set.delete(capability)
  return [...set].sort()
}
