import {
  PlatformError,
  toPlatformError,
  type CommandRunContext,
  type RegisteredCommand,
} from "@platform-internal/core"

import type { CommandRunResult, CommandRunner, PlatformHost } from "./types"

/** Absolute href of a route command: `<routePrefix><route>`. */
export function commandHref(
  host: PlatformHost,
  command: RegisteredCommand
): string | undefined {
  const route = command.definition.route
  if (!route) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(route)) return route
  const prefix = host.routePrefixOf(command.owner.mfeId)
  const path = route.startsWith("/") ? route : `/${route}`
  return prefix === "/" ? path : `${prefix}${path}`
}

/** Whether the current context may see and run the command (groups + availability predicate). */
export function isCommandAvailable(host: PlatformHost, command: RegisteredCommand): boolean {
  const required = command.definition.permissionGroups ?? []
  if (required.length) {
    const groups = new Set(host.context.getState().permissionGroups)
    if (!required.every((group) => groups.has(group))) return false
  }
  try {
    return command.definition.availability ? command.definition.availability() !== false : true
  } catch {
    return false
  }
}

export function createCommandRunner(host: PlatformHost): CommandRunner {
  const controllers = new Map<string, AbortController>()
  const runner: CommandRunner = {
    running: () => Array.from(controllers.keys()),
    abort(qualifiedId) {
      const controller = controllers.get(qualifiedId)
      if (!controller) return false
      controller.abort()
      return true
    },
    async run(qualifiedId, options = {}) {
      const source = options.source ?? "api"
      const startedAt = Date.now()
      const registry = host.registries.commands
      const command = registry.get(qualifiedId)
      const owner = command
        ? {
            mfeId: command.owner.mfeId,
            instanceId: command.owner.instanceId,
            widgetId: command.owner.widgetId,
          }
        : undefined
      const done = (
        outcome: CommandRunResult["outcome"],
        error?: PlatformError
      ): CommandRunResult => ({
        qualifiedId,
        outcome,
        durationMs: Date.now() - startedAt,
        error,
      })
      if (!command) {
        const error = new PlatformError({
          code: "COMMAND_INVALID",
          message: `Unknown command "${qualifiedId}".`,
          source: qualifiedId,
        })
        host.diagnostics.emit({
          type: "command.run",
          qualifiedId,
          outcome: "failed",
          error: error.message,
        })
        return done("unknown", error)
      }
      if (!isCommandAvailable(host, command)) {
        const error = new PlatformError({
          code: "PERMISSION_DENIED",
          message: `Command "${qualifiedId}" is not available in the current context.`,
          owner,
          source: qualifiedId,
        })
        host.diagnostics.emit({
          type: "command.run",
          qualifiedId,
          outcome: "failed",
          error: error.message,
          ...owner,
        })
        return done("unavailable", error)
      }
      controllers.get(qualifiedId)?.abort()
      const controller = new AbortController()
      controllers.set(qualifiedId, controller)
      registry.setState(qualifiedId, { status: "running", startedAt })
      host.diagnostics.emit({ type: "command.run", qualifiedId, outcome: "started", ...owner })
      const telemetry = host.telemetry.child({
        ...owner,
        command: qualifiedId,
        ...(command.definition.telemetry ?? {}),
      })
      const span = telemetry.span("command.run", { source })
      const finish = (result: CommandRunResult) => {
        if (controllers.get(qualifiedId) === controller) controllers.delete(qualifiedId)
        return result
      }
      try {
        const href = commandHref(host, command)
        if (href && typeof command.definition.handler !== "function") {
          host.navigation.push(href)
          registry.setState(qualifiedId, { status: "succeeded", finishedAt: Date.now() })
          host.diagnostics.emit({
            type: "command.run",
            qualifiedId,
            outcome: "succeeded",
            durationMs: Date.now() - startedAt,
            ...owner,
          })
          span.end({ outcome: "navigated", href })
          return finish(done("navigated"))
        }
        const context: CommandRunContext = {
          signal: controller.signal,
          source,
          platform: host.exposedContext.getState(),
        }
        await command.definition.handler(context)
        if (controller.signal.aborted) {
          registry.setState(qualifiedId, { status: "idle" })
          host.diagnostics.emit({
            type: "command.run",
            qualifiedId,
            outcome: "cancelled",
            durationMs: Date.now() - startedAt,
            ...owner,
          })
          span.end({ outcome: "cancelled" })
          return finish(done("cancelled"))
        }
        if (href) host.navigation.push(href)
        registry.setState(qualifiedId, { status: "succeeded", finishedAt: Date.now() })
        host.diagnostics.emit({
          type: "command.run",
          qualifiedId,
          outcome: "succeeded",
          durationMs: Date.now() - startedAt,
          ...owner,
        })
        span.end({ outcome: "succeeded" })
        return finish(done("succeeded"))
      } catch (error) {
        if (controller.signal.aborted) {
          registry.setState(qualifiedId, { status: "idle" })
          host.diagnostics.emit({
            type: "command.run",
            qualifiedId,
            outcome: "cancelled",
            durationMs: Date.now() - startedAt,
            ...owner,
          })
          span.end({ outcome: "cancelled" })
          return finish(done("cancelled"))
        }
        const platformError = toPlatformError(error, {
          code: "COMMAND_FAILED",
          owner,
          source: qualifiedId,
        })
        registry.setState(qualifiedId, {
          status: "failed",
          error: platformError.message,
          failedAt: Date.now(),
        })
        host.diagnostics.emit({
          type: "command.run",
          qualifiedId,
          outcome: "failed",
          durationMs: Date.now() - startedAt,
          error: platformError.message,
          ...owner,
        })
        telemetry.error(platformError, { boundary: "command" })
        span.fail(platformError)
        return finish(done("failed", platformError))
      }
    },
  }
  return runner
}

/** Run a command; never throws — failures come back as a result. */
export function runCommand(
  host: PlatformHost,
  qualifiedId: string,
  options: { source?: "palette" | "shortcut" | "api" } = {}
): Promise<CommandRunResult> {
  return host.commands.run(qualifiedId, options)
}
