/**
 * The slice of the Module Federation runtime instance the loader uses. Typed
 * structurally so tests can provide a fake and so the loader survives minor
 * runtime upgrades.
 */
export interface FederationRemote {
  name: string
  entry: string
  alias?: string
  type?: "module" | "var" | "esm" | "global" | "system" | "script" | "jsonp"
  shareScope?: string | string[]
}

export interface FederationSharedEntry {
  version: string
  from: string
  loaded?: boolean
  lib?: () => unknown
  scope?: string[]
  shareConfig?: { singleton?: boolean; requiredVersion?: false | string; eager?: boolean }
  useIn?: string[]
}

/** `scope → package → version → entry` as kept by the runtime. */
export type FederationShareScopeMap = Record<string, Record<string, Record<string, FederationSharedEntry>>>

export interface FederationInstance {
  name: string
  registerRemotes(remotes: FederationRemote[], options?: { force?: boolean }): void
  loadRemote<T = unknown>(id: string): Promise<T | null>
  preloadRemote?(options: { nameOrAlias: string; exposes?: string[]; resourceCategory?: "all" | "sync" }[]): Promise<void>
  shareScopeMap?: FederationShareScopeMap
  moduleCache?: { delete(name: string): boolean; keys(): IterableIterator<string> }
}

export interface FederationSharedInput {
  version: string
  lib: () => unknown
  shareConfig: { singleton: boolean; requiredVersion: string; eager?: boolean }
  scope: string[]
  loaded?: boolean
}

export interface FederationInstanceOptions {
  name: string
  remotes: FederationRemote[]
  shared: Record<string, FederationSharedInput>
  plugins: unknown[]
}

export type FederationInstanceFactory = (options: FederationInstanceOptions) => FederationInstance
