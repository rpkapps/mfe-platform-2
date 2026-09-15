import { CAPABILITY_IDS, type CapabilityId } from "@platform-internal/core"

import { Button } from "@tecton/react/components/button"
import { Switch } from "@tecton/react/components/switch"

import type { DevtoolsPanelRenderProps } from "../registry"
import { Empty, Section } from "../ui"

/** A manifest URL that will not resolve, so the remote fails at the manifest step. */
function missingManifestUrl(mfeId: string): string {
  return `/__devtools/missing-manifest/${encodeURIComponent(mfeId)}.json`
}

/**
 * Simulate the failures a shell is otherwise hard to push into: a remote that
 * will not load, a manifest that 404s, a shared dependency nothing can satisfy,
 * a denied permission group, a withheld capability.
 *
 * Every switch acts on the live host, so what you see is the shell's real
 * failure path — the error boundary, the diagnostic, the retry — and not a
 * mock of it. The panel hides itself in a shell that does not support fault
 * injection.
 */
export function FaultsPanel({ host, snapshot }: DevtoolsPanelRenderProps) {
  const remotes = host.remotes
  const setFault = remotes?.setFault
  const faults = remotes?.faults?.()
  if (!setFault || !faults) {
    return (
      <Empty>
        This shell does not support fault injection. It needs a host built with
        `@platform/host`, with the developer tools allowed by policy.
      </Empty>
    )
  }

  const toggleIn = <T,>(list: readonly T[], value: T, on: boolean): T[] =>
    on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value)

  const overrides = snapshot.remotes.filter((remote) =>
    remote.manifestUrl?.includes("/__devtools/missing-manifest/")
  )
  const isMissing = (mfeId: string) => overrides.some((remote) => remote.mfeId === mfeId)

  return (
    <>
      <Section title="Per remote">
        {snapshot.remotes.length === 0 ? (
          <Empty>No remotes registered.</Empty>
        ) : (
          <div className="platform-devtools-faults">
            {snapshot.remotes.map((remote) => (
              <div key={remote.mfeId} className="platform-devtools-faults-row">
                <strong>{remote.displayName ?? remote.mfeId}</strong>
                <Switch
                  isSelected={faults.unavailable.includes(remote.mfeId)}
                  onChange={(on) =>
                    setFault("unavailable", toggleIn(faults.unavailable, remote.mfeId, on))
                  }
                >
                  Unavailable (REMOTE_LOAD_FAILED)
                </Switch>
                {remotes.setLocalOverride ? (
                  <Switch
                    isSelected={isMissing(remote.mfeId)}
                    onChange={(on) =>
                      remotes.setLocalOverride?.(
                        remote.mfeId,
                        on ? missingManifestUrl(remote.mfeId) : null
                      )
                    }
                  >
                    Manifest 404 (MANIFEST_FETCH_FAILED)
                  </Switch>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Shell-wide">
        <div className="platform-devtools-faults">
          <div className="platform-devtools-faults-row">
            <Switch
              isSelected={faults.denyGroups}
              onChange={(on) => setFault("denyGroups", on)}
            >
              Deny every permission group (preflight → PERMISSION_DENIED)
            </Switch>
          </div>
          <div className="platform-devtools-faults-row">
            <Switch
              isSelected={faults.incompatibleShared}
              onChange={(on) => setFault("incompatibleShared", on)}
            >
              Pin every shared dependency to an impossible range (DEPENDENCY_INCOMPATIBLE)
            </Switch>
          </div>
        </div>
      </Section>

      <Section title="Withheld capabilities">
        <div className="platform-devtools-faults">
          {CAPABILITY_IDS.map((capability: CapabilityId) => (
            <div key={capability} className="platform-devtools-faults-row">
              <Switch
                isSelected={faults.droppedCapabilities.includes(capability)}
                onChange={(on) =>
                  setFault(
                    "droppedCapabilities",
                    toggleIn(faults.droppedCapabilities, capability, on)
                  )
                }
              >
                <code>{capability}</code>
              </Switch>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reset">
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            setFault("unavailable", [])
            setFault("droppedCapabilities", [])
            setFault("denyGroups", false)
            setFault("incompatibleShared", false)
            for (const remote of overrides) remotes.setLocalOverride?.(remote.mfeId, null)
          }}
        >
          Clear every fault
        </Button>
      </Section>
    </>
  )
}
