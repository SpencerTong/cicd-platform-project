import { useState } from 'react'
import { deploy } from './api'

// Input + Deploy button. On submit, POSTs the message, gets the commit sha,
// and hands it up to the parent (App) which starts tracking the pipeline.
export default function DeployForm({ onDeployed, disabled }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { sha } = await deploy(message.trim())
      onDeployed(sha, message.trim())
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
        maxLength={100}
        placeholder="Type a message to deploy through the pipeline…"
        value={message}
        onChange={e => setMessage(e.target.value)}
        disabled={disabled || submitting}
      />
      <button className="deploy-button" type="submit" disabled={disabled || submitting || !message.trim()}>
        {submitting ? 'Committing…' : 'Deploy'}
      </button>
      {error && <p className="deploy-error">{error}</p>}
    </form>
  )
}
