// Small badge that makes the current mode unmistakable — never misrepresent the
// simulation as a live cluster.
export default function ModeBadge({ mode }) {
  if (mode === 'detecting') return <span className="badge badge-detecting">connecting…</span>
  if (mode === 'real') return <span className="badge badge-live">● Live · connected to cluster</span>
  return <span className="badge badge-sim">● Simulated walkthrough</span>
}
