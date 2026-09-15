import { describe, expect, it } from "vitest"

import {
  createMemoryTelemetryAdapter,
  createTelemetry,
  PlatformError,
  type TelemetryAdapter,
} from "../src"

describe("createTelemetry — one failure, one report", () => {
  it("reports an error instance once, across children and spans", () => {
    const adapter = createMemoryTelemetryAdapter()
    const telemetry = createTelemetry({ adapter, context: { environment: "test" } })
    const error = new PlatformError({ code: "MOUNT_FAILED", message: "boom" })

    telemetry.error(error, { boundary: "mount" })
    // The same failure reported again — by the diagnostics bus, and by a remote's
    // bridge telemetry, which is a child of this one — adds no second event.
    telemetry.error(error, { "diagnostic.type": "mount.failed" })
    telemetry.child({ mfeId: "a" }).error(error, { boundary: "widget" })
    // A span failing with it likewise: the adapter has no spanStart, so `fail`
    // would otherwise fall back to a third error report.
    telemetry.span("mount").fail(error)

    expect(adapter.events.filter((event) => event.kind === "error")).toHaveLength(1)
    expect(adapter.events[0]?.attributes).toMatchObject({
      environment: "test",
      boundary: "mount",
    })
  })

  it("keeps distinct failures, retries and non-object rejections separate", () => {
    const adapter = createMemoryTelemetryAdapter()
    const telemetry = createTelemetry({ adapter })
    // Each attempt throws its own error: de-duplication is by identity, so a
    // remote that fails the same way twice is still reported twice.
    telemetry.error(new PlatformError({ code: "MOUNT_FAILED", message: "boom" }))
    telemetry.error(new PlatformError({ code: "MOUNT_FAILED", message: "boom" }))
    telemetry.error("a string rejection")
    telemetry.error("a string rejection")
    expect(adapter.events).toHaveLength(4)
  })

  it("still ends a span through an adapter that implements spanStart", () => {
    const failed: unknown[] = []
    const adapter: TelemetryAdapter = {
      track: () => {},
      error: () => {},
      spanStart: () => ({ end: () => {}, fail: (error) => failed.push(error) }),
    }
    const telemetry = createTelemetry({ adapter })
    const error = new PlatformError({ code: "MOUNT_FAILED", message: "boom" })
    telemetry.error(error)
    telemetry.span("mount").fail(error)
    // A span outcome is not an error report: reporting the error first must not
    // swallow the span's failure.
    expect(failed).toEqual([error])
  })
})
