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
        <DeployForm onSubmit={handleSubmit} disabled={tracking || mode === 'detecting'} />
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
