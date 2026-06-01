import { useState, useEffect } from 'react'
import './App.css'

export default function App() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch build metadata from the Spring Boot API.
    // In development: Vite proxies this to localhost:8080 (vite.config.js).
    // In Docker/production: nginx proxies this to the api container (nginx.conf).
    fetch('/api/info')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setInfo)
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="container">
        <p className="error">Could not reach the API: {error}</p>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="container">
        <p className="loading">Connecting to API...</p>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>CI/CD Platform</h1>
      <p className="subtitle">Live data from the Spring Boot API</p>
      <div className="cards">
        <Card label="APP"     value={info.app} />
        <Card label="VERSION" value={info.version} />
        <Card label="JAVA"    value={info.java} />
        <Card label="STATUS"  value={info.status} highlight />
      </div>
    </div>
  )
}

function Card({ label, value, highlight }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${highlight ? ' card-value--up' : ''}`}>
        {value}
      </div>
    </div>
  )
}
