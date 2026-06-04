# Phase 4 — ArgoCD + GitOps Design

**Date:** 2026-06-04
**Status:** Approved
**Scope:** Install ArgoCD in the k3s cluster, create Application manifests, update `cd.yml` to commit image tags instead of running helm upgrade, and verify the full GitOps loop.

---

## Goal

Replace the `helm upgrade` step in `cd.yml` with a git commit that updates `image.tag` in `values.yaml`. ArgoCD — running inside the cluster — detects the change and syncs the cluster automatically. This is the complete GitOps loop: Git is the single source of truth for what's deployed.

---

## Architecture

```
git push → CI builds image → CD commits tag to values.yaml
→ ArgoCD detects change in repo → ArgoCD syncs cluster → done
```

ArgoCD runs inside the `argocd` namespace in k3s. It polls the GitHub repo every 3 minutes. When it sees a change in `helm/api/` or `helm/web/`, it runs the equivalent of `helm upgrade` internally. Nothing in the cluster needs to be exposed externally — ArgoCD reaches out to GitHub, not the other way around.

---

## File Structure

```
argocd/
└── applications/
    ├── api.yaml     ← ArgoCD Application for the API service
    └── web.yaml     ← ArgoCD Application for the web service
.github/
└── workflows/
    └── cd.yml       ← Modified: commits tag instead of running helm upgrade
helm/
├── api/
│   └── values.yaml  ← image.tag updated by cd.yml on each deploy
└── web/
    └── values.yaml  ← image.tag updated by cd.yml on each deploy
```

---

## ArgoCD Installation

Install via the official ArgoCD Helm chart into an `argocd` namespace:

```bash
helm upgrade --install argocd argo-cd \
  --repo https://argoproj.github.io/argo-helm \
  --namespace argocd \
  --create-namespace \
  --set server.service.type=NodePort
```

Access the UI via port-forward:
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

UI available at `https://localhost:8080`. Default credentials: username `admin`, password retrieved with:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

---

## ArgoCD Application Manifests

### `argocd/applications/api.yaml`

An ArgoCD `Application` tells ArgoCD: "watch this path in this repo and keep this namespace in sync."

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/SpencerTong/cicd-platform-project
    targetRevision: main
    path: helm/api
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: cicd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### `argocd/applications/web.yaml`

Identical structure, pointing at `helm/web`.

**Key fields:**
- `source.path`: where the Helm chart lives in the repo
- `destination.namespace`: which namespace to deploy into (`cicd`)
- `syncPolicy.automated`: ArgoCD auto-syncs on change without manual approval
- `prune: true`: removes resources deleted from the chart
- `selfHeal: true`: reverts manual cluster changes back to what Git says

---

## Updated `cd.yml`

`cd.yml` changes from running `helm upgrade` to committing a tag update into `values.yaml`.

**Permission change:** `contents: write` (was `read`) — needed to push back to the repo.

**New Deploy step:**
```yaml
permissions:
  contents: write

- name: Update image tag in values.yaml
  run: |
    sed -i "s/tag:.*/tag: sha-${{ github.event.workflow_run.head_sha }}/" \
      helm/${{ steps.service.outputs.name }}/values.yaml
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add helm/${{ steps.service.outputs.name }}/values.yaml
    git commit -m "chore(gitops): deploy ${{ steps.service.outputs.name }} sha-${{ github.event.workflow_run.head_sha }}"
    git push
```

The `helm upgrade` step and `--create-namespace`/`--timeout` flags are removed entirely.

---

## Sequencing

1. Install ArgoCD via Helm
2. Write `argocd/applications/api.yaml` and `web.yaml`
3. Apply the Application manifests: `kubectl apply -f argocd/applications/`
4. Verify ArgoCD syncs the existing Helm charts (cluster already has the services running)
5. Update `cd.yml` — swap `helm upgrade` for the values.yaml commit
6. Push the updated `cd.yml` and verify the full loop: code push → CI → CD commits tag → ArgoCD detects → cluster updated

---

## Definition of Done

- [ ] ArgoCD installed and UI accessible at `https://localhost:8080`
- [ ] Both `Application` manifests applied — ArgoCD shows `api` and `web` as Synced
- [ ] `cd.yml` updated — deploy step commits tag, not helm upgrade
- [ ] A code push triggers the full loop: CI builds image → CD commits tag to `values.yaml` → ArgoCD syncs cluster within 3 minutes
- [ ] `kubectl describe deployment api -n cicd | grep Image` shows the new SHA
