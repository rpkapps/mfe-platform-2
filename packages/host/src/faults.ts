import {
  PlatformError,
  type CapabilityId,
  type MfeManifest,
  type RemoteLoader,
} from "@platform-internal/core"

/**
 * Fault injection for the developer tools. The shell's own failure paths — a
 * remote that will not load, a shared dependency that cannot be satisfied, a
 * denied permission group, a capability the host withholds — are the ones
 * hardest to reach by hand and easiest to get wrong, so the tools can simulate
 * each of them against a live shell.
 *
 * Everything here is inert unless the developer tools are allowed to load
 * (`decideDevtools`), which is the same gate the tools themselves pass.
 */
export interface HostFaults {
  /** Loading these remotes fails with `REMOTE_LOAD_FAILED`. */
  unavailable: string[]
  /** Every shared request is pinned to a version nothing can satisfy. */
  incompatibleShared: boolean
  /** The coarse permission preflight denies every remote that requires a group. */
  denyGroups: boolean
  /** These capabilities are stripped from every approval. */
  droppedCapabilities: CapabilityId[]
}

export const NO_FAULTS: HostFaults = {
  unavailable: [],
  incompatibleShared: false,
  denyGroups: false,
  droppedCapabilities: [],
}

export interface FaultStore {
  get(): HostFaults
  set<K extends keyof HostFaults>(fault: K, value: HostFaults[K]): void
  /** True while every fault is at its default, so the hot paths can skip the work. */
  clean(): boolean
  subscribe(listener: () => void): () => void
}

export function createFaultStore(): FaultStore {
  let state: HostFaults = { ...NO_FAULTS }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(fault, value) {
      state = { ...state, [fault]: value }
      for (const listener of Array.from(listeners)) listener()
    },
    clean: () =>
      state.unavailable.length === 0 &&
      !state.incompatibleShared &&
      !state.denyGroups &&
      state.droppedCapabilities.length === 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Wraps the real loader so the two load-time faults apply. The wrapper is
 * always installed and always delegates; with no faults set it is a pass-through.
 */
export function withFaults(inner: RemoteLoader, faults: FaultStore): RemoteLoader {
  const rewrite = (manifest: MfeManifest): MfeManifest =>
    faults.get().incompatibleShared
      ? {
          ...manifest,
          shared: manifest.shared.map((request) =>
            request.shared
              ? { ...request, requiredVersion: "^99.0.0", reason: "pinned" as const }
              : request
          ),
        }
      : manifest
  return {
    get name() {
      return inner.name
    },
    register: (manifest, options) => inner.register(rewrite(manifest), options),
    load(manifest, options) {
      if (faults.get().unavailable.includes(manifest.mfeId)) {
        return Promise.reject(
          new PlatformError({
            code: "REMOTE_LOAD_FAILED",
            message: `${manifest.mfeId} is simulated as unavailable by the developer tools.`,
            owner: { mfeId: manifest.mfeId },
            source: "devtools:faults",
          })
        )
      }
      return inner.load(rewrite(manifest), options)
    },
    preload: inner.preload
      ? (manifest, options) => inner.preload!(rewrite(manifest), options)
      : undefined,
    sharedReport: inner.sharedReport ? (mfeId) => inner.sharedReport!(mfeId) : undefined,
    invalidate: inner.invalidate ? (mfeId) => inner.invalidate!(mfeId) : undefined,
  }
}
