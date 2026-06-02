# Phase 3 — Kubernetes + Helm Design

**Date:** 2026-06-02
**Status:** Approved
**Scope:** Install k3s via Rancher Desktop, write Helm charts for both services, deploy to the local cluster, and add a CD workflow that runs `helm upgrade` after a successful CI run.

---

## Goal

Get both services running in a real Kubernetes cluster on your laptop, accessible at local hostnames (`web.cicd.local`, `api.cicd.local`), deployed and managed via Helm. Add a `cd.yml` GitHub Actions workflow that automatically runs `helm upgrade` when CI succeeds on `main`. This is the last phase before ArgoCD takes over the deploy responsibility.

---

## Platform

- **OS:** macOS 14.7 arm64 (Apple Silicon)
- **Kubernetes:** k3s via Rancher Desktop (fresh install)
- **Ingress:** nginx ingress controller (replaces Rancher Desktop's default Traefik)

---

## Architecture

```
Browser → web.cicd.local ──┐
                           │  /etc/hosts: 127.0.0.1 → web.cicd.local api.cicd.local
curl → api.cicd.local ─────┘
                           ↓
              [Rancher Desktop — k3s cluster]
              ┌─────────────────────────────────────┐
              │  nginx Ingress Controller            │
              │  routes by hostname                  │
              │                                      │
              │  Namespace: cicd                     │
              │  ┌────────────────┐  ┌────────────┐ │
              │  │ Helm: web      │  │ Helm: api  │ │
              │  │ Deployment     │  │ Deployment │ │
              │  │ Service        │  │ Service    │ │
              │  │ Ingress        │  │ Ingress    │ │
              │  └────────────────┘  └────────────┘ │
              └─────────────────────────────────────┘
```

---

## File Structure

```
helm/
├── api/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       └── ingress.yaml
└── web/
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── deployment.yaml
        ├── service.yaml
        └── ingress.yaml
.github/
└── workflows/
    └── cd.yml
```

---

## Helm Charts

### Shared design principles

- One chart per service — independently deployable, independently versioned
- `image.tag` is the primary deploy-time variable — everything else is stable config
- All resources deployed into the `cicd` namespace
- Charts are deliberately minimal: Deployment + Service + Ingress only. No ConfigMaps, Secrets, HPA, or PodDisruptionBudgets — YAGNI for a learning project
- Every template and values field commented for blog post clarity

### API Chart (`helm/api/`)

**`values.yaml` key fields:**
```yaml
image:
  repository: ghcr.io/spencertong/cicd-platform-api
  tag: latest          # overridden by CD workflow with sha-<commit>
  pullPolicy: Always

service:
  port: 8080

ingress:
  host: api.cicd.local

replicaCount: 1
```

**Templates:**
- `deployment.yaml` — 1 replica, uses `image.repository:image.tag`, liveness probe at `GET /health`
- `service.yaml` — ClusterIP service on port 8080, named `api-svc`
- `ingress.yaml` — nginx ingress class, host `api.cicd.local` → `api-svc:8080`

### Web Chart (`helm/web/`)

**`values.yaml` key fields:**
```yaml
image:
  repository: ghcr.io/spencertong/cicd-platform-web
  tag: latest
  pullPolicy: Always

service:
  port: 80

ingress:
  host: web.cicd.local

apiServiceUrl: http://api-svc.cicd.svc.cluster.local:8080

replicaCount: 1
```

**Templates:**
- `deployment.yaml` — 1 replica, uses `image.repository:image.tag`
- `service.yaml` — ClusterIP service on port 80, named `web-svc`
- `ingress.yaml` — nginx ingress class, host `web.cicd.local` → `web-svc:80`

**nginx.conf update:** The web pod's nginx still proxies `/api/*` to the API service. The proxy target changes from `http://api:8080` (Docker Compose) to `http://api-svc.cicd.svc.cluster.local:8080` (Kubernetes DNS). A Helm template variable (`{{ .Values.apiServiceUrl }}`) is injected into a ConfigMap that overwrites the nginx proxy config, keeping the Kubernetes address out of the Docker image.

---

## Ingress Setup

### nginx Ingress Controller

Rancher Desktop ships with Traefik by default. We disable Traefik and install the nginx ingress controller instead:

```bash
# Disable Traefik in Rancher Desktop settings (UI toggle)
# Then install nginx ingress controller:
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

### `/etc/hosts`

One line added to `/etc/hosts` on the laptop:
```
127.0.0.1  web.cicd.local  api.cicd.local
```

This tells the OS to resolve both hostnames to localhost. Rancher Desktop's port forwarding passes traffic from localhost into the cluster's nginx ingress controller, which routes by hostname to the correct service.

---

## CD Workflow (`cd.yml`)

Triggers via `workflow_run` when either `CI — API` or `CI — Web` completes successfully on `main`. Runs `helm upgrade` with the image tag from the triggering CI run's commit SHA.

```yaml
on:
  workflow_run:
    workflows: ["CI — API", "CI — Web"]
    branches: [main]
    types: [completed]

condition: github.event.workflow_run.conclusion == 'success'
```

**Steps:**
1. Checkout
2. Install Helm
3. Configure `kubectl` using `KUBECONFIG` secret (stored in GitHub Actions secrets)
4. Determine which service to deploy from `github.event.workflow_run.name`
5. Run `helm upgrade --install <service> helm/<service>/ --namespace cicd --set image.tag=sha-<SHA>`

**Local cluster access from GitHub Actions:**
`KUBECONFIG` secret contains the kubeconfig exported from Rancher Desktop. To expose the local cluster's API endpoint to GitHub Actions runners, a tunnel tool (ngrok or Tailscale) is required. The implementation plan covers this explicitly. Note: Phase 4 (ArgoCD) eliminates this entirely — ArgoCD runs inside the cluster and polls GitHub, so the cluster never needs to be exposed.

---

## Sequencing

Work through these in order — manual first, automated after:

1. Install Rancher Desktop, verify `kubectl` works
2. Install nginx ingress controller, disable Traefik
3. Create `cicd` namespace
4. Write both Helm charts
5. Deploy manually: `helm install api helm/api/ -n cicd` and `helm install web helm/web/ -n cicd`
6. Add `/etc/hosts` entry, verify both services in browser
7. Write `cd.yml`, configure `KUBECONFIG` secret, set up tunnel
8. Verify end-to-end: push a change → CI succeeds → CD runs → cluster updates

---

## Commenting Standard

All Helm templates, `values.yaml` files, and `cd.yml` will be commented for blog post follow-along:
- Every template field explains what it does in Kubernetes and why
- `values.yaml` explains what each value controls and when you'd change it
- `cd.yml` explains `workflow_run` and how it differs from `workflow_dispatch`

---

## Definition of Done

- [ ] Rancher Desktop installed, `kubectl cluster-info` returns k3s cluster
- [ ] nginx ingress controller running in `ingress-nginx` namespace
- [ ] Both services deployed to `cicd` namespace via `helm install`
- [ ] `web.cicd.local` in browser shows dashboard with live API data
- [ ] `api.cicd.local/api/info` returns JSON response
- [ ] `cd.yml` triggers after CI succeeds and runs `helm upgrade` successfully
- [ ] A code push updates the cluster automatically (end-to-end CD loop)
