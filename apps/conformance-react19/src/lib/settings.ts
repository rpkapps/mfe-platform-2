import { useRegisterSettingsGroup } from "@platform/react"
import { z } from "zod"

const densitySchema = z.enum(["compact", "comfortable"])

/**
 * Registered from the root route so the groups are live whenever the MFE is
 * mounted (the shell settings host mounts settings owners headlessly).
 */
export function useAssetTrackerSettings() {
  // Framework-managed group: the shell places and persists it; the MFE owns meaning, defaults and schemas.
  useRegisterSettingsGroup({
    key: "display",
    title: "Display",
    description: "How assets are listed",
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
      showOffline: { defaultValue: true, description: "Include offline assets in lists" },
      pageSize: { defaultValue: 25, schema: z.number().int().min(5).max(200), min: 5, max: 200, step: 5 },
      region: {
        defaultValue: "north",
        label: "Default region",
        options: async ({ signal }) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50)
            signal.addEventListener("abort", () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            })
          })
          return [
            { value: "north", label: "North Field" },
            { value: "south", label: "South Field" },
            { value: "legacy", label: "Legacy site", disabled: true },
          ]
        },
      },
      favouriteSites: {
        defaultValue: [] as string[],
        options: [
          { value: "north", label: "North Field" },
          { value: "south", label: "South Field" },
        ],
        visibleWhen: (state) => state.showOffline === true,
      },
    },
  })
  // MFE-managed group: the shell only discovers and links; the MFE renders the page.
  useRegisterSettingsGroup({ key: "advanced", title: "Advanced asset settings", managedBy: "mfe", route: "/settings/custom", keywords: ["advanced", "custom"], fields: {} })
}
