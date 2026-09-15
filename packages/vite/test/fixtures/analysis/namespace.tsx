import * as platform from "@platform/mfe-react"

export function Namespaced() {
  platform.usePermissions()
  platform.useRegisterCommand({ id: "ns-command", label: "Namespaced" })
  return null
}
