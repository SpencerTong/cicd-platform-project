# Phase 3 — Kubernetes + Helm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install k3s via Rancher Desktop, write Helm charts for both services, deploy them to a local cluster, and add a `cd.yml` GitHub Actions workflow using a self-hosted runner that automatically runs `helm upgrade` after CI succeeds.

**Architecture:** Two Helm charts (`helm/api/`, `helm/web/`) each containing a Deployment, Service, and Ingress. The web chart also has a ConfigMap that overrides nginx's proxy target from the Docker Compose service name (`api:8080`) to the Kubernetes DNS name (`api-svc.cicd.svc.cluster.local:8080`). A self-hosted GitHub Actions runner on the same machine as k3s gives the CD workflow direct cluster access without a tunnel.

**Tech Stack:** Rancher Desktop, k3s, Helm 3, nginx ingress controller, kubectl, self-hosted GitHub Actions runner

---

## File Map

```
helm/
├── api/
│   ├── Chart.yaml                          ← Task 3
│   ├── values.yaml                         ← Task 3
│   └── templates/
│       ├── deployment.yaml                 ← Task 3
│       ├── service.yaml                    ← Task 3
│       └── ingress.yaml                    ← Task 3
└── web/
    ├── Chart.yaml                          ← Task 4
    ├── values.yaml                         ← Task 4
    └── templates/
        ├── deployment.yaml                 ← Task 4
        ├── service.yaml                    ← Task 4
        ├── ingress.yaml                    ← Task 4
        └── configmap.yaml                  ← Task 4
.github/
└── workflows/
    └── cd.yml                              ← Task 7
```

---

## Task 1: Install Rancher Desktop

**⚠️ Manual task — run these steps yourself in your terminal and browser.**

- [ ] **Step 1: Download Rancher Desktop**

Go to https://rancherdesktop.io and download the macOS (Apple Silicon) `.dmg`.

- [ ] **Step 2: Install**

Open the `.dmg` and drag Rancher Desktop to Applications. Launch it.

- [ ] **Step 3: Configure on first launch**

When prompted:
- **Container Engine:** select `dockerd (moby)` — keeps `docker` CLI working as in Phases 1–2
- **Enable Kubernetes:** yes
- **Kubernetes version:** leave on default (latest stable)

Wait 2–3 minutes for the cluster to initialise. The Rancher Desktop menu bar icon will show a green dot when ready.

- [ ] **Step 4: Verify kubectl works**

```bash
kubectl cluster-info
```

Expected:
```
Kubernetes control plane is running at https://127.0.0.1:6443
```

- [ ] **Step 5: Verify the context**

```bash
kubectl config current-context
```

Expected: `rancher-desktop`

---

## Task 2: Configure the cluster

- [ ] **Step 1: Disable Traefik in Rancher Desktop**

Rancher Desktop ships with Traefik as its ingress controller. We replace it with nginx.

Open Rancher Desktop → **Preferences** → **Kubernetes** → uncheck **"Enable Traefik"** → Apply. Wait for the cluster to restart (~1 minute).

- [ ] **Step 2: Create the `cicd` namespace**

```bash
kubectl create namespace cicd
```

Expected: `namespace/cicd created`

- [ ] **Step 3: Install the nginx ingress controller**

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.hostPort.enabled=true \
  --set controller.hostPort.ports.http=80 \
  --set controller.hostPort.ports.https=443
