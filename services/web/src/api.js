// Small fetch helpers for the demo API. All requests go to the same origin —
// nginx proxies /api/* to the Spring Boot service (same pattern as Phase 1+).

// The guard token is NOT a secret — it's a casual bar against random POSTs.
// It must match DEPLOY_GUARD_TOKEN configured on the API (Helm values).
export const GUARD_TOKEN = 'local-demo'

export async function deploy(message) {
  const res = await fetch('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, guardToken: GUARD_TOKEN }),
  })
  if (res.status === 409) throw new Error('A deploy is already in progress — wait for it to finish.')
  if (!res.ok) throw new Error(`deploy HTTP ${res.status}`)
  return res.json() // { sha }
}

export async function getStatus(sha) {
  const res = await fetch(`/api/status?sha=${encodeURIComponent(sha)}`)
  if (!res.ok) throw new Error(`status HTTP ${res.status}`)
  return res.json()
}
