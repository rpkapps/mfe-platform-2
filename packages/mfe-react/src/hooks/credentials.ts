import { useMemo } from "react"
import type { CredentialPort } from "@platform-internal/core"

import { createPlatformFetch, type PlatformFetch } from "../credentials"
import { useMountScope } from "../provider"

/**
 * The shell's credential port. `getToken()` rejects with `AUTH_UNAVAILABLE`
 * when this MFE was not granted the `auth` capability or the shell supplied no
 * adapter, so there is never a silent unauthenticated path.
 *
 * Most code wants {@link usePlatformFetch} instead; reach for this when a
 * client library needs the raw token.
 */
export function useCredentials(): CredentialPort {
  return useMountScope("useCredentials").bridge.credentials
}

/** {@link createPlatformFetch} bound to this mount. Loaders use `context.platform.fetch`. */
export function usePlatformFetch(): PlatformFetch {
  const scope = useMountScope("usePlatformFetch")
  return useMemo(
    () =>
      createPlatformFetch(scope.bridge, {
        mfeId: scope.instance.mfeId,
        instanceId: scope.instance.instanceId,
        widgetId: scope.instance.widgetId,
      }),
    [scope]
  )
}
