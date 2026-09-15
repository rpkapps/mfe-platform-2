/**
 * Build warnings that are inherent to sharing a dependency across React majors
 * and cannot be acted on, so the platform drops them from remote builds.
 */

/** `@module-federation/vite` names one virtual module per shared package. */
const SHARED_VIRTUAL_MODULE_RE = /virtual:mf:.*__loadShare__/

export interface BuildWarning {
  code?: string
  message?: string
}

/**
 * A shared package is represented by a virtual module whose export list comes
 * from the version installed in *this* remote. A library that supports several
 * majors reads the newer entry points defensively — `@tanstack/react-router`
 * takes `React["use"]`, which React 19 exports and React 18 does not — and
 * rolldown reports the miss as `IMPORT_IS_UNDEFINED`. The read is guarded and
 * `undefined` is the intended result, so the warning says only that this remote
 * is on the older major. Undefined imports from anywhere else still surface.
 */
export function isSharedVersionSkewWarning(warning: BuildWarning): boolean {
  return (
    warning.code === "IMPORT_IS_UNDEFINED" &&
    SHARED_VIRTUAL_MODULE_RE.test(warning.message ?? "")
  )
}
