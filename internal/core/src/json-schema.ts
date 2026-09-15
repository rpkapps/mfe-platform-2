import { z } from "zod"

import { CAPABILITY_IDS } from "./capabilities"
import {
  commandContributionSchema,
  helpContributionSchema,
  mfeManifestSchema,
  releaseNoteContributionSchema,
  settingsContributionSchema,
  sharedRequestSchema,
  widgetContributionSchema,
} from "./manifest"
import { runtimeConfigSchema } from "./runtime-config"

/**
 * Machine-readable schemas published with the documentation site
 * (`/schemas/<name>.json`) and used by editors and AI agents.
 */
const capabilitiesSchema = z.object({ capabilities: z.array(z.enum(CAPABILITY_IDS)) })

const registrationsSchema = z.object({
  commands: z.array(commandContributionSchema),
  settings: z.array(settingsContributionSchema),
  help: z.array(helpContributionSchema),
  releaseNotes: z.array(releaseNoteContributionSchema),
  widgets: z.array(widgetContributionSchema),
})

const settingsSchema = settingsContributionSchema

const diagnosticsSchema = z
  .object({
    id: z.number(),
    at: z.number(),
    level: z.enum(["debug", "info", "warn", "error"]),
    type: z.string(),
    mfeId: z.string().optional(),
    instanceId: z.string().optional(),
    widgetId: z.string().optional(),
  })
  .passthrough()

const protocolSchema = z.object({
  hostProtocolVersion: z.string(),
  remoteProtocolVersion: z.string(),
  compatible: z.boolean(),
  rule: z.literal("same major"),
})

const sharedDependenciesSchema = z.object({ shared: z.array(sharedRequestSchema) })

export const PUBLISHED_SCHEMAS = {
  manifest: mfeManifestSchema,
  "runtime-config": runtimeConfigSchema,
  capabilities: capabilitiesSchema,
  registrations: registrationsSchema,
  settings: settingsSchema,
  diagnostics: diagnosticsSchema,
  "protocol-compatibility": protocolSchema,
  "shared-dependencies": sharedDependenciesSchema,
} as const

export type PublishedSchemaName = keyof typeof PUBLISHED_SCHEMAS

export function toJsonSchema(name: PublishedSchemaName): Record<string, unknown> {
  const schema = PUBLISHED_SCHEMAS[name]
  return {
    $id: `https://platform.docs.local/schemas/${name}.json`,
    title: name,
    ...(z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>),
  }
}