```

`hostPort` binds port 80 and 443 on the node directly — needed so Rancher Desktop forwards traffic from localhost into the cluster.

Expected: output ending with `STATUS: deployed`

- [ ] **Step 4: Verify the ingress controller is running**

```bash
kubectl get pods -n ingress-nginx
```

Expected: a pod named `ingress-nginx-controller-...` with status `Running`.

- [ ] **Step 5: Add /etc/hosts entry**

```bash
sudo sh -c 'echo "127.0.0.1  web.cicd.local  api.cicd.local" >> /etc/hosts'
```

Verify:
```bash
grep cicd.local /etc/hosts
```
Expected: `127.0.0.1  web.cicd.local  api.cicd.local`

- [ ] **Step 6: Commit**

```bash
git checkout -b phase/3-kubernetes-helm
git commit --allow-empty -m "chore(cluster): Phase 3 branch — Rancher Desktop + nginx ingress configured"
```

---

## Task 3: Write the API Helm chart

**Files:**
- Create: `helm/api/Chart.yaml`
- Create: `helm/api/values.yaml`
- Create: `helm/api/templates/deployment.yaml`
- Create: `helm/api/templates/service.yaml`
- Create: `helm/api/templates/ingress.yaml`

- [ ] **Step 1: Create directories**

```bash
mkdir -p helm/api/templates
```

- [ ] **Step 2: Create `helm/api/Chart.yaml`**

```yaml
# Chart metadata. apiVersion: v2 is required for Helm 3.
# version is the chart version (changes when you update the chart).
# appVersion is the application version (informational only).
apiVersion: v2
name: api
description: CI/CD Platform Spring Boot API
type: application
version: 0.1.0
appVersion: "0.0.1"
```

- [ ] **Step 3: Create `helm/api/values.yaml`**

```yaml
# Default values for the api chart.
# Override at deploy time with --set or --values flags.

# Number of pod replicas. 1 is fine for local development.
replicaCount: 1

image:
  # The GHCR image repository (without the tag).
  repository: ghcr.io/spencertong/cicd-platform-api
  # Default tag. The CD workflow overrides this with sha-<commit> on every deploy.
  tag: latest
  # Always pull the image — ensures the cluster uses the latest version,
  # not a cached copy from a previous deployment.
  pullPolicy: Always

service:
  # The port the Spring Boot app listens on inside the container.
  port: 8080

ingress:
  # The hostname that routes to this service.
  # Must match the /etc/hosts entry on your laptop.
  host: api.cicd.local
  # Use the nginx ingress class we installed in Task 2.
  className: nginx
```

- [ ] **Step 4: Create `helm/api/templates/deployment.yaml`**

```yaml
# A Deployment tells Kubernetes to run N identical pod replicas
# and replace them automatically if they crash.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  # selector tells the Deployment which pods it owns.
  # Must match the labels in the pod template below.
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ .Release.Name }}
          # Helm substitutes .Values.image.repository and .Values.image.tag here.
          # The CD workflow overrides image.tag with sha-<commit> on each deploy.
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.port }}
          # Liveness probe: Kubernetes restarts the pod if /health stops responding.
          # This is why we added GET /health in Phase 1 — it pays off here.
          livenessProbe:
            httpGet:
              path: /health
              port: {{ .Values.service.port }}
            initialDelaySeconds: 30
            periodSeconds: 10
```

- [ ] **Step 5: Create `helm/api/templates/service.yaml`**

```yaml
# A Service gives the pod a stable internal address inside the cluster.
# Pods are ephemeral — they get new IPs when restarted. The Service IP stays constant.
# type: ClusterIP means the service is only reachable inside the cluster (not from outside).
# External access goes through the Ingress controller.
apiVersion: v1
kind: Service
metadata:
  # Named api-svc (Release.Name=api, so "api-svc").
  # This is the hostname other pods use to reach the API: api-svc.cicd.svc.cluster.local
  name: {{ .Release.Name }}-svc
  namespace: {{ .Release.Namespace }}
spec:
  # Routes traffic to pods with label app=api
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.port }}
  type: ClusterIP
```

- [ ] **Step 6: Create `helm/api/templates/ingress.yaml`**

```yaml
# An Ingress exposes the service outside the cluster via the nginx ingress controller.
# The controller reads this resource and configures nginx to route
# requests for api.cicd.local to the api-svc Service.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-ingress
  namespace: {{ .Release.Namespace }}
spec:
  # nginx is the ingress class we installed. Tells Kubernetes which
  # ingress controller should handle this Ingress resource.
  ingressClassName: {{ .Values.ingress.className }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}-svc
                port:
                  number: {{ .Values.service.port }}
```

- [ ] **Step 7: Lint the chart**

```bash
helm lint helm/api/
```

Expected:
```
==> Linting helm/api/
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

- [ ] **Step 8: Commit**

```bash
git add helm/api/
git commit -m "helm(api): add Helm chart for Spring Boot API"
```

---

## Task 4: Write the Web Helm chart

