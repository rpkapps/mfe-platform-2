import * as React from "react"
import type { AnyRouter } from "@tanstack/react-router"
import {
  composeTelemetryAdapters,
  createConsoleTelemetryAdapter,
  createMemoryTelemetryAdapter,
  createPlatformHost,
  loadRuntimeConfig,
  type CredentialAdapter,
  type PlatformHost,
  type RuntimeConfig,
} from "@platform/host"
import { PlatformProvider } from "@platform/host-react"
import { createTanStackShellNavigation } from "@platform/host-react/tanstack"
import { FEATURE_FLAGS, PROJECTS, TENANT, USERS, JOBS } from "@platform-internal/conformance"

import { createSonnerNotificationPort } from "@/components/notifications"
import { LoadingState, RemoteErrorState } from "@/components/status"

import { registry } from "./registry"

export type UserKey = keyof typeof USERS

export const memoryTelemetry = createMemoryTelemetryAdapter({ limit: 200 })

export function createShellHost({
  runtimeConfig,
  router,
}: {
  runtimeConfig: RuntimeConfig
  router: AnyRouter
}): PlatformHost {
  const user = USERS.admin
  return createPlatformHost({
    runtimeConfig,
    registry,
    navigation: createTanStackShellNavigation(router),
    context: {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        sessionId: "session-conformance",
      },
      permissionGroups: user.groups,
      tenant: TENANT,
      project: PROJECTS[0]!,
      job: JOBS[0]!,
      locale: "en-GB",
      timezone: "Europe/Oslo",
      theme: "dark",
      resolvedTheme: "dark",
      featureFlags: FEATURE_FLAGS,
      environment: runtimeConfig.environment,
      release: runtimeConfig.release,
    },
    notifications: createSonnerNotificationPort(),
    telemetry: composeTelemetryAdapters(
      memoryTelemetry,
      createConsoleTelemetryAdapter("[shell telemetry]")
    ),
    policy: {
      permissionGroups: "all",
      preflight: true,
      // Nothing beyond the shell's own origin: the conformance MFEs call the
      // shell, and the E2E suite asserts that anything else is refused.
      credentialOrigins: [],
    },
    credentials: conformanceCredentials(),
    // The shell decides which developer tools to load; the host never imports them,
    // so they stay a separate chunk that a production shell can leave out entirely.
    devtools: { ...runtimeConfig.devtools, load: () => import("@platform/devtools") },
  })
}

/**
 * Stand-in for a real identity provider. A production shell implements this
 * against its own IdP — the platform only ever sees `getToken`/`subscribe`, so
 * no SDK and no remote learns which provider is in use.
 */
function conformanceCredentials(): CredentialAdapter {
  let issued = 0
  return {
    getToken(request) {
      issued += 1
      const audience = request?.audience ?? "default"
      return Promise.resolve(
        `conformance.${audience}.${request?.forceRefresh ? "refreshed" : "cached"}.${issued}`
      )
    },
    subscribe: () => () => {},
  }
}

export function switchUser(host: PlatformHost, key: UserKey) {
  const user = USERS[key]
  host.context.patch({
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      sessionId: "session-conformance",
    },
    permissionGroups: user.groups,
  })
}

const HostContext = React.createContext<PlatformHost | null>(null)

export function useShellHost(): PlatformHost | null {
  return React.useContext(HostContext)
}

/**
 * Creates the platform host once on the client. The server renders the chrome
 * only; remotes never render on the server.
 */
export function ShellPlatform({
  runtimeConfig,
  router,
  children,
}: {
  runtimeConfig: RuntimeConfig
  router: AnyRouter
  children: React.ReactNode
}) {
  const [host, setHost] = React.useState<PlatformHost | null>(null)
  React.useEffect(() => {
    let disposed = false
    let created: PlatformHost | null = null
    loadRuntimeConfig({ inline: runtimeConfig }).then((config) => {
      if (disposed) return
      created = createShellHost({ runtimeConfig: config, router })
      setHost(created)
    })
    return () => {
      disposed = true
      created?.dispose()
    }
  }, [])
  if (!host) return <HostContext.Provider value={null}>{children}</HostContext.Provider>
  return (
    <HostContext.Provider value={host}>
      <PlatformProvider
        host={host}
        renderLoading={(props) => <LoadingState {...props} />}
        renderError={(props) => <RemoteErrorState {...props} />}
      >
        {children}
      </PlatformProvider>
    </HostContext.Provider>
  )
}
