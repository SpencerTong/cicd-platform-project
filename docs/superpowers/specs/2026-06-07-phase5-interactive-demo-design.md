# Phase 5 (Part 1) — Interactive GitOps Demo Design

**Date:** 2026-06-07
**Status:** Approved
**Scope:** An interactive demo where a user types a message, and it travels through the entire CI/CD + GitOps pipeline — visualized live with beginner-friendly explanations — until it appears in the running app.

This is the first sub-project of Phase 5. The README, `docs/architecture.md`, and the published blog post are separate sub-projects to be brainstormed afterward.

---

## Goal

Let a visitor type a short message in the web UI and watch it flow through the complete pipeline built in Phases 1–4: commit → CI build → test → Trivy scan → push image → CD tag bump → ArgoCD sync → live in the cluster. A horizontal animated pipeline shows each stage in real time, and a per-stage explainer panel teaches a beginner *what* each stage does and *why* it exists. When the loop completes (~8 minutes), the app displays the new message — proving the platform updated itself from a single user action.

---

## Architecture & Data Flow

```
1. User types a message in the web UI, clicks Deploy
2. Web POSTs to the API:  POST /api/deploy  { message, guardToken }
3. API validates the guard + message, then uses the GitHub REST API
   (fine-grained PAT from a k8s Secret) to commit the new message to
   services/api/src/main/resources/message.txt on main. Returns commit SHA.
4. The commit triggers ci-api.yml → build → test → Trivy scan → push image
5. cd.yml commits the new sha tag to helm/api/values.yaml
6. ArgoCD detects the change, syncs, rolls out the new API pod
7. The web UI polls GET /api/status every ~2s and animates the horizontal
   pipeline + per-stage explainer as each stage completes
8. When the new pod is live, GET /api/message returns the new text and the
   UI shows "✓ Live: <message>"
```

**Key principle:** the API is the single source of truth for status. It aggregates GitHub Actions run status (polled server-side, authenticated) + ArgoCD sync status (queried in-cluster) + its own currently-served message into one `/api/status` response. The browser only ever talks to the API — same single-origin pattern used since Phase 1.

**The self-redeploy quality:** the API commits a change that rebuilds and replaces the API itself. The pod that received the message is not the pod that ends up serving it. This "the app redeploys itself" property is the heart of the GitOps demo.

---

## API (Spring Boot) Changes — `services/api`

### New resource file
- `src/main/resources/message.txt` — holds the current message, baked into the JAR at build time. Committing a change here triggers a real image rebuild. Seed content: `Hello from the GitOps loop`.

### New / modified endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/message` | Reads `message.txt` from the classpath, returns `{ "message": "..." }`. The web UI displays this. |
| `POST /api/deploy` | Accepts `{ message, guardToken }`. Validates guard + message, commits `message.txt` via GitHub API, returns `{ "sha": "...", "runUrl": null }`. Returns `409` if a deploy is already in flight. |
| `GET /api/status?sha=<target>` | Aggregator. **Stateless** — derives all stage statuses from the target SHA passed by the frontend, not from in-memory state. Returns stage statuses, current live message, and the GitHub Actions run URL. Polled by the frontend. |
| `GET /health`, `GET /api/info` | Unchanged (from earlier phases). |

### `/api/status` response shape
```json
{
  "deployInFlight": true,
  "targetSha": "abc123",
  "stages": {
    "commit":   "done",
    "build":    "done",
    "test":     "done",
    "scan":     "running",
    "push":     "pending",
    "cd":       "pending",
    "argocd":   "pending",
    "live":     "pending"
  },
  "currentMessage": "the message the live pod is currently serving",
  "runUrl": "https://github.com/SpencerTong/cicd-platform-project/actions/runs/..."
}
```
Stage values: `pending` | `running` | `done` | `failed`.

