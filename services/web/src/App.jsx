import { useState, useEffect } from 'react'
import './App.css'
import './demo.css'
import { getMessage } from './api'
import DeployForm from './DeployForm'
import PipelineFlow from './PipelineFlow'
import StageExplainer from './StageExplainer'
import { useStatus } from './useStatus'

export default function App() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [sha, setSha] = useState(null)
  const [submitted, setSubmitted] = useState('')
  const { status, timedOut } = useStatus(sha)

  useEffect(() => {
    fetch('/api/info')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(setInfo)
      .catch(err => setError(err.message))
  }, [])

  const stages = status?.stages || {}
  const liveMessage = status?.currentMessage
  const tracking = !!sha && stages.live !== 'done' && !Object.values(stages).includes('failed') && !timedOut

  return (
    <div className="container">
      <h1>CI/CD Platform</h1>
      <p className="subtitle">Live data from the Spring Boot API</p>

      {error && <p className="error">Could not reach the API: {error}</p>}
      {!info && !error && <p className="loading">Connecting to API...</p>}

      {info && (
        <div className="cards">
          <Card label="APP"     value={info.app} />
          <Card label="VERSION" value={info.version} />
          <Card label="JAVA"    value={info.java} />
          <Card label="STATUS"  value={info.status} highlight />
        </div>
      )}

      {/* ---- Interactive GitOps demo ---- */}
      <div className="demo">
        <h2>Try the GitOps loop</h2>
        <p className="subtitle">
          Type a message and watch it travel through the entire pipeline — build, test,
          scan, deploy, and sync — until it goes live in the cluster.
        </p>
        <DeployForm onDeployed={(s, msg) => { setSha(s); setSubmitted(msg) }} disabled={tracking} />
        {tracking && submitted && <p className="demo-pending">Deploying: "{submitted}"</p>}
        {sha && <PipelineFlow stages={stages} />}
        {sha && <StageExplainer stages={stages} timedOut={timedOut} runUrl={status?.runUrl} />}
        {sha && stages.live === 'done' && (
          <p className="demo-live">✓ Live: "{liveMessage}"</p>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, highlight }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${highlight ? ' card-value--up' : ''}`}>{value}</div>
    </div>
  )
}
