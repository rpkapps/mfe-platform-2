import { PlatformError } from "./errors"

/**
 * What an MFE asks for when it needs to call an authenticated backend. The
 * shell maps `audience` to whatever its identity provider calls that API, so a
 * remote never learns which provider is in use.
 */
export interface TokenRequest {
  /** Which API the token is for; the shell maps it to an IdP audience or resource. */
  audience?: string
  scopes?: readonly string[]
  /** Skip any cache — used once after a 401, never speculatively. */
  forceRefresh?: boolean
  signal?: AbortSignal
}

/**
 * The shell's credential adapter, shaped like the other ports the shell
 * supplies (`TelemetryAdapter`, `NotificationPort`, `StorageBackend`): the
 * platform defines the contract, the shell implements it against its identity
 * provider, and no SDK ever imports a vendor library.
 *
 * Without it, teams read cookies, reach into shell globals, bundle a second
 * auth library (breaking the single session) or monkeypatch `fetch`.
 */
export interface CredentialAdapter {
  /**
   * Resolve an access token. Rejects with a `PlatformError` when no session can
   * be established — callers surface that, they never fall back to an
   * unauthenticated request.
   */
  getToken(request?: TokenRequest): Promise<string>
  /** Fires on login, logout, silent refresh and tenant switch. */
  subscribe(listener: () => void): () => void
}

/**
 * What the bridge carries: the shell's adapter plus the origins a bearer token
 * may be attached to. The host fills `allowedOrigins` in from its policy; the
 * shell origin is always allowed and is not listed here.
 *
 * A token-attaching `fetch` with no origin check is a credential-leak
 * primitive, so the SDK refuses any other origin and says so in diagnostics.
 * The shell's adapter is still the authority — it decides whether to mint a
 * token for a given audience at all.
 */
export interface CredentialPort extends CredentialAdapter {
  readonly allowedOrigins: readonly string[]
}

/** True when `url` may carry a bearer token: same origin, or on the allow-list. */
export function isCredentialOriginAllowed(
  url: string,
  port: Pick<CredentialPort, "allowedOrigins">,
  shellOrigin: string | undefined
): boolean {
  let target: string
  try {
    target = new URL(url, shellOrigin).origin
  } catch {
    return false
  }
  if (shellOrigin) {
    try {
      if (target === new URL(shellOrigin).origin) return true
    } catch {
      // an unparsable shell origin simply never matches
    }
  }
  return port.allowedOrigins.some((allowed) => {
    try {
      return new URL(allowed).origin === target
    } catch {
      return false
    }
  })
}

/**
 * Stands in for the port when the remote did not get the `auth` capability, or
 * when the shell supplied no adapter at all: every call fails the same way,
 * with a message that names which of the two it is.
 */
export function deniedCredentialPort(reason: {
  mfeId?: string
  /** "capability" when the host denied `auth`, "unconfigured" when the shell has no adapter. */
  cause: "capability" | "unconfigured"
}): CredentialPort {
  const message =
    reason.cause === "capability"
      ? "This MFE did not receive the `auth` capability, so it cannot request an access token. Declare it in mfe.config.ts → capabilities and have the host approve it."
      : "The shell did not supply a credential adapter, so no access token can be issued. Pass `credentials` to createPlatformHost."
  return {
    allowedOrigins: [],
    getToken() {
      return Promise.reject(
        new PlatformError({
          code: "AUTH_UNAVAILABLE",
          message,
          owner: reason.mfeId ? { mfeId: reason.mfeId } : undefined,
          source: "@platform/host",
          override:
            reason.cause === "capability"
              ? "mfe.config.ts → capabilities"
              : "createPlatformHost → credentials",
        })
      )
    },
    subscribe() {
      return () => {}
    },
  }
}
