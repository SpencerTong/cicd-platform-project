import { useState, useEffect, useRef } from 'react'
import { getStatus } from './api'

// Polls GET /api/status?sha= every 2s while tracking a deploy.
// Stops when the 'live' stage is done, on a failed stage, or after a 12-min timeout.
// Tolerant of transient errors: the API pod is briefly unavailable during the
// ArgoCD rollout, so a failed poll is ignored and retried, not treated as fatal.
const POLL_MS = 2000
const TIMEOUT_MS = 12 * 60 * 1000

export function useStatus(sha) {
  const [status, setStatus] = useState(null)
  const [timedOut, setTimedOut] = useState(false)
  const startRef = useRef(null)

  useEffect(() => {
    if (!sha) return
    // Clear any previous run's final state immediately so a new deploy locks the
    // form right away (otherwise stale stages from the last run linger for one poll).
    setStatus(null)
    startRef.current = Date.now()
    setTimedOut(false)
    let active = true
    let timerId = null

    async function tick() {
      if (!active) return
      try {
        const s = await getStatus(sha)
        if (!active) return
        setStatus(s)
        const stages = s.stages || {}
        const done = stages.live === 'done'
        const failed = Object.values(stages).includes('failed')
        if (done || failed) return // stop polling
      } catch (e) {
        // transient (pod rolling) — ignore and keep polling
      }
      if (Date.now() - startRef.current > TIMEOUT_MS) {
        setTimedOut(true)
        return
      }
      timerId = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      active = false
      if (timerId) clearTimeout(timerId)
    }
  }, [sha])

  return { status, timedOut }
}