**Files:**
- Create: `helm/web/Chart.yaml`
- Create: `helm/web/values.yaml`
- Create: `helm/web/templates/deployment.yaml`
- Create: `helm/web/templates/service.yaml`
- Create: `helm/web/templates/ingress.yaml`
- Create: `helm/web/templates/configmap.yaml`

- [ ] **Step 1: Create directories**

```bash
mkdir -p helm/web/templates
```

- [ ] **Step 2: Create `helm/web/Chart.yaml`**

```yaml
apiVersion: v2
name: web
description: CI/CD Platform React Frontend
type: application
version: 0.1.0
appVersion: "0.0.1"
```

- [ ] **Step 3: Create `helm/web/values.yaml`**

```yaml
# Default values for the web chart.

replicaCount: 1

image:
  repository: ghcr.io/spencertong/cicd-platform-web
  tag: latest
  pullPolicy: Always

service:
  # nginx inside the container listens on port 80.
  port: 80

ingress:
  host: web.cicd.local
  className: nginx

# The URL nginx uses to proxy /api/* requests to the Spring Boot API.
# In Kubernetes, services are reachable by their DNS name:
#   <service-name>.<namespace>.svc.cluster.local
# This is different from Docker Compose where the service was just "api".
# The Deployment mounts this as a ConfigMap so docker-compose.yml is unaffected.
apiServiceUrl: "http://api-svc.cicd.svc.cluster.local:8080"
```

- [ ] **Step 4: Create `helm/web/templates/configmap.yaml`**

```yaml
# ConfigMap holds the nginx config that overrides the one baked into the Docker image.
# Why override? The Docker image has nginx.conf with proxy_pass http://api:8080
# (the Docker Compose service name). In Kubernetes the API is at api-svc.cicd.svc.cluster.local.
# Rather than rebuild the image for each environment, we mount this ConfigMap over
# the baked-in file — the image stays the same, the config changes per environment.
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-nginx-config
  namespace: {{ .Release.Namespace }}
data:
  default.conf: |
    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        # Proxy /api/* to the Spring Boot API service using Kubernetes DNS.
        location /api/ {
            proxy_pass {{ .Values.apiServiceUrl }};
            proxy_set_header Host $host;
        }

        # Serve index.html for all other paths (React SPA routing).
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
```

- [ ] **Step 5: Create `helm/web/templates/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ .Release.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.port }}
          volumeMounts:
            # Mount the ConfigMap over the nginx config baked into the Docker image.
            # subPath mounts only this one file, not the entire ConfigMap directory.
            - name: nginx-config
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: default.conf
      volumes:
        # Reference the ConfigMap created in configmap.yaml.
        - name: nginx-config
          configMap:
            name: {{ .Release.Name }}-nginx-config
```

- [ ] **Step 6: Create `helm/web/templates/service.yaml`**

```yaml
# ClusterIP service for the web frontend.
# Named web-svc — reachable inside the cluster at web-svc.cicd.svc.cluster.local
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-svc
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.port }}
  type: ClusterIP
```

- [ ] **Step 7: Create `helm/web/templates/ingress.yaml`**

```yaml
# Routes web.cicd.local → web-svc:80 via the nginx ingress controller.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-ingress
  namespace: {{ .Release.Namespace }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}-svc
                port:
                  number: {{ .Values.service.port }}
```

- [ ] **Step 8: Lint the chart**

```bash
helm lint helm/web/
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 9: Commit**

```bash
git add helm/web/
git commit -m "helm(web): add Helm chart for React frontend with nginx ConfigMap"
```

---

## Task 5: Deploy both charts manually and verify

Deploying manually first lets you see exactly what Kubernetes resources Helm creates. `helm upgrade --install` is idempotent: it installs on first run, upgrades on subsequent runs.

- [ ] **Step 1: Deploy the API chart**

```bash
helm upgrade --install api helm/api/ \
  --namespace cicd \
  --wait
