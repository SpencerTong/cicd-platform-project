// Beginner-facing explainer. Shows the currently-active stage's plain-English
// description: what is happening and why it exists in a CI/CD pipeline.
// The copy doubles as raw material for the blog post.
const COPY = {
  commit: ['Commit', 'Your message was committed to Git. In GitOps, Git is the single source of truth — every change starts as a commit, which makes the whole history auditable and reversible.'],
  build:  ['Build', 'GitHub Actions is compiling the app and packaging it into a Docker image — a self-contained, frozen snapshot that runs identically everywhere.'],
  test:   ['Test', 'Automated tests run against the new code. If any fail, the pipeline stops here and nothing ships — this is how CI catches mistakes before they reach users.'],
  scan:   ['Security Scan', 'Trivy inspects the built image for known vulnerabilities (CVEs) in its OS packages and libraries. Catching them now — before shipping — is called "shift-left" security.'],
  push:   ['Push', 'The verified image is pushed to the container registry (GHCR), tagged with the exact commit SHA so we always know precisely what code is in it.'],
  cd:     ['Deploy (CD)', "The CD pipeline records the new image tag in the Helm chart's values and commits it back to Git. It doesn't touch the cluster directly — it just updates the desired state."],
  argocd: ['ArgoCD Sync', 'ArgoCD, running inside the cluster, notices Git changed and reconciles the cluster to match — pulling the new image and rolling out a new pod. No one ran a deploy command.'],
  live:   ['Live', 'The new pod is serving traffic. The message you typed traveled through the entire pipeline and is now live in the cluster — the platform updated itself.'],
}

const ORDER = ['commit', 'build', 'test', 'scan', 'push', 'cd', 'argocd', 'live']

export default function StageExplainer({ stages, timedOut, runUrl }) {
  if (timedOut) {
    return (
      <div className="explainer">
        <div className="explainer-title">Taking longer than expected</div>
        <div className="explainer-body">
          The pipeline is still running. You can follow it on GitHub Actions.
        </div>
        {runUrl && <a className="explainer-link" href={runUrl} target="_blank" rel="noreferrer">View the run →</a>}
      </div>
    )
  }

  // Find a failed stage first; otherwise the running stage; otherwise the last done stage.
  const failed = ORDER.find(k => stages[k] === 'failed')
  const running = ORDER.find(k => stages[k] === 'running')
  const lastDone = [...ORDER].reverse().find(k => stages[k] === 'done')
  const activeKey = failed || running || lastDone || 'commit'
  const [title, body] = COPY[activeKey]

  return (
    <div className="explainer">
      <div className="explainer-title">
        {failed ? `${title} — failed` : title}
      </div>
      <div className="explainer-body">
        {failed
          ? 'This stage failed, so the pipeline stopped and nothing shipped — exactly what should happen when something is wrong. Check the run for details.'
          : body}
      </div>
      {runUrl && <a className="explainer-link" href={runUrl} target="_blank" rel="noreferrer">View on GitHub Actions →</a>}
    </div>
  )
}
