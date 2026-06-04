# Phase 4 — ArgoCD + GitOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install ArgoCD in the k3s cluster, create Application manifests pointing at the existing Helm charts, update `cd.yml` to commit image tags instead of running helm upgrade, and verify the full GitOps loop end-to-end.

**Architecture:** ArgoCD runs inside the `argocd` namespace and polls GitHub for changes to `helm/api/` and `helm/web/`. When `cd.yml` commits a new `image.tag` to `values.yaml`, ArgoCD detects the change within 3 minutes and syncs the cluster. Nothing in the cluster needs to be exposed externally.

**Tech Stack:** ArgoCD (argo-helm chart), kubectl, Helm 3, GitHub Actions (cd.yml update)

---

## File Map

```
argocd/
└── applications/
    ├── api.yaml                        ← Task 2
    └── web.yaml                        ← Task 2
.github/
└── workflows/
    └── cd.yml                          ← Task 4 (modify existing)
```

---

## Task 1: Install ArgoCD

**⚠️ Requires cluster running** — ensure Rancher Desktop is open and `kubectl cluster-info` returns the k3s endpoint before starting.

- [ ] **Step 1: Create feature branch**

```bash
git checkout main && git pull origin main
git checkout -b phase/4-argocd-gitops
```

- [ ] **Step 2: Install ArgoCD via Helm**

```bash
helm upgrade --install argocd argo-cd \
  --repo https://argoproj.github.io/argo-helm \
  --namespace argocd \
  --create-namespace \
  --set server.service.type=NodePort \
  --wait
```

Expected final line: `STATUS: deployed`

This takes 2–3 minutes on first run while images are pulled.

- [ ] **Step 3: Verify all ArgoCD pods are running**

```bash
kubectl get pods -n argocd
```

Expected: several pods all with status `Running`. Key ones to confirm:
```
argocd-server-...           1/1     Running
argocd-repo-server-...      1/1     Running
argocd-application-controller-...  1/1     Running
```

- [ ] **Step 4: Get the initial admin password**

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

Copy this password — you'll need it to log into the UI.

- [ ] **Step 5: Port-forward to access the ArgoCD UI**

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Leave this running in a separate terminal.

- [ ] **Step 6: Verify UI is accessible**

Open `https://localhost:8080` in your browser (accept the self-signed cert warning). Log in with username `admin` and the password from Step 4. You should see an empty ArgoCD dashboard.

- [ ] **Step 7: Commit**

```bash
git commit --allow-empty -m "chore(gitops): ArgoCD installed in argocd namespace"
```

---

## Task 2: Write ArgoCD Application manifests

**Files:**
- Create: `argocd/applications/api.yaml`
- Create: `argocd/applications/web.yaml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p argocd/applications
```

- [ ] **Step 2: Create `argocd/applications/api.yaml`**

```yaml
# ArgoCD Application manifest for the Spring Boot API service.
#
# An Application tells ArgoCD:
#   - WHERE to find the desired state (this repo, helm/api/ path)
#   - WHERE to deploy it (the cicd namespace in this cluster)
#   - HOW to sync (automatically, with pruning and self-healing)
#
# When cd.yml commits a new image.tag to helm/api/values.yaml,
# ArgoCD detects the change and runs helm upgrade automatically.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api
  # Applications must live in the argocd namespace.
  namespace: argocd
spec:
  # 'default' is the built-in ArgoCD project that allows deploying to any namespace.
  project: default

  source:
    # The GitHub repo ArgoCD watches for changes.
    repoURL: https://github.com/SpencerTong/cicd-platform-project
    # The branch to watch. ArgoCD polls this branch for changes.
    targetRevision: main
    # The path within the repo that contains the Helm chart.
    path: helm/api
    helm:
      # Which values file to use. ArgoCD reads this file and deploys
      # whatever image.tag is set in it — updated by cd.yml on each CI run.
      valueFiles:
        - values.yaml

  destination:
    # Deploy to this cluster (kubernetes.default.svc means the local cluster
    # ArgoCD is running in — no external cluster URL needed).
    server: https://kubernetes.default.svc
    # Deploy into the cicd namespace where the services already live.
    namespace: cicd

  syncPolicy:
    automated:
      # prune: true — delete resources that exist in the cluster but not in Git.
      # Prevents orphaned resources from accumulating.
      prune: true
      # selfHeal: true — if someone manually changes the cluster (e.g. kubectl edit),
      # ArgoCD reverts it back to what Git says. Git is always the source of truth.
      selfHeal: true
    syncOptions:
      # Create the cicd namespace if it doesn't exist yet.
      - CreateNamespace=true
```

