import * as platform from "@platform/react"

export function Namespaced() {
  platform.usePermissions()
  platform.useRegisterCommand({ id: "ns-command", label: "Namespaced" })
  return null
}
