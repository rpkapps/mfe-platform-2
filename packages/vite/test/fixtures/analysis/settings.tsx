import {
  SettingsRegistration,
  useRegisterSettingsField,
  useRegisterSettingsGroup,
  usePlatformStorage,
  createPlatformStorage,
} from "@platform/mfe-react"

export const prefs = createPlatformStorage({
  scope: "local",
  key: "prefs",
  defaults: { theme: "system" },
})
export const draft = createPlatformStorage({
  scope: "session",
  key: "draft",
  defaults: { text: "" },
})

export function Settings() {
  const theme = usePlatformStorage(prefs, (state) => state.theme)
  useRegisterSettingsGroup({
    key: "display",
    title: "Display",
    description: "How things look",
    keywords: ["theme"],
    fields: {
      density: {
        defaultValue: "comfortable",
        label: "Density",
        options: [{ value: "comfortable", label: "Comfortable" }],
      },
      pageSize: { defaultValue: 50, label: "Page size", description: "Rows per page" },
      compact: { defaultValue: true },
      columns: { defaultValue: ["name"], options: [{ value: "name", label: "Name" }] },
      tags: { defaultValue: [] },
      custom: { defaultValue: computeDefault(), kind: "text" },
      opaque: { defaultValue: computeDefault() },
    },
  })
  useRegisterSettingsField({ group: "display", key: "extra", defaultValue: 1, label: "Extra" })
  useRegisterSettingsField({ group: "other", key: "flag", defaultValue: false })
  return (
    (
      <SettingsRegistration
        definition={{ key: "advanced", managedBy: "mfe", route: "/settings", fields: {} }}
      />
    ) && theme
  )
}

function computeDefault() {
  return "x"
}
