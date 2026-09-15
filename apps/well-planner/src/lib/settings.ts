import { useRegisterSettingsGroup } from "@platform/mfe-react"
import { z } from "zod"

import { FIELDS } from "@platform-internal/conformance"

const densitySchema = z.enum(["compact", "comfortable"])

/**
 * Registered from the root route so the groups are live whenever the MFE is
 * mounted (the shell settings host mounts settings owners headlessly).
 */
export function useWellPlannerSettings() {
  // Framework-managed group: the shell places and persists it; the MFE owns meaning, defaults and schemas.
  useRegisterSettingsGroup({
    key: "display",
    title: "Display",
    description: "How wells are listed",
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
      showAbandoned: {
        defaultValue: true,
        description: "Include plugged and abandoned wells in lists",
      },
      pageSize: {
        defaultValue: 25,
        schema: z.number().int().min(5).max(200),
        min: 5,
        max: 200,
        step: 5,
      },
      defaultField: {
        defaultValue: "Johan Sverdrup",
        label: "Default field",
        // Async options: loaded on demand and abortable, which the shell's
        // settings host renders as a pending select.
        options: async ({ signal }) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50)
            signal.addEventListener("abort", () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            })
          })
          return [
            ...FIELDS.map((field) => ({ value: field, label: field })),
            { value: "decommissioned", label: "Decommissioned", disabled: true },
          ]
        },
      },
      watchedFields: {
        defaultValue: [] as string[],
        label: "Watched fields",
        options: FIELDS.map((field) => ({ value: field, label: field })),
        visibleWhen: (state) => state.showAbandoned === true,
      },
    },
  })
  // MFE-managed group: the shell only discovers and links; the MFE renders the page.
  useRegisterSettingsGroup({
    key: "advanced",
    title: "Advanced well settings",
    managedBy: "mfe",
    route: "/settings/custom",
    keywords: ["advanced", "custom"],
    fields: {},
  })
}