- [ ] **Step 3: Create `argocd/applications/web.yaml`**

```yaml
# ArgoCD Application manifest for the React frontend service.
# Same structure as api.yaml — watches helm/web/ for changes.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web
  namespace: argocd
spec:
  project: default

  source:
    repoURL: https://github.com/SpencerTong/cicd-platform-project
    targetRevision: main
    path: helm/web
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
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 4: Apply both Application manifests to the cluster**

```bash
kubectl apply -f argocd/applications/
```

Expected:
```
application.argoproj.io/api created
application.argoproj.io/web created
```

- [ ] **Step 5: Watch ArgoCD sync**

```bash
kubectl get applications -n argocd
```

Within 3 minutes, both should show `Synced` and `Healthy`:
```
NAME   SYNC STATUS   HEALTH STATUS
api    Synced        Healthy
web    Synced        Healthy
```

Also check the ArgoCD UI at `https://localhost:8080` — you should see both apps as green.

- [ ] **Step 6: Verify services still work after ArgoCD takes ownership**

```bash
curl -s http://api.cicd.local/api/info
```

Expected: `{"app":"cicd-platform-api","java":"21.x.x","status":"UP","version":"0.0.1-SNAPSHOT"}`

- [ ] **Step 7: Commit**

```bash
git add argocd/
git commit -m "argocd(gitops): add Application manifests for api and web services"
```

---

## Task 3: Push and open PR for ArgoCD setup

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase/4-argocd-gitops
```

- [ ] **Step 2: Open a PR**

```bash
gh pr create \
  --title "feat: Phase 4 — ArgoCD + GitOps" \
  --base main \
  --head phase/4-argocd-gitops \
  --body "Installs ArgoCD and adds Application manifests for both services. ArgoCD now owns cluster state for api and web."
```

- [ ] **Step 3: Merge the PR**

Let CI run (it won't trigger for `argocd/` changes — no path filter matches), then merge. Alternatively, merge directly if no CI is required for this path.

- [ ] **Step 4: Pull main locally**

```bash
git checkout main && git pull origin main
```

---

## Task 4: Update cd.yml to commit image tag

**Files:**
- Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Read the current cd.yml**

Read `.github/workflows/cd.yml` to understand the current structure before editing.

- [ ] **Step 2: Replace the full file with the updated version**

```yaml
# CD pipeline — updates the image tag in values.yaml so ArgoCD can deploy it.
#
# Phase 4 change: instead of running helm upgrade directly, this workflow
# commits the new image tag to helm/<service>/values.yaml. ArgoCD detects
# the change in Git and syncs the cluster automatically within ~3 minutes.
#
# This is the GitOps pattern: Git is the source of truth. No tool runs
# helm upgrade manually — ArgoCD does it by reconciling the cluster state
# with what Git says.

name: CD — Deploy

on:
  workflow_run:
    workflows: ["CI — API", "CI — Web"]
    branches: [main]
    types: [completed]

# contents: write is required so this workflow can commit the tag update
# back to the repository. ArgoCD reads the updated values.yaml from GitHub.
permissions:
  contents: write

jobs:
  deploy:
    # Only update the tag if the triggering CI run succeeded.
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    # Runs on the self-hosted Mac runner which has Git credentials
    # already configured for this repository.
    runs-on: [self-hosted, local-k3s]

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          # Checkout main, not the triggering commit's ref.
          # We're updating values.yaml on main so ArgoCD picks up the change.
          ref: main
          # Use a token with write access so the push in the last step works.
          token: ${{ secrets.GITHUB_TOKEN }}

      # Determine which service to update based on which CI workflow triggered this run.
      - name: Determine service
        id: service
        run: |
          if [[ "${{ github.event.workflow_run.name }}" == "CI — API" ]]; then
            echo "name=api" >> $GITHUB_OUTPUT
          elif [[ "${{ github.event.workflow_run.name }}" == "CI — Web" ]]; then
            echo "name=web" >> $GITHUB_OUTPUT
          else
            echo "Unknown workflow: ${{ github.event.workflow_run.name }}" >&2
            exit 1
          fi

      # Update the image tag in values.yaml.
      # sed -i '' is macOS syntax (the self-hosted runner is macOS).
      # This replaces the "tag: <anything>" line with the new SHA tag.
      # ArgoCD polls GitHub every 3 minutes — once it sees this commit,
      # it runs helm upgrade automatically. No manual deploy needed.
      - name: Update image tag in values.yaml
        run: |
          sed -i '' "s/tag:.*/tag: sha-${{ github.event.workflow_run.head_sha }}/" \
            helm/${{ steps.service.outputs.name }}/values.yaml
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add helm/${{ steps.service.outputs.name }}/values.yaml
          git commit -m "chore(gitops): deploy ${{ steps.service.outputs.name }} sha-${{ github.event.workflow_run.head_sha }}"
          git push
