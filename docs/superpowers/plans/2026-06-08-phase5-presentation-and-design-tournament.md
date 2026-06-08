# Phase 5 (Part 2) — Presentation Page, Simulated Demo & Design Tournament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `services/web` a self-demonstrating, publicly-hostable presentation of the platform: a dual-mode (auto-detected real/simulated) interactive demo, a 7-section teaching page, thorough explanations, an SVG architecture diagram, and a chosen visual design from a 3-direction tournament.

**Architecture:** A `useMode()` hook pings `/api/info` once to pick real vs simulated. Both `useStatus` (real) and a new `useSimulatedStatus` (scripted) are always called (rules of hooks) and the page uses whichever matches the mode — both emit the same `{stages, currentMessage, runUrl}` shape, so the existing prop-driven `PipelineFlow`/`StageExplainer` are reused unchanged. The simulated build needs no backend, so `npm run build` is a static public site.

**Tech Stack:** React 18, Vite, plain CSS, hand-built SVG. No backend changes.

---

## File Map

```
services/web/src/
├── useMode.js            ← Task 1 (real/simulated detection)
├── useSimulatedStatus.js ← Task 2 (scripted pipeline engine)
├── DeployForm.jsx        ← Task 3 (mode-agnostic: calls injected onSubmit)
├── App.jsx               ← Task 3 (wire modes), Task 4 (page sections)
├── content.js            ← Task 4 (stack-card + lessons copy), Task 5 (stage copy source)
├── StageExplainer.jsx    ← Task 5 (depth pass on copy)
├── StackCards.jsx        ← Task 4 (the "stack, explained" section)
├── ModeBadge.jsx         ← Task 3 (Simulated / Live badge)
├── ArchitectureDiagram.jsx ← Task 8 (SVG diagram)
├── demo.css              ← existing; extended in Task 7 (winning design)
└── page.css              ← Task 4 (page section layout), restyled in Task 7
```

---

## Task 1: useMode — real vs simulated detection

**Files:**
- Create: `services/web/src/useMode.js`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git pull origin main
git checkout -b phase/5-presentation
```

- [ ] **Step 2: Create `services/web/src/useMode.js`**

```js
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
```

- [ ] **Step 3: Build to verify it compiles**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/useMode.js
git commit -m "feat(web): add useMode hook to detect real vs simulated backend"
```

---

## Task 2: useSimulatedStatus — scripted pipeline engine

**Files:**
- Create: `services/web/src/useSimulatedStatus.js`

- [ ] **Step 1: Create `services/web/src/useSimulatedStatus.js`**

```js
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
```

- [ ] **Step 2: Build to verify**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/useSimulatedStatus.js
git commit -m "feat(web): add scripted simulated pipeline status engine"
```

---

## Task 3: Wire dual-mode into App + mode-agnostic DeployForm + ModeBadge

**Files:**
- Create: `services/web/src/ModeBadge.jsx`
- Modify: `services/web/src/DeployForm.jsx`
- Modify: `services/web/src/App.jsx`

- [ ] **Step 1: Create `services/web/src/ModeBadge.jsx`**

```jsx
// Small badge that makes the current mode unmistakable — never misrepresent the
// simulation as a live cluster.
export default function ModeBadge({ mode }) {
  if (mode === 'detecting') return <span className="badge badge-detecting">connecting…</span>
  if (mode === 'real') return <span className="badge badge-live">● Live · connected to cluster</span>
  return <span className="badge badge-sim">● Simulated walkthrough</span>
}
```

- [ ] **Step 2: Make `DeployForm` mode-agnostic — it calls an injected `onSubmit(message)`**

Replace `services/web/src/DeployForm.jsx` with:
```jsx
import { useState } from 'react'