```

`--wait` blocks until the Deployment's pods are Running. Takes ~60s on first run (image pull).

Expected final line: `STATUS: deployed`

- [ ] **Step 2: Verify the API pod is running**

```bash
kubectl get pods -n cicd
```

Expected:
```
NAME                   READY   STATUS    RESTARTS   AGE
api-xxxxxxxxx-xxxxx    1/1     Running   0          60s
```

- [ ] **Step 3: Verify the API endpoint via ingress**

```bash
curl -s http://api.cicd.local/api/info
```

Expected: `{"app":"cicd-platform-api","java":"21.x.x","status":"UP","version":"0.0.1-SNAPSHOT"}`

- [ ] **Step 4: Deploy the Web chart**

```bash
helm upgrade --install web helm/web/ \
  --namespace cicd \
  --wait
```

Expected: `STATUS: deployed`

- [ ] **Step 5: Verify the web pod is running**

```bash
kubectl get pods -n cicd
```

Expected: both `api-xxx` and `web-xxx` pods with status `Running`.

- [ ] **Step 6: Verify the full stack in browser**

Open `http://web.cicd.local` — you should see the dashboard with all four cards populated (APP, VERSION, JAVA, STATUS).

- [ ] **Step 7: Confirm the ConfigMap nginx proxy is working**

```bash
curl -s http://web.cicd.local/api/info
```

Expected: same JSON response as step 3 — confirming nginx inside the web pod is correctly proxying to the API via the Kubernetes DNS name.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit --allow-empty -m "chore(cluster): both services deployed to k3s via Helm — manually verified"
```

---

## Task 6: Set up the self-hosted GitHub Actions runner

A self-hosted runner runs on your Mac alongside k3s. Because it's on the same machine, it can reach the cluster directly — no tunnel needed.

**⚠️ Manual task — steps 1–4 require GitHub UI and your terminal.**

- [ ] **Step 1: Add a runner in GitHub**

Go to `github.com/SpencerTong/cicd-platform-project` → **Settings** → **Actions** → **Runners** → **New self-hosted runner**.

Select **macOS** and **ARM64**. GitHub shows a download URL and config command — keep this page open.

- [ ] **Step 2: Download and configure the runner**

Run the commands GitHub shows. They will look like:

```bash
# Create a folder
mkdir -p ~/actions-runner && cd ~/actions-runner

# Download the runner package (use the URL from GitHub's page — it includes your token)
curl -o actions-runner-osx-arm64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-osx-arm64-2.x.x.tar.gz

# Extract
tar xzf ./actions-runner-osx-arm64-2.x.x.tar.gz

# Configure (use the exact command from GitHub's page — it includes your token)
# IMPORTANT: when prompted for "Additional labels", enter: local-k3s
# This label is what cd.yml uses in runs-on: [self-hosted, local-k3s]
./config.sh --url https://github.com/SpencerTong/cicd-platform-project --token YOUR_TOKEN --labels local-k3s
```

When prompted for runner name, use `local-k3s`. Leave other options as default.

- [ ] **Step 3: Start the runner**

```bash
cd ~/actions-runner && ./run.sh
```

Leave this terminal open — the runner must be running when the CD workflow executes.

- [ ] **Step 4: Verify the runner appears in GitHub**

Go back to **Settings → Actions → Runners** — the `local-k3s` runner should show as **Idle**.

- [ ] **Step 5: Verify Helm is available to the runner**

In a new terminal:

```bash
which helm && helm version --short
```

Expected: path to helm binary and version like `v3.x.x`. If not installed:
```bash
brew install helm
```

- [ ] **Step 6: Verify kubectl context**

```bash
kubectl config current-context
```

Expected: `rancher-desktop` — the runner uses the same kubeconfig as your user.

---

## Task 7: Write the CD workflow

**Files:**
- Create: `.github/workflows/cd.yml`

- [ ] **Step 1: Create `.github/workflows/cd.yml`**

```yaml
# CD pipeline — deploys to the local k3s cluster after CI succeeds.
#
# Triggered by workflow_run: fires when CI — API or CI — Web completes.
# Only runs if the triggering CI workflow succeeded — failed builds never deploy.
#
# Uses a self-hosted runner (local-k3s) that runs on the same machine as k3s,
# so it can reach the cluster directly without exposing it externally.
# Phase 4 (ArgoCD) will replace this workflow entirely — ArgoCD runs inside
# the cluster and watches the repo, eliminating the need for any deploy step here.

