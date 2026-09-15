import * as React from "react"
import type { AnyRouter } from "@tanstack/react-router"
import {
  composeTelemetryAdapters,
  createConsoleTelemetryAdapter,
  createMemoryTelemetryAdapter,
  createPlatformHost,
  loadRuntimeConfig,
  type PlatformHost,
  type RuntimeConfig,
} from "@platform/host"
import { createTanStackShellNavigation } from "@platform/host/tanstack"
import { PlatformProvider, createSonnerNotificationPort } from "@platform/host/react"
import { FEATURE_FLAGS, PROJECTS, TENANT, USERS, JOBS } from "@platform-internal/conformance"

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
    policy: { permissionGroups: "all", preflight: true },
    // The shell decides which developer tools to load; the host never imports them,
    // so they stay a separate chunk that a production shell can leave out entirely.
    devtools: { ...runtimeConfig.devtools, load: () => import("@platform/devtools") },
    hostKind: "shell",
  })
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
      <PlatformProvider host={host}>{children}</PlatformProvider>
    </HostContext.Provider>
  )
}
