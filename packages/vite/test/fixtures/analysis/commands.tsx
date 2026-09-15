import * as React from "react"
import {
  CommandRegistration,
  useRegisterCommand,
  useTelemetry,
  useNavigation,
} from "@platform/react"
import type { CommandDefinition } from "@platform/react"

const exportCommand = {
  id: "export-csv",
  label: "Export as CSV",
  description: "Download the current table",
  group: "Assets",
  keywords: ["download", "csv"],
  shortcut: "mod+shift+e",
  permissionGroups: ["assets:export"],
  route: { to: "/assets" },
}

export function Commands() {
  const navigation = useNavigation()
  const telemetry = useTelemetry()
  useRegisterCommand({ id: "create-asset", label: "Create asset", route: "/assets/new" })
  useRegisterCommand(exportCommand)
  useRegisterCommand(buildDynamicCommand())
  return (
    <>
      <CommandRegistration definition={{ id: "refresh", label: "Refresh", group: "General" }} />
      <CommandRegistration
        definition={{ id: "dynamic", label: `Dynamic ${String(navigation)}` }}
      />
      <button onClick={() => telemetry.event("click")}>go</button>
    </>
  )
}

function buildDynamicCommand(): CommandDefinition {
  return { id: "built", label: "Built" }
}