```

- [ ] **Step 3: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit and push**

```bash
git checkout -b update/cd-gitops-tag-commit
git add .github/workflows/cd.yml
git commit -m "ci(pipeline): update cd.yml — commit image tag for ArgoCD instead of helm upgrade"
git push -u origin update/cd-gitops-tag-commit
```

- [ ] **Step 5: Open PR and merge**

```bash
gh pr create \
  --title "ci: update CD workflow for GitOps — commit tag instead of helm upgrade" \
  --base main \
  --head update/cd-gitops-tag-commit \
  --body "Replaces helm upgrade in cd.yml with a git commit that updates image.tag in values.yaml. ArgoCD detects the change and deploys automatically."
```

Merge the PR once open (no CI will run — cd.yml changes don't match any CI path filter).

- [ ] **Step 6: Pull main**

```bash
git checkout main && git pull origin main
```

---

## Task 5: Verify the full GitOps loop

- [ ] **Step 1: Ensure prerequisites are running**

```bash
# Cluster is up
kubectl cluster-info

# ArgoCD is running
kubectl get pods -n argocd | grep Running

# Port-forward is active (run in a separate terminal if not already)
# kubectl port-forward svc/argocd-server -n argocd 8080:443

# Self-hosted runner is online
# (check ~/actions-runner terminal shows "Listening for Jobs")
```

- [ ] **Step 2: Create a trivial API change to trigger CI**

```bash
git checkout -b verify/phase4-gitops-loop
```

Add one comment line to `services/api/src/main/java/com/cicdplatform/api/InfoController.java` — the last line before the closing `}` of the class:

```java
    // Phase 4 GitOps verification.
```

- [ ] **Step 3: Commit, push, open PR, and merge**

```bash
git add services/api/src/main/java/com/cicdplatform/api/InfoController.java
git commit -m "chore(api): verify Phase 4 GitOps loop"
git push -u origin verify/phase4-gitops-loop
gh pr create --title "chore: verify Phase 4 GitOps loop" --base main --head verify/phase4-gitops-loop --body "Triggers CI — API to verify the full GitOps loop: CI → CD commits tag → ArgoCD syncs."
```

Merge the PR once CI passes.

- [ ] **Step 4: Watch the CD workflow commit the tag**

After the merge, `CI — API` runs (push event), then `CD — Deploy` fires on the runner. In GitHub Actions, you should see `CD — Deploy` complete with a commit message like:

```
chore(gitops): deploy api sha-<new-sha>
```

Check the commit landed on main:
```bash
git pull origin main && git log --oneline -3
```

Expected: the most recent commit is the tag update from `github-actions[bot]`.

- [ ] **Step 5: Watch ArgoCD sync**

```bash
kubectl get applications -n argocd -w
```

Within 3 minutes of the tag commit, `api` should cycle through `OutOfSync` → `Syncing` → `Synced`.

Also watch in the UI at `https://localhost:8080`.

- [ ] **Step 6: Verify the cluster updated**

```bash
kubectl describe deployment api -n cicd | grep Image
```

Expected: `Image: ghcr.io/spencertong/cicd-platform-api:sha-<new-sha>` matching the merge commit SHA.

```bash
curl -s http://api.cicd.local/api/info
```

Expected: `{"status":"UP",...}` — services still working after the GitOps-driven rollout.

---

## Definition of Done

- [ ] ArgoCD installed and UI accessible at `https://localhost:8080`
- [ ] Both Application manifests applied — `kubectl get applications -n argocd` shows `api` and `web` as `Synced` and `Healthy`
- [ ] `cd.yml` updated — deploy step commits tag to `values.yaml`, no `helm upgrade`
- [ ] A code push triggers the full loop: CI builds image → CD commits tag → ArgoCD syncs cluster within 3 minutes
- [ ] `kubectl describe deployment api -n cicd | grep Image` shows the new SHA
- [ ] `http://web.cicd.local` still works after the ArgoCD-driven rollout
