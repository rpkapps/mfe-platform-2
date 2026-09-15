// Not imported by the bundle: exercises static SDK-usage inference only.
import {
  CommandRegistration,
  createPlatformStorage,
  useNavigation,
  useRegisterCommand,
  useRegisterSettingsGroup,
} from "@platform/mfe-react"

export const recent = createPlatformStorage({
  scope: "session",
  key: "recent",
  defaults: { ids: [] as string[] },
})

export function SampleCommands() {
  useNavigation()
  useRegisterCommand({
    id: "open-home",
    label: "Open home",
    group: "Sample",
    route: "/",
    keywords: ["home"],
  })
  useRegisterSettingsGroup({
    key: "general",
    title: "General",
    fields: {
      compact: { defaultValue: false, label: "Compact mode" },
      pageSize: { defaultValue: 25, label: "Page size" },
    },
  })
  return (
    <CommandRegistration definition={{ id: "refresh", label: "Refresh", shortcut: "mod+r" }} />
  )
}