name: CD — Deploy

on:
  workflow_run:
    # Listen for these CI workflows to complete.
    workflows: ["CI — API", "CI — Web"]
    branches: [main]
    types: [completed]

permissions:
  contents: read

jobs:
  deploy:
    # Only deploy if the triggering CI run succeeded.
    # A failed build should never reach the cluster.
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    # Run on our self-hosted runner which has direct access to the local k3s cluster.
    # 'self-hosted' matches any self-hosted runner; 'local-k3s' is the runner name.
    runs-on: [self-hosted, local-k3s]

    steps:
      - name: Checkout source code
        uses: actions/checkout@v4

      # Determine which service to deploy based on which CI workflow triggered this run.
      # github.event.workflow_run.name is the name field from the CI workflow file.
      - name: Determine service
        id: service
        run: |
          if [[ "${{ github.event.workflow_run.name }}" == "CI — API" ]]; then
            echo "name=api" >> $GITHUB_OUTPUT
          else
            echo "name=web" >> $GITHUB_OUTPUT
          fi

      # Deploy using Helm.
      # --install: creates the release if it doesn't exist yet (idempotent).
      # --set image.tag: overrides the tag in values.yaml with the exact commit SHA
      #   that was built and pushed by the triggering CI run.
      # github.event.workflow_run.head_sha is the commit SHA of the CI run that triggered this.
      - name: Deploy with Helm
        run: |
          helm upgrade --install ${{ steps.service.outputs.name }} \
            helm/${{ steps.service.outputs.name }}/ \
            --namespace cicd \
            --wait \
            --set image.tag=sha-${{ github.event.workflow_run.head_sha }}
```

- [ ] **Step 2: Validate the YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/cd.yml
git commit -m "ci(pipeline): add CD workflow — helm upgrade on CI success via self-hosted runner"
git push -u origin phase/3-kubernetes-helm
```

---

## Task 8: Verify the end-to-end CD loop

This task verifies the full pipeline: code push → CI → CD → cluster update.

- [ ] **Step 1: Confirm the self-hosted runner is running**

Check `~/actions-runner` terminal — should show `Listening for Jobs`.

- [ ] **Step 2: Open a PR that touches services/api**

```bash
git checkout -b verify/phase3-cd-loop
```

Add a comment to `services/api/src/main/java/com/cicdplatform/api/InfoController.java`:

```java
// Phase 3 CD verification
```

Add it as the last line before the closing `}` of the class.

- [ ] **Step 3: Commit and push**

```bash
git add services/api/src/main/java/com/cicdplatform/api/InfoController.java
git commit -m "chore(api): verify Phase 3 end-to-end CD loop"
git push -u origin verify/phase3-cd-loop
```

- [ ] **Step 4: Open and merge a PR**

Open a PR from `verify/phase3-cd-loop` to `main`. Watch **CI — API** complete. Once it passes and the merge commit lands on `main`, watch **CD — Deploy** trigger automatically.

- [ ] **Step 5: Verify the cluster was updated**

```bash
kubectl get pods -n cicd
```

The `api-xxx` pod should have been replaced (new pod NAME/AGE) with the image from the new commit.

```bash
kubectl describe deployment api -n cicd | grep Image
```

Expected: `Image: ghcr.io/spencertong/cicd-platform-api:sha-<new commit SHA>`

- [ ] **Step 6: Confirm the app still works**

```bash
curl -s http://api.cicd.local/api/info
```

Expected: `{"status":"UP",...}`

---

## Definition of Done

- [ ] `kubectl cluster-info` returns k3s cluster at 127.0.0.1
- [ ] nginx ingress controller running in `ingress-nginx` namespace
- [ ] Both services deployed: `kubectl get pods -n cicd` shows both Running
- [ ] `http://web.cicd.local` shows dashboard with live API data
- [ ] `http://api.cicd.local/api/info` returns JSON
- [ ] `http://web.cicd.local/api/info` returns JSON (nginx proxy working via Kubernetes DNS)
- [ ] Self-hosted runner shows Idle in GitHub Settings → Runners
- [ ] CD workflow triggers after a CI success and updates the cluster with the new image SHA
