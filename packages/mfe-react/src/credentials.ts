import {
  isCredentialOriginAllowed,
  PlatformError,
  toPlatformError,
  type HostBridge,
} from "@platform-internal/core"

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
 *
 * Components use `usePlatformFetch()`; loaders use `context.platform.fetch`.
 */
export function createPlatformFetch(
  bridge: HostBridge,
  owner: { mfeId: string; instanceId: string; widgetId?: string }
): PlatformFetch {
  return async (input, init = {}) => {
    const { audience, scopes, ...requestInit } = init
    const credentials = bridge.credentials
    const url = urlOf(input)
    const shellOrigin = typeof location !== "undefined" ? location.origin : undefined
    if (!isCredentialOriginAllowed(url, credentials, shellOrigin)) {
      bridge.diagnostics.emit({
        type: "log",
        level: "error",
        message: `Refused to attach an access token to ${url}: the origin is neither the shell's nor allow-listed.`,
        ...owner,
      })
      throw new PlatformError({
        code: "AUTH_UNAVAILABLE",
        message: `The platform fetch refused to send a bearer token to "${url}". Only the shell origin and the origins the shell allow-lists may receive one.`,
        owner: { mfeId: owner.mfeId, instanceId: owner.instanceId },
        source: url,
        override: "createPlatformHost → policy.credentialOrigins",
      })
    }

    const signal = requestInit.signal ?? undefined
    const send = async (forceRefresh: boolean) => {
      let token: string
      try {
        token = await credentials.getToken({ audience, scopes, forceRefresh, signal })
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

    const response = await send(false)
    // The token expired between issue and use; ask for a fresh one, once.
    return response.status === 401 ? send(true) : response
  }
}
