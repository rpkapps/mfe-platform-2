import { act } from "@testing-library/react"
import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
  type AnyRoute,
} from "@tanstack/react-router"
import type { ComponentType } from "react"
import type { MountHandle, WidgetHandle } from "@platform-internal/core"
import type { MfeDefinition, MfeRouterContext } from "../src/types"
import { createTestBridge, type CreateTestBridgeOptions, type TestBridge } from "../src/testing"

export async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

export async function mountMfe(
  definition: MfeDefinition,
  bridge: TestBridge,
  container = document.createElement("div")
): Promise<{ handle: MountHandle; container: HTMLElement }> {
  document.body.append(container)
  let handle!: MountHandle
  await act(async () => {
    handle = definition.mount({ container, bridge })
  })
  await flush()
  return { handle, container }
}

export async function mountWidget(
  definition: MfeDefinition,
  bridge: TestBridge,
  widgetId: string,
  props: Record<string, unknown>,
  container = document.createElement("div")
): Promise<{ handle: WidgetHandle; container: HTMLElement }> {
  document.body.append(container)
  let handle!: WidgetHandle
  await act(async () => {
    handle = definition.mountWidget({ container, bridge, widgetId, props })
  })
  await flush()
  return { handle, container }
}

export async function disposeAsync(handle: MountHandle): Promise<void> {
  await act(async () => {
    handle.dispose()
  })
}

export function bridgeFor(options: CreateTestBridgeOptions): TestBridge {
  return createTestBridge(options)
}

export interface RouteSpec {
  path: string
  component: ComponentType
  [option: string]: unknown
}

/** Build a small code-based route tree: `[{ path: "/", component }, ...]`. */
export function routeTreeOf(
  routes: RouteSpec[],
  rootOptions: Record<string, unknown> = {}
): { rootRoute: AnyRoute; routeTree: AnyRoute } {
  const rootRoute = createRootRouteWithContext<MfeRouterContext>()({
    component: () => <Outlet />,
    ...rootOptions,
  } as never)
  const children = routes.map(({ path, component, ...rest }) =>
    createRoute({ getParentRoute: () => rootRoute, path, component, ...rest } as never)
  )
  return {
    rootRoute: rootRoute as unknown as AnyRoute,
    routeTree: rootRoute.addChildren(children as never) as unknown as AnyRoute,
  }
}