// Input + Deploy button. Mode-agnostic: it calls the injected onSubmit(message),
// which App wires to either the real API deploy or the local simulation. The form
// itself never knows which mode it's in.
export default function DeployForm({ onSubmit, disabled }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(message.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="deploy-form" onSubmit={handleSubmit}>
      <input
        className="deploy-input"
        type="text"
        aria-label="Deployment message"
        maxLength={100}
        placeholder="Type a message to deploy through the pipeline…"
        value={message}
        onChange={e => setMessage(e.target.value)}
        disabled={disabled || submitting}
      />
      <button className="deploy-button" type="submit" disabled={disabled || submitting || !message.trim()}>
        {submitting ? 'Working…' : 'Deploy'}
      </button>
      {error && <p className="deploy-error">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Rewrite `App.jsx` to wire both modes (respecting rules of hooks)**

Replace `services/web/src/App.jsx` with:
```jsx
import { useState } from 'react'
import './App.css'
import './demo.css'
import './page.css'
import { deploy } from './api'
import { useMode } from './useMode'
import { useStatus } from './useStatus'
import { useSimulatedStatus } from './useSimulatedStatus'
import DeployForm from './DeployForm'
import PipelineFlow from './PipelineFlow'
import StageExplainer from './StageExplainer'
import ModeBadge from './ModeBadge'
import StackCards from './StackCards'
import ArchitectureDiagram from './ArchitectureDiagram'

export default function App() {
  const mode = useMode()

  // Real-mode state
  const [realSha, setRealSha] = useState(null)
  // Simulated-mode state
  const [simTrigger, setSimTrigger] = useState(null)
  const [realTime, setRealTime] = useState(false)
  // Shared
  const [submitted, setSubmitted] = useState('')

  // Rules of hooks: BOTH hooks are always called. Each no-ops until its input is set.
  const real = useStatus(realSha)
  const sim = useSimulatedStatus(simTrigger, realTime)

  const active = mode === 'real' ? real : sim
  const stages = active.status?.stages || {}
  const liveMessage = active.status?.currentMessage
  const timedOut = active.timedOut
  const runUrl = active.status?.runUrl
  const started = mode === 'real' ? !!realSha : !!simTrigger
  const tracking = started && stages.live !== 'done'
    && !Object.values(stages).includes('failed') && !timedOut

  async function handleSubmit(message) {
    setSubmitted(message)
    if (mode === 'real') {
      const { sha } = await deploy(message)   // real commit via API
      setRealSha(sha)
    } else {
      setSimTrigger({ message, runId: Date.now() })  // start a fresh simulation
    }
  }

  return (
    <div className="page">
      {/* 1. Hero */}
      <header className="hero">
        <ModeBadge mode={mode} />
        <h1>CI/CD Platform</h1>
        <p className="hero-thesis">
          A complete CI/CD + GitOps platform built from scratch — to understand the
          modern open-source stack, not just use it.
        </p>
        <a className="hero-cta" href="#demo">See it run ↓</a>
      </header>

      {/* 2. Why this exists */}
      <section className="why">
        <h2>Why this exists</h2>
        <p>
          There's a gap between "I've touched pipelines" and "I understand pipelines."
          This project closes it: every layer — containers, CI, the cluster, the GitOps
          loop — built and wired by hand, then made to demonstrate itself.
        </p>
      </section>

      {/* 3. Architecture diagram */}
      <section className="architecture">
        <h2>How it fits together</h2>
        <ArchitectureDiagram />
      </section>

      {/* 4. Interactive demo */}
      <section className="demo" id="demo">
        <h2>Try the GitOps loop</h2>
        <p className="subtitle">
          Type a message and watch it travel through the entire pipeline — build, test,
          scan, deploy, and sync — until it goes live.
        </p>
        {mode === 'simulated' && (
          <label className="realtime-toggle">
            <input type="checkbox" checked={realTime} onChange={e => setRealTime(e.target.checked)} />
            Play at real-world speed (~3 min) instead of compressed
          </label>
        )}
        <DeployForm onSubmit={handleSubmit} disabled={tracking} />
        {tracking && submitted && <p className="demo-pending">Deploying: "{submitted}"</p>}
        {started && <PipelineFlow stages={stages} />}
        {started && <StageExplainer stages={stages} timedOut={timedOut} runUrl={runUrl} />}
        {started && stages.live === 'done' && (
          <p className="demo-live">✓ Live: "{liveMessage}"</p>
        )}
      </section>

      {/* 5. The stack, explained */}
      <section className="stack">
        <h2>The stack, explained</h2>
        <StackCards />
      </section>

      {/* 6. What I learned */}
      <section className="lessons">
        <h2>What I learned building it</h2>
        <ul>
          <li><strong>A test can break its own pipeline.</strong> The demo rewrites a file the
            test asserted on — so the first real use turned CI red. Test the contract, not content.</li>
          <li><strong>Encoded slashes break URLs.</strong> A REST client percent-encoded the
            <code>/</code> in <code>owner/repo</code> to <code>%2F</code> → every GitHub call 404'd.</li>
          <li><strong>GitOps means Git is the source of truth.</strong> No tool deploys directly;
            ArgoCD reconciles the cluster to match what's committed.</li>
        </ul>
      </section>

      <footer className="footer">
        <a href="https://github.com/SpencerTong/cicd-platform-project" target="_blank" rel="noreferrer">Repo</a>
        <span> · </span>
        <a href="https://spencertong.vercel.app" target="_blank" rel="noreferrer">Blog</a>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Create a temporary `StackCards`/`ArchitectureDiagram` stub + `page.css` stub so it builds (filled in Tasks 4 & 8)**

```bash
cd services/web
printf "export default function StackCards(){return null}\n" > src/StackCards.jsx
printf "export default function ArchitectureDiagram(){return null}\n" > src/ArchitectureDiagram.jsx
printf "/* page layout styles added in Task 4/7 */\n" > src/page.css
```

- [ ] **Step 5: Build to verify the whole app compiles**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add services/web/src/App.jsx services/web/src/DeployForm.jsx \
        services/web/src/ModeBadge.jsx services/web/src/StackCards.jsx \
        services/web/src/ArchitectureDiagram.jsx services/web/src/page.css
git commit -m "feat(web): wire dual-mode (real/simulated) demo with mode badge"
```

---

## Task 4: StackCards content + page section copy

**Files:**
- Create: `services/web/src/content.js`
- Modify: `services/web/src/StackCards.jsx`

- [ ] **Step 1: Create `services/web/src/content.js`**

```js
// Beginner-readable copy for the "stack, explained" cards. One entry per tool:
// what it is, the one job it does here, and why it matters. No assumed knowledge.
export const STACK = [
  { name: 'Docker', what: 'Packages an app and everything it needs into a portable image.',
    job: 'Builds the API and web images so they run identically everywhere.',
    why: 'Eliminates "works on my machine" — the same image runs in CI and in the cluster.' },
  { name: 'GitHub Actions', what: 'Runs automated workflows when you push code.',
    job: 'Builds, tests, and scans each image on every change, then pushes it.',
    why: 'Catches problems automatically before anything ships — continuous integration.' },
  { name: 'Trivy', what: 'Scans container images for known security vulnerabilities.',
    job: 'Fails the pipeline if the image has HIGH/CRITICAL CVEs.',
    why: 'Finds security issues early, in the pipeline, not in production ("shift-left").' },
  { name: 'GHCR', what: "GitHub's container registry — storage for built images.",
    job: 'Holds every image, tagged with the exact commit it was built from.',
    why: 'A traceable, versioned home for images the cluster pulls from.' },
  { name: 'Helm', what: 'A package manager for Kubernetes — templated manifests.',
    job: 'Defines the API and web deployments as charts with a swappable image tag.',
    why: 'One source of truth for how each service is deployed, configurable per environment.' },
  { name: 'k3s', what: 'A lightweight Kubernetes distribution.',
    job: 'Runs the cluster locally that actually hosts the services.',
    why: 'Real Kubernetes on a laptop — no cloud bill — to learn the real mechanics.' },
  { name: 'ArgoCD', what: 'A GitOps controller that lives inside the cluster.',
    job: 'Watches the repo and reconciles the cluster to match what Git says.',
    why: 'Deployments become declarative: change Git, the cluster follows. No manual deploys.' },
]
```

- [ ] **Step 2: Replace `services/web/src/StackCards.jsx`**

```jsx
import { STACK } from './content'

// The "stack, explained" section — one card per tool, beginner-readable.
export default function StackCards() {
  return (
    <div className="stack-grid">
      {STACK.map(tool => (
        <div className="stack-card" key={tool.name}>
          <h3 className="stack-name">{tool.name}</h3>
          <p className="stack-what">{tool.what}</p>
          <p className="stack-job"><span className="stack-label">Here:</span> {tool.job}</p>
          <p className="stack-why"><span className="stack-label">Why:</span> {tool.why}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Build to verify**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/content.js services/web/src/StackCards.jsx
git commit -m "feat(web): add per-tool stack explanations"
```

---

## Task 5: Deepen the per-stage explainer copy

**Files:**
- Modify: `services/web/src/StageExplainer.jsx`

- [ ] **Step 1: Update the `COPY` map in `services/web/src/StageExplainer.jsx`**

Replace the existing `COPY` object with this deeper version (adds the "if it fails" angle to each; keep the rest of the file — `ORDER`, the component, the timeout/failed logic — exactly as it is):
```jsx
const COPY = {
  commit: ['Commit', 'Your message was committed to Git. In GitOps, Git is the single source of truth — every change starts here, which makes the whole history auditable and reversible. If a commit is bad, you revert it like any other.'],
  build:  ['Build', 'GitHub Actions compiles the app and packages it into a Docker image — a frozen, self-contained snapshot that runs identically everywhere. If the build fails (bad code, missing dependency), the pipeline stops and nothing downstream runs.'],
  test:   ['Test', 'Automated tests run against the new code. If any test fails, the pipeline halts here and nothing ships — this is how continuous integration catches mistakes before they ever reach users.'],
  scan:   ['Security Scan', 'Trivy inspects the built image for known vulnerabilities (CVEs) in its OS packages and libraries. If it finds a HIGH or CRITICAL issue, the build fails and the image is never pushed — catching security problems early is called "shift-left" security.'],
  push:   ['Push', 'The verified image is pushed to the registry (GHCR), tagged with the exact commit SHA. If this step is reached, the image has passed tests and the scan — the tag means we always know precisely what code is inside.'],
  cd:     ['Deploy (CD)', "The CD pipeline records the new image tag in the Helm chart's values and commits it back to Git. It doesn't touch the cluster directly — it only updates the desired state. The actual deploy is ArgoCD's job."],
  argocd: ['ArgoCD Sync', 'ArgoCD, running inside the cluster, notices Git changed and reconciles the cluster to match — pulling the new image and rolling out a new pod. Nobody ran a deploy command; the cluster converges to what Git says.'],
  live:   ['Live', 'The new pod is serving traffic. The message you typed traveled through the entire pipeline and is now live — the platform updated itself from a single commit.'],
}
```

- [ ] **Step 2: Build to verify**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/StageExplainer.jsx
git commit -m "feat(web): deepen per-stage explainer copy with failure framing"
```

---

## Task 6: Design tournament (interactive checkpoint)

**This task is interactive — it is run by the controller (me) with the user, not a subagent.** No code is committed in this task; its output is a chosen design direction that Task 7 implements.

- [ ] **Step 1: Generate 3 full-page HTML mockups in the visual companion**

Three directions, each covering the full page (hero → diagram → demo → stack cards → lessons), using the real copy from Tasks 4–5:
- Direction 1 — "Clean docs": light, whitespace, restrained palette, readability-first.
- Direction 2 — "Terminal / ops": dark, monospace accents, DevOps aesthetic.
- Direction 3 — "Bold modern landing": strong hero, gradients, large type.

- [ ] **Step 2: User picks a winner or names elements to mix**

Record the decision (chosen direction + any mixed elements) explicitly before proceeding.

- [ ] **Step 3: Write the decision into the spec doc as an addendum** so the styling task has a concrete target.

```bash
# (append the chosen direction + notes to the spec, then:)
git add docs/superpowers/specs/2026-06-08-phase5-presentation-and-design-tournament-design.md
git commit -m "docs(global): record chosen design direction from tournament"
```

---

## Task 7: Implement the winning design (CSS)

**Files:**
- Modify: `services/web/src/page.css`
- Modify: `services/web/src/demo.css`
- Modify: `services/web/src/App.css` (base/reset only if needed)

> The exact CSS is authored against the winning mockup chosen in Task 6, so it is produced at execution time, not pre-written here. The deliverable and acceptance criteria are fixed:

- [ ] **Step 1: Implement the chosen visual direction** across `page.css` (the 7 sections: hero, why, architecture, demo, stack grid, lessons, footer) and extend `demo.css` (pipeline + explainer + badge + realtime toggle) to match. Style the `.badge-live` / `.badge-sim` / `.badge-detecting` states distinctly.

- [ ] **Step 2: Build and visually verify in both modes**

```bash
cd services/web && npm run build && npm run preview
```
Open the preview URL. With no backend it must show **simulated** mode; clicking Deploy plays the scripted pipeline through all 8 stages to "✓ Live". Confirm the page is responsive and all 7 sections render in the chosen style.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/page.css services/web/src/demo.css services/web/src/App.css
git commit -m "feat(web): implement chosen presentation design"
```

---

## Task 8: Architecture diagram (SVG)

**Files:**
- Modify: `services/web/src/ArchitectureDiagram.jsx`

- [ ] **Step 1: Implement the SVG** in `ArchitectureDiagram.jsx` — a hand-built, themeable SVG showing the GitOps loop as labeled, connected nodes:
  `git push → GitHub Actions (build · test · scan) → GHCR → CD bumps Helm values → ArgoCD → k3s cluster → live`, with labeled flow arrows. Colors use the winning design's palette (CSS variables or inline matching Task 7). Must scale cleanly (viewBox, no fixed pixel raster).

- [ ] **Step 2: Build and verify the diagram renders in the architecture section**

```bash
cd services/web && npm run build && npm run preview
```
Confirm the diagram appears under "How it fits together" and is legible.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/ArchitectureDiagram.jsx
git commit -m "feat(web): add SVG architecture diagram of the GitOps loop"
```

---

## Task 9: Verify static build + open PR

- [ ] **Step 1: Produce the static build and confirm it works with no backend**

```bash
cd services/web && npm run build && npm run preview
```
In the browser (no backend running): badge shows **Simulated**, the full page renders, and the demo runs the scripted loop end-to-end to "✓ Live". This static `dist/` is the public artifact.

- [ ] **Step 2: Confirm real mode still works (optional, if cluster up)**

If Rancher Desktop + the cluster are running, the dev server proxy (or the deployed app) should detect **real** mode and a Deploy should commit for real. (Skip if the cluster isn't running; simulated mode is the public path.)

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin phase/5-presentation
gh pr create --title "feat: Phase 5 — presentation page, simulated demo & chosen design" \
  --base main --head phase/5-presentation \
  --body "Dual-mode (auto-detected real/simulated) interactive demo, 7-section teaching page, per-tool + per-stage explanations, SVG architecture diagram, and the chosen tournament design. The simulated build is a static public site needing no backend."
```

- [ ] **Step 4: Merge after CI passes**

`CI — Web` runs (services/web changed). Confirm green, merge. (ArgoCD will roll the new web image to the local cluster; the static public build is deployed separately to a free host — a manual step outside this plan.)

---

## Definition of Done

- [ ] `useMode()` auto-detects real vs simulated on load (1.5s probe, falls back to simulated)
- [ ] Simulated mode: Deploy runs the scripted 8-stage timeline (compressed default + real-time toggle), no backend needed
- [ ] Real mode unchanged: Deploy commits and polls real status against the cluster
- [ ] Mode badge clearly distinguishes Simulated vs Live
- [ ] All 7 page sections render with beginner-readable copy
- [ ] Per-stage explainer has what/why/on-failure depth; per-tool cards have what/job/why
- [ ] Chosen tournament design implemented; SVG architecture diagram embedded
- [ ] `npm run build` static site runs fully in simulated mode with no backend (the public link)
```
