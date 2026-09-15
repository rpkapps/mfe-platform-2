import { createFileRoute } from "@tanstack/react-router"
import { usePlatformFetch, useRegisterSettingsGroup, useRuntimeEnv } from "@platform/mfe-react"
import { z } from "zod"

import { fetchFields } from "@/lib/api"

export const Route = createFileRoute("/settings")({
  staticData: {
    breadcrumb: "Settings",
    navigation: { title: "Settings", keywords: ["preferences", "display"], order: 2 },
  },
  component: SettingsPage,
})

const densitySchema = z.enum(["compact", "comfortable"])

/**
 * Framework-managed settings group: the shell places, persists and renders it; the MFE
 * owns meaning, defaults, schemas and options. Controls are inferred from the values
 * (boolean → switch, options → select, number → numeric input). Every field needs
 * `defaultValue`; the framework owns the current value.
 */
function SettingsPage() {
  const env = useRuntimeEnv()
  const platformFetch = usePlatformFetch()
  useRegisterSettingsGroup({
    key: "display",
    title: "Display",
    description: "How __DISPLAY_NAME__ lists wells",
    keywords: ["density", "columns"],
    fields: {
      density: {
        defaultValue: "comfortable",
        schema: densitySchema,
        options: [
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ],
      },
      showOffline: { defaultValue: true, description: "Include offline wells in lists" },
      pageSize: {
        defaultValue: 25,
        schema: z.number().int().min(5).max(200),
        min: 5,
        max: 200,
        step: 5,
      },
      defaultField: {
        defaultValue: "eu",
        label: "Default field",
        // Abortable async options: the shell shows loading, error and retry states.
        options: async ({ signal }) => {
          const fields = await fetchFields(platformFetch, env.API_BASE_URL, signal)
          return fields.map((field) => ({ value: field.id, label: field.name }))
        },
      },
    },
  })
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        The <strong>Display</strong> settings group is registered by this route and rendered by
        the shell settings host (search: density, page size, field).
      </p>
      <p className="text-muted-foreground">
        For a fully custom settings page register a group with <code>managedBy: "mfe"</code> and
        a <code>route</code>.
      </p>
    </div>
  )
}
