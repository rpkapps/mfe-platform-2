import rule from "../../src/eslint/rules/no-cross-root-component-passing"
import { ruleTester } from "./rule-tester"

const imports =
  'import { useRegisterCommand, useNotifications, createPlatformStorage, useTelemetry } from "@platform/mfe-react"\n'
const tsx = "/project/src/a.tsx"

ruleTester.run("no-cross-root-component-passing", rule, {
  valid: [
    {
      code: `${imports}useRegisterCommand({ id: "a", label: "A", icon: "box", handler: () => <Panel />, availability: () => true, telemetry: { area: "x" } })`,
      filename: tsx,
    },
    {
      code: `${imports}const { notify } = useNotifications(); notify({ title: "Saved", description: "All good", kind: "success" })`,
      filename: tsx,
    },
    {
      code: `${imports}createPlatformStorage({ scope: "local", key: "x", defaults: { columns: ["a"], count: 1, nested: { ok: true } } })`,
      filename: tsx,
    },
    {
      code: `${imports}const telemetry = useTelemetry(); telemetry.track("a.b", { count: 1, name: "x" })`,
      filename: tsx,
    },
    {
      code: `const el = <WidgetSlot mfeId="a" widgetId="b" props={{ assetId: "1", compact: true }} />`,
      filename: tsx,
    },
    { code: `handle.setProps({ assetId: "2" })`, filename: tsx },
    { code: `useOther({ render: <Panel /> })`, filename: tsx },
    {
      code: `${imports}useRegisterCommand({ id: "a", label: "A", group: GROUP_NAME, handler })`,
      filename: tsx,
    },
  ],
  invalid: [
    {
      code: `${imports}useRegisterCommand({ id: "a", label: <strong>A</strong>, handler })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "useRegisterCommand.label", what: "a JSX element" },
        },
      ],
    },
    {
      code: `${imports}useRegisterCommand({ id: "a", label: "A", icon: BoxIcon, handler })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "useRegisterCommand.icon", what: "the component `BoxIcon`" },
        },
      ],
    },
    {
      code: `${imports}const { notify } = useNotifications(); notify({ title: "x", description: <Details /> })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "notify.description", what: "a JSX element" },
        },
      ],
    },
    {
      code: `${imports}notify({ title: "x", action: () => <Undo /> })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "notify.action", what: "a function returning JSX" },
        },
      ],
    },
    {
      code: `${imports}notify({ title: "x", action: function () { return <Undo /> } })`,
      filename: tsx,
      errors: [{ messageId: "componentValue" }],
    },
    {
      code: `${imports}createPlatformStorage({ scope: "local", key: "x", defaults: { widget: <Panel /> } })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "createPlatformStorage.defaults.widget", what: "a JSX element" },
        },
      ],
    },
    {
      code: `${imports}const telemetry = useTelemetry(); telemetry.track("a.b", { element: React.createElement("div") })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: {
            path: "telemetry.track(arg 1).element",
            what: "a `React.createElement()` element",
          },
        },
      ],
    },
    {
      code: `${imports}useTelemetry().error(err, { fallback: Fallback })`,
      filename: tsx,
      errors: [{ messageId: "componentValue" }],
    },
    {
      code: `const el = <WidgetSlot mfeId="a" widgetId="b" props={{ header: <Header />, items: [Item] }} />`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "WidgetSlot props.header", what: "a JSX element" },
        },
        {
          messageId: "componentValue",
          data: { path: "WidgetSlot props.items[0]", what: "the component `Item`" },
        },
      ],
    },
    {
      code: `handle.setProps({ renderer: Renderer })`,
      filename: tsx,
      errors: [
        {
          messageId: "componentValue",
          data: { path: "setProps.renderer", what: "the component `Renderer`" },
        },
      ],
    },
  ],
})
