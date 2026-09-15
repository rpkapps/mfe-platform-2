/**
 * Separate chunk: the only place in `@platform/host` that imports the
 * developer tools (React 19 + React Flow). Loaded through `loadDevtools()`.
 */
export { DevtoolsPanel, registerDevtoolsPanel, listDevtoolsPanels, buildDependencyGraph } from "@platform-internal/devtools"
export type { DevtoolsPanelProps, DevtoolsPanelDefinition } from "@platform-internal/devtools"
