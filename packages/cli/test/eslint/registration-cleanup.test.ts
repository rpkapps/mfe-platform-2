import rule from "../../src/eslint/rules/registration-cleanup"
import { ruleTester } from "./rule-tester"

const imports =
  'import { useRegisterCommand, useRegisterSettingsGroup, usePlatform, useBreadcrumb } from "@platform/react"\n'

ruleTester.run("registration-cleanup", rule, {
  valid: [
    `${imports}function Dashboard() { useRegisterCommand({ id: "a", label: "A", handler() {} }); return null }`,
    `${imports}const Widget = () => { useRegisterSettingsGroup({ key: "k", fields: {} }); return null }`,
    `${imports}export function useDashboardCommands() { useRegisterCommand({ id: "a", label: "A", handler() {} }) }`,
    `${imports}export default function () { usePlatform(); return null }`,
    `${imports}const Memoised = memo(function Inner() { useBreadcrumb("x"); return null })`,
    `${imports}function Panel() { const dispose = bridge.registries.commands.register(def, owner); return dispose }`,
    `${imports}function Panel() { useEffect(() => bridge.registries.commands.register(def, owner), []); return null }`,
    // local function called `useRegisterCommand` that is not the platform hook
    "function useRegisterCommand() {}\nuseRegisterCommand()",
  ],
  invalid: [
    {
      code: `${imports}useRegisterCommand({ id: "a", label: "A", handler() {} })`,
      errors: [
        {
          messageId: "hookOutsideComponent",
          data: {
            name: "useRegisterCommand",
            where: "at module level",
            component: "CommandRegistration",
          },
        },
      ],
    },
    {
      code: `${imports}function loadThings() { useRegisterSettingsGroup({ key: "k", fields: {} }) }`,
      errors: [
        {
          messageId: "hookOutsideComponent",
          data: {
            name: "useRegisterSettingsGroup",
            where: "inside `loadThings`",
            component: "SettingsRegistration",
          },
        },
      ],
    },
    {
      code: `${imports}const handler = () => { usePlatform() }`,
      errors: [
        {
          messageId: "hookOutsideComponent",
          data: {
            name: "usePlatform",
            where: "inside `handler`",
            component: "CommandRegistration",
          },
        },
      ],
    },
    {
      code: `${imports}import * as platform from "@platform/react"\nfunction run() { platform.useBreadcrumb("x") }`,
      errors: [{ messageId: "hookOutsideComponent" }],
    },
    {
      code: `${imports}function Panel() { bridge.registries.commands.register(def, owner); return null }`,
      errors: [
        {
          messageId: "disposerDiscarded",
          data: { name: "bridge.registries.commands.register" },
        },
      ],
    },
    {
      code: 'import { registerCommand } from "@platform/react"\nfunction Panel() { registerCommand({ id: "a" }); return null }',
      errors: [{ messageId: "disposerDiscarded", data: { name: "registerCommand" } }],
    },
  ],
})
