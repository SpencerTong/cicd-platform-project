// Beginner-facing explainer. Shows the currently-active stage's plain-English
// description: what is happening and why it exists in a CI/CD pipeline.
// The copy doubles as raw material for the blog post.
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
