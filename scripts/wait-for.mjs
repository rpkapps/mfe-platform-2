// Poll a URL until it answers (any status < 500) or the timeout elapses.
export async function waitFor(url, { timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : "no response"}`
  )
}
