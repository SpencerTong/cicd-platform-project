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
