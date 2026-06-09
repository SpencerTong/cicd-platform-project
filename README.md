# CI/CD Platform

A complete CI/CD + GitOps platform built from scratch — to **understand** the modern
open-source stack, not just use it. Two intentionally-simple services are wired through
a full pipeline that builds, tests, scans, and deploys them to a local Kubernetes cluster
that updates itself from Git.

> The apps are not the point. The platform around them is: the pipelines, the containers,
> the cluster, and the GitOps loop.

---

## The GitOps loop

```
git push → GitHub Actions (build · test · Trivy scan) → push image to GHCR
        → CD bumps the image tag in the Helm chart → ArgoCD detects the change
        → ArgoCD syncs the cluster → the new version is live
```

No one runs a deploy command. ArgoCD, running inside the cluster, continuously reconciles
the cluster to match what's committed in Git.

---

## The stack

| Tool | Role here |
|---|---|
| **Docker** | Multi-stage builds package each service into a small production image |
| **GitHub Actions** | CI on every PR: build → test → Trivy scan → push to GHCR |
| **Trivy** | Fails the build on HIGH/CRITICAL CVEs (shift-left security) |
| **GHCR** | Image registry; every image tagged with the exact commit SHA |
| **k3s** (Rancher Desktop) | Lightweight local Kubernetes cluster |
| **Helm** | Templated charts for each service (Deployment, Service, Ingress) |
| **ArgoCD** | GitOps controller — watches the repo, syncs the cluster |

---

## Repo layout

```
services/api    Spring Boot API (Java 21, Maven) — /health, /api/info,
                and the interactive demo endpoints (/api/message, /api/deploy, /api/status)
services/web    React + Vite frontend — the presentation page & interactive pipeline demo
helm/api        Helm chart for the API
helm/web        Helm chart for the web app
argocd/applications   ArgoCD Application manifests
.github/workflows     ci-api.yml, ci-web.yml, cd.yml
docs/                 design specs, plans, and the blog post draft
```

---

## The interactive demo

The web app's presentation page includes a live demo: type a message and watch it travel
through the entire pipeline — build, test, scan, deploy, ArgoCD sync — until it goes live.

- **Run against the local cluster** → the message is committed via the GitHub API and the
  *real* pipeline runs end to end.
- **Run as a static build (no backend)** → it auto-detects no cluster and plays a faithful
  **simulated** walkthrough (same 8 stages, realistic durations), so it works anywhere —
  including a free static host. A badge always shows which mode you're in.

---

## Running it locally

**Both services with Docker Compose:**
```bash
docker compose up --build
# web → http://localhost:3000   api → http://localhost:8080
```

**Full platform on k3s (Rancher Desktop):**
```bash
# install the nginx ingress controller + create the namespace, then:
helm upgrade --install api helm/api/ -n cicd
helm upgrade --install web helm/web/ -n cicd
# with /etc/hosts → 127.0.0.1 web.cicd.local api.cicd.local
# web → http://web.cicd.local   api → http://api.cicd.local
```

**GitOps with ArgoCD:** install ArgoCD, apply `argocd/applications/`, and the cluster
syncs itself from `main` on every change.

---

## Build phases

1. **Docker Foundations** — both services containerized (multi-stage), images in GHCR
2. **GitHub Actions CI** — automated build/test/scan/push on every PR
3. **Kubernetes + Helm** — deployed to local k3s behind an nginx ingress
4. **ArgoCD + GitOps** — the cluster updates itself from Git; no manual deploys
5. **Polish** — the self-demonstrating presentation page, interactive demo, and this writeup

---

## A few things I learned

- **A test can break its own pipeline.** The interactive demo rewrites a file a test
  asserted on — so the first real use turned CI red. Lesson: test the *contract*, not content.
- **Encoded slashes break URLs.** A REST client percent-encoded the `/` in `owner/repo`
  to `%2F`, and every GitHub API call 404'd. Build URLs so separators stay literal.
- **GitOps is a mindset shift.** Once ArgoCD owns the cluster, you stop deploying and start
  *describing* the desired state in Git — the cluster converges to it on its own.

See `docs/` for the full design specs, implementation plans, and the blog post.
