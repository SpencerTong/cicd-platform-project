# I had CI/CD experience from enterprise Jenkins — so I built a platform from scratch to actually understand the modern stack

*Draft — for spencertong.vercel.app*

## The gap

At work I'd "done CI/CD." I'd edited Jenkinsfiles, triggered OpenShift deploys, leaned on
shared libraries someone else wrote. But if you'd asked me to explain what actually happens
between `git push` and "it's live" — the registry, the image tags, how the cluster decides
to pull a new version — I'd have hand-waved. Enterprise tooling is great at hiding the
fundamentals behind a platform team.

So I built my own platform, end to end, with the modern open-source stack: GitHub Actions,
Docker, GHCR, k3s, Helm, Trivy, and ArgoCD. The two apps inside it are deliberately trivial —
the point was everything *around* them.

## The architecture

The whole thing is one loop:

```
git push → GitHub Actions (build · test · scan) → push image to GHCR
        → CD bumps the image tag in Helm → ArgoCD syncs the cluster → live
```

The mental unlock was realizing those are two different jobs. **CI** proves a change is good
and produces an artifact (a scanned, tagged container image). **CD**, in the GitOps model,
doesn't deploy anything — it just records the desired state in Git. A separate controller
living *inside* the cluster (ArgoCD) notices Git changed and reconciles reality to match.

## Phase by phase, one insight each

- **Docker.** Multi-stage builds finally clicked: the heavyweight stage compiles, the slim
  stage ships. The image that runs in production has no build tools in it — and it's the
  *same* image that passed CI. That's the whole "works on my machine" problem, solved.
- **GitHub Actions.** The pipeline caught a real Tomcat CVE via Trivy before anything shipped.
  Shift-left security stopped being a buzzword and became "the build went red and I was glad."
- **Helm + k3s.** Helm's value isn't templating for its own sake — it's that the image tag
  becomes a single swappable value. That one indirection is what makes GitOps possible.
- **ArgoCD.** The moment it clicked: I merged a commit, did nothing else, and watched the
  cluster roll a new pod on its own. I never ran `kubectl apply`. Git was the only thing I touched.

## The demo that broke (correctly)

To make the project show itself off, I built an interactive demo: type a message in the web
UI, and it commits to the repo, runs the full pipeline, and the message appears in the running
app — the platform updating itself from a single click.

The first real run turned CI red. The reason was perfect: a unit test asserted the exact
message text, but the demo's whole job is to *change* that text. The test was asserting on
data the system is designed to mutate. The fix — assert the contract (a non-empty message),
not the content — is a lesson I'll keep. The pipeline did exactly what a pipeline should:
it refused to ship a change that broke a test.

(There was also a genuinely sneaky bug: a REST client percent-encoded the `/` in `owner/repo`
to `%2F`, so every GitHub API call 404'd. Build your URLs so the separators stay literal.)

## What's next

The cluster is local — it lives in Rancher Desktop on my laptop. The simulated version of the
demo needs no backend, so it can be a static public site; making the *real* thing public means
hosting the cluster in the cloud (a natural next project). And I've got CKA prep on the list,
which this gave me a real, hands-on foundation for.

The difference between "I've touched pipelines" and "I understand pipelines" turned out to be
about four weekends and a lot of small, honest failures. Worth it.
