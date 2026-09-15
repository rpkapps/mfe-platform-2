import type { ReactNode } from "react"
import { PortalProvider } from "@tecton/react/tecton/portal"
import { useOverlayContainer } from "./hooks/context"
import type { MfeDefinition, MfeEnhancer } from "./types"

export interface WithTectonOptions {
  /** `inherit` (default) follows the shell's resolved theme. */
  theme?: "inherit"
}

/**
 * Tecton overlays (Dialog, Sheet, Popover, Tooltip, Select…) portal into the
 * per-mount overlay root created by the shell overlay manager, so they escape
 * the MFE container, stack in the global order and keep the owner attribute
 * their scoped styles depend on. The `dark` class of the MFE root and the
 * overlay root follows the resolved theme (`PlatformProvider` keeps it in
 * step; `withTecton` only wires the portal).
 */
function TectonPortal({ children }: { children: ReactNode }) {
  const container = useOverlayContainer()
  return <PortalProvider container={container}>{children}</PortalProvider>
}

export const tectonEnhancer: MfeEnhancer = {
  name: "tecton",
  wrap: (children) => <TectonPortal>{children}</TectonPortal>,
}

/** Apply the Tecton integration to a definition (the generated entry does this for Tecton MFEs). */
export function withTecton(
  definition: MfeDefinition,
  _options: WithTectonOptions = {}
): MfeDefinition {
  return definition.use(tectonEnhancer)
}

export { TectonPortal }
