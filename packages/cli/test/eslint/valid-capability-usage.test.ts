import { CAPABILITY_IDS } from "@platform-internal/core"

import rule from "../../src/eslint/rules/valid-capability-usage"
import { ruleTester, validFile } from "./rule-tester"

/** Derived, so adding a capability never means editing a string here. */
const KNOWN_CAPABILITIES = CAPABILITY_IDS.join(", ")

ruleTester.run("valid-capability-usage", rule, {
  valid: [
    'import { useCapability } from "@platform/mfe-react"\nconst ok = useCapability("storage.local")',
    'import { useCapability } from "@platform/mfe-react"\nconst ok = useCapability(id)',
    {
      code: 'import { useTelemetry, usePlatform } from "@platform/mfe-react"',
      filename: validFile("src", "routes", "index.tsx"),
    },
    // no mfe.config → nothing is removed
    'import { useNotifications } from "@platform/mfe-react"',
  ],
  invalid: [
    {
      code: 'import { useCapability } from "@platform/mfe-react"\nconst ok = useCapability("teleportation")',
      errors: [
        {
          messageId: "unknownCapability",
          data: {
            id: "teleportation",
            known: KNOWN_CAPABILITIES,
          },
        },
      ],
    },
    {
      code: 'import * as platform from "@platform/mfe-react"\nplatform.useCapability("Storage")',
      errors: [{ messageId: "unknownCapability" }],
    },
    {
      code: 'import { useNotifications, useTelemetry } from "@platform/mfe-react"',
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
