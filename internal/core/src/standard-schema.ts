import type { StandardSchemaV1 } from "@standard-schema/spec"

export type { StandardSchemaV1 }

/** Any Standard Schema (Zod 4, Valibot, ArkType…). */
export type AnySchema<TOutput = unknown, TInput = unknown> = StandardSchemaV1<TInput, TOutput>

export type SchemaOutput<TSchema> =
  TSchema extends StandardSchemaV1<unknown, infer TOutput> ? TOutput : never

export interface ValidationIssue {
  message: string
  path: (string | number)[]
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; issues: ValidationIssue[] }

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchemaV1)["~standard"].validate === "function"
  )
}

/**
 * Validate synchronously with a Standard Schema. Async schemas are rejected with
 * an explicit issue: platform validation happens on reads and writes and must
 * not suspend.
 */
export function validateSync<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  value: unknown
): ValidationResult<StandardSchemaV1.InferOutput<TSchema>> {
  const result = schema["~standard"].validate(value)
  if (result instanceof Promise) {
    return {
      ok: false,
      issues: [
        {
          message: "Asynchronous schemas are not supported for platform validation.",
          path: [],
        },
      ],
    }
  }
  if (result.issues) {
    return {
      ok: false,
      issues: result.issues.map((issue) => ({
        message: issue.message,
        path: (issue.path ?? []).map((segment) =>
          typeof segment === "object" && segment !== null && "key" in segment
            ? (segment.key as string | number)
            : (segment as string | number)
        ),
      })),
    }
  }
  return { ok: true, value: result.value }
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message
    )
    .join("; ")
}

/** Infer a control kind from a value and options, used by settings inference and devtools. */
export type InferredKind = "boolean" | "text" | "number" | "select" | "multi-select" | "unknown"

export function inferKind(value: unknown, hasOptions: boolean): InferredKind {
  if (Array.isArray(value)) return hasOptions ? "multi-select" : "unknown"
  if (hasOptions) return "select"
  switch (typeof value) {
    case "boolean":
      return "boolean"
    case "string":
      return "text"
    case "number":
      return "number"
    default:
      return "unknown"
  }
}
