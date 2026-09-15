import { vi } from "vitest"

import { recordingFetch } from "../src/testing"

export {
  ORIGIN,
  manifest,
  definition,
  fakeLoader,
  createTestHost,
  recordingFetch,
  type FakeDefinitionOptions,
  type RecordingFetch,
} from "../src/testing"

/** `recordingFetch` behind a `vi.fn`, so the host's own tests can assert call counts. */
export function fakeFetch(
  responses: Record<string, unknown | (() => unknown)>,
  options: { failures?: Record<string, number>; status?: Record<string, number> } = {}
) {
  const impl = recordingFetch(responses, options)
  return Object.assign(
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => impl(input, init)),
    { calls: impl.calls }
  )
}