### Statelessness (critical correctness point)
`/api/status` must NOT depend on in-memory state, because the API pod is **replaced mid-loop** — when ArgoCD rolls out the new image, the pod holding any in-memory deploy state is terminated. If status tracking relied on that state, it would break exactly when the loop finishes. Instead:
- The frontend remembers the target SHA (returned by `POST /api/deploy`) and passes it on every `GET /api/status?sha=<target>` call.
- The API derives every stage purely from external sources for that SHA. Any pod — old or new — answers identically.
- Stage derivation:
  - `commit`: the target SHA exists on main (always true once deploy returns).
  - `build` / `test` / `scan` / `push`: from the `ci-api.yml` workflow run's job/step states for that SHA (GitHub Actions API).
  - `cd`: the `cd.yml` run for that SHA completed (or `helm/api/values.yaml` now contains `sha-<target>`).
  - `argocd`: the rendered Deployment's image tag matches `sha-<target>` (optional ArgoCD API query for a richer "Synced" signal; degrades gracefully if the ArgoCD token is absent).
  - `live`: the currently-served message equals the message committed in the target SHA — i.e., the new pod is up and serving it.

### Internal components
- **`GitHubClient`** — wraps GitHub REST calls using Spring's built-in `RestClient` (no new dependency). Operations: (a) commit a file update to `message.txt` on main (read current file SHA, PUT new content); (b) list workflow runs for `ci-api.yml` / `cd.yml` filtered to the target commit SHA and read job/step conclusions.
- **`ArgoCdClient`** (optional) — queries the ArgoCD API in-cluster for the `api` Application's sync/health status to enrich the `argocd` stage. If `ARGOCD_TOKEN` is not configured, the `argocd` stage falls back to comparing the live Deployment image tag. The demo works either way.
- **`StatusService`** — given a target SHA, derives the eight stage statuses from GitHubClient (+ optional ArgoCdClient) + the locally-served message. Stateless: no instance fields tracking a deploy.
- **`DeployService`** — guard validation, message sanitization, and a best-effort in-flight lock for the `POST /api/deploy` call only (the commit returns quickly, before any pod swap, so an in-memory lock here is acceptable). Delegates to GitHubClient to commit.

### Configuration / Secrets
- `GITHUB_TOKEN` — fine-grained PAT, scoped to this repo only, `contents: write` + `actions: read`. Stored as a k8s Secret in `cicd`, injected as env var. (Required.)
- `ARGOCD_TOKEN` — ArgoCD API token (read-only account). k8s Secret, env var. (Optional — enriches the `argocd` stage; absent = fall back to comparing the Deployment image tag.)
- `DEPLOY_GUARD_TOKEN` — non-secret shared string the frontend sends. Config value.
- `GITHUB_REPO` — `SpencerTong/cicd-platform-project`. Config value.
- The Helm `api` chart gains a templated Secret reference + env vars (`deployment.yaml` / `values.yaml`).

---

## Frontend (React) Changes — `services/web/src`

The demo is a **new section on the existing page**, below the current info dashboard, so the whole story fits in one screenshot for the blog.

### Components
- **`DeployForm`** — input field + "Deploy" button. On submit, POSTs to `/api/deploy` with the message + guard token, receives the commit SHA, flips UI into tracking mode. Disabled while a deploy is in flight (handles the `409` case gracefully).
- **`PipelineFlow`** — the horizontal pipeline visualization (chosen layout). Eight nodes:
  `Commit → Build → Test → Scan → Push → Deploy (CD) → ArgoCD Sync → Live`.
  Node states: pending (hollow grey), running (pulsing blue), done (solid green ✓), failed (red ✗). Connectors fill green as the flow progresses. Driven by `/api/status`.
- **`StageExplainer`** — beginner-facing panel beneath the flow. As each stage activates, shows a plain-English card explaining what is happening and why it exists in a CI/CD pipeline (copy below). Doubles as blog raw material.
- **`useStatus`** — polling hook; remembers the target SHA from the deploy response and polls `GET /api/status?sha=<target>` every ~2s while a deploy is in flight; stops when `live` is `done`, on `failed`, or after a 12-minute timeout. Tolerant of transient errors (the API pod is briefly unavailable during the rollout) — it keeps retrying rather than giving up.

