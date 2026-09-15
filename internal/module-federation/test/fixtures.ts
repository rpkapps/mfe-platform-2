import {
  validateManifest,
  type MfeManifest,
  type MfeManifestInput,
} from "@platform-internal/core"

export function manifest(overrides: Partial<MfeManifestInput> = {}): MfeManifest {
  const input: MfeManifestInput = {
    mfeId: "asset-tracker",
    version: "1.2.3",
    release: { version: "1.2.3", buildId: "b42" },
    entry: {
      loader: "module-federation",
      name: "mfe_asset_tracker",
      file: "remoteEntry.js",
      expose: "./mfe",
      type: "module",
    },
    remote: { baseUrl: "./assets/", preload: "none" },
    runtime: { react: { requiredVersion: "^19.0.0", major: 19 } },
    shared: [
      {
        name: "react",
        requiredVersion: "^19.0.0",
        version: "19.3.0",
        scope: "react19",
        singleton: true,
        shared: true,
        reason: "inferred",
        pairedWith: ["react-dom"],
      },
      {
        name: "react-dom",
        requiredVersion: "^19.0.0",
        version: "19.3.0",
        scope: "react19",
        singleton: true,
        shared: true,
        reason: "inferred",
        pairedWith: ["react"],
      },
      {
        name: "zod",
        requiredVersion: "^4.0.0",
        version: "4.6.5",
        scope: "default",
        singleton: false,
        shared: true,
        reason: "inferred",
      },
      {
        name: "@tecton/react",
        requiredVersion: "*",
        scope: "react19",
        singleton: false,
        shared: false,
        reason: "source-package",
      },
    ],
    ...overrides,
  }
  const result = validateManifest(input)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.manifest
}

export const definition = (protocolVersion = "1.0") => ({
  kind: "platform-remote" as const,
  protocolVersion,
  mfeId: "asset-tracker",
  widgets: [],
  hasRoutes: true,
  mount: () => ({ dispose() {} }),
  mountWidget: () => ({ dispose() {}, setProps() {} }),
})
