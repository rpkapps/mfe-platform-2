import { existsSync } from "node:fs"
import { join, relative } from "node:path"

import { PlatformError } from "@platform-internal/core"
import type { Plugin, ResolvedConfig, UserConfig } from "vite"

import { scopeCss } from "../css-scope"
import { writeGeneratedEntry } from "../entry"
import { generateManifest, serializeManifest, writeManifestCopy } from "../manifest"
import { toBuildError, type PlatformContext } from "./context"

/**
 * Build-side integration: Vite config defaults for a remote, the generated
 * entry, the CSS asset safety net and the manifest emission. `enforce: "post"`
 * so `generateBundle` runs after `vite:css-post` emitted the CSS assets.
 */
export function platformCorePlugin(context: PlatformContext): Plugin {
  let viteConfig: ResolvedConfig | undefined
  return {
    name: "platform:core",
    enforce: "post",
    apply: (_config, env) => env.mode !== "test",
    config(userConfig: UserConfig) {
      const config = context.config()
      // Written before rolldown resolves inputs; a missing src/mfe.tsx fails here with a formatted PlatformError.
      try {
        writeGeneratedEntry(config)
      } catch (error) {
        throw toBuildError(error)
      }
      const port = userConfig.server?.port
      const server: NonNullable<UserConfig["server"]> = {}
      if (userConfig.server?.cors === undefined) server.cors = true
      if (port && !userConfig.server?.origin) server.origin = `http://localhost:${port}`
      const build: NonNullable<UserConfig["build"]> = {}
      if (userConfig.build?.target === undefined) build.target = "es2022"
      if (userConfig.build?.cssCodeSplit === undefined) build.cssCodeSplit = false
      // A remote needs no index.html: the generated entry is the build input unless the project configures one.
      const configuredInput =
        userConfig.build?.rolldownOptions?.input ?? userConfig.build?.rollupOptions?.input
      if (configuredInput === undefined && !existsSync(join(config.root, "index.html")))
        build.rolldownOptions = { input: { mfe: config.generatedEntry } }
      return { build, server }
    },
    configResolved(resolved) {
      viteConfig = resolved
      const config = context.config()
      if (relative(resolved.root, config.root) !== "") {
        throw toBuildError(
          new PlatformError({
            code: "INTERNAL",
            message: `platform() resolved the MFE from "${config.root}" but Vite's root is "${resolved.root}". Pass the same directory as platform({ root }).`,
            owner: { mfeId: config.mfeId },
            override: "platform({ root })",
          })
        )
      }
      const output =
        resolved.build.rolldownOptions?.output ?? resolved.build.rollupOptions?.output
      const outputs = Array.isArray(output) ? output : output ? [output] : []
      if (
        outputs.some((entry) => (entry as { codeSplitting?: unknown }).codeSplitting === false)
      ) {
        resolved.logger.warn(
          `[platform] build.rolldownOptions.output.codeSplitting is false: route-level code splitting and shared-dependency chunks are disabled for "${config.mfeId}".`
        )
      }
    },
    buildStart() {
      try {
        writeGeneratedEntry(context.config())
      } catch (error) {
        throw toBuildError(error)
      }
    },
    async generateBundle(_options, bundle) {
      if (!viteConfig || viteConfig.command !== "build") return
      const config = context.config()
      const cssAssets: string[] = []
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue
        cssAssets.push(asset.fileName)
        if (!config.css.scope) continue
        const source =
          typeof asset.source === "string"
            ? asset.source
            : Buffer.from(asset.source).toString("utf8")
        // Idempotent: already scoped rules and renamed keyframes are left untouched.
        asset.source = scopeCss(source, {
          owner: config.mfeId,
          ownerAttribute: config.css.ownerAttribute,
          dropFontFaces: config.css.foundation === "shell",
        }).css
      }
      let generated
      try {
        generated = await generateManifest({
          root: config.root,
          config,
          mode: "build",
          cssAssets: cssAssets.sort(),
        })
      } catch (error) {
        throw toBuildError(error)
      }
      for (const warning of generated.warnings) this.warn(`[platform] ${warning}`)
      this.emitFile({
        type: "asset",
        fileName: config.manifestFileName,
        source: serializeManifest(generated.manifest),
      })
      writeManifestCopy(config, generated.manifest)
    },
  }
}
