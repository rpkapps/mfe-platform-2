export default async function globalTeardown() {
  const state = globalThis.__platformE2E
  if (!state) return
  for (const server of state.servers) server.close()
  for (const child of state.children) child.kill()
}
