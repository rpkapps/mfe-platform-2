import { describe, expect, it } from "vitest"

import { renderTemplate, replaceTokens, targetFileName } from "../src/template"

const context = { flags: { tecton: true, react18: false }, tokens: { MFE_ID: "asset-tracker", DISPLAY_NAME: "Asset Tracker" } }

describe("renderTemplate", () => {
  it("replaces tokens and leaves unknown tokens alone", () => {
    expect(replaceTokens("__MFE_ID__/__DISPLAY_NAME__/__UNKNOWN__", context.tokens)).toBe("asset-tracker/Asset Tracker/__UNKNOWN__")
    expect(renderTemplate('const id = "__MFE_ID__"', context)).toBe('const id = "asset-tracker"')
  })

  it("keeps positive blocks and drops negative blocks, removing the marker lines", () => {
    const source = ["a", "{{#tecton}}", "tecton", "{{/tecton}}", "{{^tecton}}", "plain", "{{/tecton}}", "b"].join("\n")
    expect(renderTemplate(source, context)).toBe("a\ntecton\nb")
    expect(renderTemplate(source, { ...context, flags: { tecton: false } })).toBe("a\nplain\nb")
  })

  it("accepts markers wrapped in comments so template files stay valid source", () => {
    const source = ["// {{#tecton}}", 'import x from "x"', "// {{/tecton}}", "{/* {{^tecton}} */}", "<p />", "{/* {{/tecton}} */}", "/* {{#react18}} */", "old", "/* {{/react18}} */", "<!-- {{#tecton}} -->", "doc", "<!-- {{/tecton}} -->", "# {{#tecton}}", "shell", "# {{/tecton}}"].join("\n")
    expect(renderTemplate(source, context)).toBe(['import x from "x"', "doc", "shell"].join("\n"))
  })

  it("supports nested and inline blocks", () => {
    const nested = ["{{#tecton}}", "outer", "{{^react18}}", "inner", "{{/react18}}", "{{/tecton}}"].join("\n")
    expect(renderTemplate(nested, context)).toBe("outer\ninner")
    expect(renderTemplate("React {{#react18}}18{{/react18}}{{^react18}}19{{/react18}}", context)).toBe("React 19")
  })

  it("reports unbalanced blocks", () => {
    expect(() => renderTemplate("{{#tecton}}\nx", context)).toThrow(/never closed/)
    expect(() => renderTemplate("{{/tecton}}", context)).toThrow(/without a matching/)
  })

  it("renames dotfiles and strips .tmpl", () => {
    expect(targetFileName("_gitignore")).toBe(".gitignore")
    expect(targetFileName("_npmrc")).toBe(".npmrc")
    expect(targetFileName("_prettierrc")).toBe(".prettierrc")
    expect(targetFileName("package.json.tmpl")).toBe("package.json")
    expect(targetFileName("index.tsx")).toBe("index.tsx")
  })
})
