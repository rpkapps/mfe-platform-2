import rule from "../../src/eslint/rules/valid-capability-usage"
import { ruleTester, validFile } from "./rule-tester"

ruleTester.run("valid-capability-usage", rule, {
  valid: [
    'import { useCapability } from "@platform/react"\nconst ok = useCapability("storage.local")',
    'import { useCapability } from "@platform/react"\nconst ok = useCapability(id)',
    {
      code: 'import { useTelemetry, usePlatform } from "@platform/react"',
      filename: validFile("src", "routes", "index.tsx"),
    },
    // no mfe.config → nothing is removed
    'import { useNotifications } from "@platform/react"',
  ],
  invalid: [
    {
      code: 'import { useCapability } from "@platform/react"\nconst ok = useCapability("teleportation")',
      errors: [
        {
          messageId: "unknownCapability",
          data: {
            id: "teleportation",
            known:
              "navigation, context, storage.local, storage.session, telemetry, commands, settings, help, release-notes, breadcrumbs, overlays, notifications, runtime-env, widgets",
          },
        },
      ],
    },
    {
      code: 'import * as platform from "@platform/react"\nplatform.useCapability("Storage")',
      errors: [{ messageId: "unknownCapability" }],
    },
    {
      code: 'import { useNotifications, useTelemetry } from "@platform/react"',
      filename: validFile("src", "routes", "index.tsx"),
      errors: [
        {
          messageId: "removedCapability",
          data: { api: "useNotifications", capability: "notifications" },
        },
      ],
    },
  ],
})
