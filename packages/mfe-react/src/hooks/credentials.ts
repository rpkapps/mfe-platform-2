import { useCallback, useMemo } from "react"
import {
  isCredentialOriginAllowed,
  PlatformError,
  toPlatformError,
  type CredentialPort,
  type TokenRequest,
} from "@platform-internal/core"

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

export interface PlatformFetchOptions extends RequestInit {
  /** Which API this call is for; the shell maps it to an IdP audience or resource. */
  audience?: string
  scopes?: readonly string[]
}

export type PlatformFetch = (
  input: RequestInfo | URL,
  init?: PlatformFetchOptions
) => Promise<Response>

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : (input as Request).url
}

/**
 * `fetch` with the shell's access token attached as `Authorization: Bearer`.
 *
 * Two rules that are easy to get wrong by hand:
 *
 * - A 401 is retried exactly once with `forceRefresh: true`, which covers a
 *   token that expired mid-flight and nothing else. A second 401 is returned.
 * - The token is only ever attached to the shell's own origin or an origin the
 *   shell allow-listed. Any other URL is refused with `AUTH_UNAVAILABLE` before
 *   the request is sent, and the refusal is recorded in diagnostics — a
 *   token-attaching fetch without that check is a credential-leak primitive.
 *
 * Non-ok responses come back as ordinary `Response` objects. This never
 * swallows a status: the caller decides what a 404 or a 500 means.
 */
export function usePlatformFetch(): PlatformFetch {
  const scope = useMountScope("usePlatformFetch")
  const owner = useMemo(
    () => ({
      mfeId: scope.instance.mfeId,
      instanceId: scope.instance.instanceId,
      widgetId: scope.instance.widgetId,
    }),
    [scope]
  )
  return useCallback(
    async (input: RequestInfo | URL, init: PlatformFetchOptions = {}) => {
      const { audience, scopes, ...requestInit } = init
      const credentials = scope.bridge.credentials
      const url = urlOf(input)
      const shellOrigin = typeof location !== "undefined" ? location.origin : undefined
      if (!isCredentialOriginAllowed(url, credentials, shellOrigin)) {
        scope.bridge.diagnostics.emit({
          type: "log",
          level: "error",
          message: `Refused to attach an access token to ${url}: the origin is neither the shell's nor allow-listed.`,
          ...owner,
        })
        throw new PlatformError({
          code: "AUTH_UNAVAILABLE",
          message: `usePlatformFetch refused to send a bearer token to "${url}". Only the shell origin and the origins the shell allow-lists may receive one.`,
          owner: { mfeId: owner.mfeId, instanceId: owner.instanceId },
          source: url,
          override: "createPlatformHost → policy.credentialOrigins",
        })
      }

      const send = async (request: TokenRequest) => {
        let token: string
        try {
          token = await credentials.getToken(request)
        } catch (error) {
          throw toPlatformError(error, {
            code: "AUTH_FAILED",
            message: `Could not get an access token for ${url}.`,
            owner: { mfeId: owner.mfeId, instanceId: owner.instanceId },
            source: url,
          })
        }
        const headers = new Headers(requestInit.headers)
        headers.set("Authorization", `Bearer ${token}`)
        return fetch(input, { ...requestInit, headers })
      }

      const response = await send({ audience, scopes, signal: requestInit.signal ?? undefined })
      if (response.status !== 401) return response
      // The token expired between issue and use; ask for a fresh one once.
      return send({
        audience,
        scopes,
        forceRefresh: true,
        signal: requestInit.signal ?? undefined,
      })
    },
    [scope, owner]
  )
}
