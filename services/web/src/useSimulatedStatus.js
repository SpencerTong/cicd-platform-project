import { useState, useEffect } from 'react'

// Plays a scripted run that mirrors the REAL pipeline: same 8 stages, same order.
// Emits the SAME shape as the real useStatus hook ({stages, currentMessage, runUrl,
// timedOut-equivalent}) so the visualization components are reused unchanged.
//
// Honesty: the per-stage *realistic* durations (what a real run takes) are shown in
// the UI labels (Task 7), while playback is compressed by default so a visitor sees
// the whole loop in ~25s. `realTime` plays it at true pace.
export const STAGE_ORDER = ['commit', 'build', 'test', 'scan', 'push', 'cd', 'argocd', 'live']

// Realistic real-world seconds per stage (shown in labels; also the real-time pace).
export const REAL_SECONDS = {
  commit: 2, build: 90, test: 15, scan: 20, push: 25, cd: 10, argocd: 40, live: 0,
}

// Compressed playback: total run ~25s. Each stage gets a slice proportional-ish but
// floored so fast stages are still visible.
const COMPRESSED_MS = {
  commit: 1500, build: 5000, test: 2500, scan: 3000, push: 3500, cd: 2000, argocd: 5000, live: 0,
}

// trigger: a {message, runId} object. A new runId (incrementing) starts a fresh run.
// realTime: when true, use REAL_SECONDS*1000 instead of the compressed schedule.
export function useSimulatedStatus(trigger, realTime = false) {
  const [stages, setStages] = useState({})
  const [currentMessage, setCurrentMessage] = useState(null)

  useEffect(() => {
    if (!trigger) return
    let cancelled = false
    const timers = []

    // Reset to all-pending at the start of a run.
    const init = {}
    STAGE_ORDER.forEach(s => { init[s] = 'pending' })
    setStages(init)
    setCurrentMessage(null)

    const durationFor = (s) => realTime ? REAL_SECONDS[s] * 1000 : COMPRESSED_MS[s]

    let elapsed = 0
    STAGE_ORDER.forEach((stage, i) => {
      // mark running at the stage's start
      timers.push(setTimeout(() => {
        if (cancelled) return
        setStages(prev => ({ ...prev, [stage]: stage === 'live' ? 'done' : 'running' }))
      }, elapsed))

      elapsed += durationFor(stage)

      // mark done at the stage's end (live is terminal — handled above)
      if (stage !== 'live') {
        timers.push(setTimeout(() => {
          if (cancelled) return
          setStages(prev => ({ ...prev, [stage]: 'done' }))
          if (stage === 'argocd') setCurrentMessage(trigger.message)
        }, elapsed))
      }
    })

    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [trigger, realTime])

  // Shape matches the real hook's consumption in App: {status:{stages,currentMessage,runUrl}, timedOut}
  return { status: { stages, currentMessage, runUrl: null }, timedOut: false }
}
