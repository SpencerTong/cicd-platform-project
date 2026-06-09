// Horizontal pipeline visualization. Eight nodes connected left-to-right;
// each reflects its stage state from /api/status. Connectors fill green as
// the flow progresses. Purely presentational — all state comes from props.
// Order matches the REAL pipeline's execution order: the unit tests run before
// the Docker image is built (you test the source, then package it), so "Test"
// sits before "Build" here. That keeps the dots lighting up strictly left-to-right.
const STAGES = [
  ['commit', 'Commit'],
  ['test',   'Test'],
  ['build',  'Build'],
  ['scan',   'Scan'],
  ['push',   'Push'],
  ['cd',     'Deploy'],
  ['argocd', 'ArgoCD'],
  ['live',   'Live'],
]

function symbol(state) {
  if (state === 'done') return '✓'
  if (state === 'failed') return '✗'
  if (state === 'running') return '●'
  return '○'
}

export default function PipelineFlow({ stages }) {
  return (
    <div className="flow">
      {STAGES.map(([key, label], i) => {
        const state = stages[key] || 'pending'
        return (
          <div className="flow-node-wrap" key={key}>
            {i > 0 && <div className={`flow-connector flow-${stages[STAGES[i - 1][0]] || 'pending'}`} />}
            <div className="flow-node-inner">
              <div className={`flow-node flow-${state}`}>{symbol(state)}</div>
              <div className="flow-label">{label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
