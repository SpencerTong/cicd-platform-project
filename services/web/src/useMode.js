import { useState, useEffect } from 'react'

// Detects, once on load, whether a real backend is present.
//   - 'detecting' : initial, before the probe resolves
//   - 'real'      : GET /api/info answered → live cluster behind us
//   - 'simulated' : no backend (e.g. the static public build) → scripted demo
//
// A short timeout keeps the page snappy: if /api/info doesn't answer fast,
// we assume there's no backend and fall back to the simulated walkthrough.
const PROBE_TIMEOUT_MS = 1500

export function useMode() {
  const [mode, setMode] = useState('detecting')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

    fetch('/api/info', { signal: controller.signal })
      .then(res => setMode(res.ok ? 'real' : 'simulated'))
      .catch(() => setMode('simulated'))
      .finally(() => clearTimeout(timer))

    return () => { clearTimeout(timer); controller.abort() }
  }, [])

  return mode
}