### Per-stage explainer copy (beginner-facing)
- **Commit** — "Your message was committed to Git. In GitOps, Git is the single source of truth — every change starts as a commit, which makes the whole history auditable and reversible."
- **Build** — "GitHub Actions is compiling the app and packaging it into a Docker image — a self-contained, frozen snapshot that runs identically everywhere."
- **Test** — "Automated tests run against the new code. If any fail, the pipeline stops here and nothing ships — this is how CI catches mistakes before they reach users."
- **Scan** — "Trivy inspects the built image for known vulnerabilities (CVEs) in its OS packages and libraries. Catching them now — before shipping — is called 'shift-left' security."
- **Push** — "The verified image is pushed to the container registry (GHCR), tagged with the exact commit SHA so we always know precisely what code is in it."
- **Deploy (CD)** — "The CD pipeline records the new image tag in the Helm chart's values and commits it back to Git. It doesn't touch the cluster directly — it just updates the desired state."
- **ArgoCD Sync** — "ArgoCD, running inside the cluster, notices Git changed and reconciles the cluster to match — pulling the new image and rolling out a new pod. No one ran a deploy command."
- **Live** — "The new pod is serving traffic. The message you typed traveled through the entire pipeline and is now live in the cluster — the platform updated itself."

### States
- **Idle:** form enabled, current live message shown.
- **Tracking:** form disabled, pipeline animating, explainer following the active stage.
- **Done:** all nodes green, "✓ Live: <message>" shown, form re-enabled.
- **Failed:** offending node red, explainer describes the failure (e.g., "Trivy found a HIGH severity CVE, so CI failed and the image was never shipped — exactly what should happen"), form re-enabled.
- **Timeout:** polling stops after 12 min with a graceful "taking longer than expected — check the Actions tab" message linking `runUrl`.

---

## Security Guard

Proportionate to a portfolio demo, explicitly not real auth:
1. **Shared guard token** — non-secret string baked into web config, sent with each deploy. API rejects requests without it. A casual bar against random POSTs; labeled as such in comments.
2. **One-deploy-at-a-time lock** — API tracks in-flight deploys; returns `409 Conflict` if one is running. Prevents stacked commits and keeps the visualization coherent.
3. **Message validation** — trim, cap at 100 chars, strip anything unsafe to write into a text file.

The powerful credential (GitHub PAT) never leaves the cluster; the browser only sends a message + guard token. Blog note: production would put real authentication in front of this.

---

## Sequencing (for the implementation plan)

1. API: `message.txt` + `GET /api/message` (+ test). Deploy via existing pipeline, verify it shows in the cluster.
2. API: `GitHubClient` + `POST /api/deploy` with guard, lock, validation (+ tests with a mocked GitHub API).
3. API: `StatusService` + stateless `GET /api/status?sha=` deriving stages from the GitHub Actions API + live-message comparison (+ tests). `ArgoCdClient` is an optional enrichment, added only if time permits.
4. Helm: add Secret refs + env vars to the `api` chart; create the k8s Secret(s) in the cluster (`GITHUB_TOKEN` required; `ARGOCD_TOKEN` optional).
5. Frontend: `DeployForm` + `useStatus` hook.
6. Frontend: `PipelineFlow` horizontal visualization.
7. Frontend: `StageExplainer` with the copy above.
8. End-to-end verification: type a message, watch the full loop, confirm it goes live.

---

## Definition of Done

- [ ] `GET /api/message` returns the current message from `message.txt`
- [ ] `POST /api/deploy` commits the message via GitHub API, guarded + locked + validated
- [ ] `GET /api/status?sha=` reports accurate stage status, derived statelessly (survives the API pod being replaced mid-loop)
- [ ] GitHub PAT stored as a k8s Secret, injected into the API pod (ArgoCD token optional)
- [ ] Web UI: type a message → horizontal pipeline animates through all 8 stages live
- [ ] Per-stage explainer shows beginner-friendly what/why text as each stage runs
- [ ] On completion the new message displays as "✓ Live"; failures and timeouts handled gracefully
- [ ] Full end-to-end run verified: typed message reaches the cluster and displays
