import rule from "../../src/eslint/rules/require-telemetry-context"
import { ruleTester } from "./rule-tester"

const imports = 'import { useTelemetry } from "@platform/react"\n'

ruleTester.run("require-telemetry-context", rule, {
  valid: [
    `${imports}const telemetry = useTelemetry(); telemetry.track("dashboard.clicked", { count: 1 })`,
    `${imports}const telemetry = useTelemetry(); telemetry.track("assets:export-started")`,
    `${imports}useTelemetry().track("a.b.c")`,
    `${imports}try { run() } catch (error) { telemetry.error(error, { boundary: "dashboard.run" }) }`,
    `${imports}telemetry.error(error)`,
    `${imports}context.platform.telemetry.span("asset.load", { id })`,
    `${imports}function f() { try { run() } catch (error) { report(error) } }`,
    // only telemetry receivers are checked
    "analytics.track(eventName)",
  ],
  invalid: [
    {
      code: `${imports}const telemetry = useTelemetry(); telemetry.track(eventName)`,
      errors: [{ messageId: "nonLiteralEvent", data: { receiver: "telemetry" } }],
    },
    {
      code: `${imports}telemetry.track(\`dashboard.\${name}\`)`,
      errors: [{ messageId: "nonLiteralEvent" }],
    },
    {
      code: `${imports}telemetry.track("Dashboard Clicked")`,
      errors: [{ messageId: "invalidEventName", data: { name: "Dashboard Clicked" } }],
    },
    {
      code: `${imports}telemetry.track("dashboard..clicked")`,
      errors: [{ messageId: "invalidEventName" }],
    },
    {
      code: `${imports}context.platform.telemetry.track("1st")`,
      errors: [{ messageId: "invalidEventName" }],
    },
    {
      code: `${imports}try { run() } catch (error) { telemetry.error(error) }`,
      errors: [{ messageId: "missingBoundary", data: { receiver: "telemetry" } }],
    },
    {
      code: `${imports}try { run() } catch (error) { context.platform.telemetry.error(error) }`,
      errors: [
        { messageId: "missingBoundary", data: { receiver: "context.platform.telemetry" } },
      ],
    },
    {
      code: 'import { createTelemetry } from "@platform-internal/core"\nconst telemetry = createTelemetry({})',
      errors: [{ messageId: "directTelemetry" }],
    },
  ],
})
