# Phase 2 — GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two CI workflow files that automatically test, build, scan, and push Docker images to GHCR on every PR and push to main.

**Architecture:** Two self-contained GitHub Actions workflow files — `ci-api.yml` and `ci-web.yml` — each with path filters so only the relevant pipeline runs when a service changes. Both follow the same 6-step sequence: checkout → runtime setup → test/install → Docker build → Trivy scan → push to GHCR (on main only).

**Tech Stack:** GitHub Actions, `actions/checkout@v4`, `actions/setup-java@v4`, `actions/setup-node@v4`, `aquasecurity/trivy-action@master`, GHCR, `GITHUB_TOKEN`

---

## File Map

```
.github/
└── workflows/
    ├── ci-api.yml    ← Task 1
    └── ci-web.yml    ← Task 2
```

---

## Task 1: Write ci-api.yml

**Files:**
- Create: `.github/workflows/ci-api.yml`

- [ ] **Step 1: Create the feature branch and workflows directory**

```bash
git checkout -b phase/2-github-actions-ci
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci-api.yml`**

```yaml
# CI pipeline for the Spring Boot API service.
#
# Runs on every push to main or PR targeting main when files under
# services/api/ change. Also triggers when this workflow file itself
# changes so you can test pipeline modifications.

name: CI — API

on:
  push:
    branches: [main]
    paths:
      # Only run when API service files or this workflow change.
      # Ignoring unrelated changes (e.g. React app edits) keeps CI fast.
      - 'services/api/**'
      - '.github/workflows/ci-api.yml'
  pull_request:
    branches: [main]
    paths:
      - 'services/api/**'
      - '.github/workflows/ci-api.yml'

# Explicit permissions follow the principle of least privilege.
# contents: read  — allows checkout
# packages: write — allows pushing images to GHCR
permissions:
  contents: read
  packages: write

jobs:
  build-test-push:
    # ubuntu-latest is the standard GitHub-hosted runner for Linux containers.
    runs-on: ubuntu-latest

    steps:
      # Pull the repository contents onto the runner.
      - name: Checkout source code
        uses: actions/checkout@v4

      # Install Java 21 and restore the Maven dependency cache.
      # cache: 'maven' tells setup-java to cache ~/.m2 keyed on pom.xml's hash.
      # Cache hit: dependencies restored in ~5s instead of re-downloaded (~60s).
      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      # Run the four MockMvc tests. If any fail, the pipeline stops here —
      # a broken app never gets packaged or pushed.
      - name: Run tests
        working-directory: services/api
        run: mvn test --batch-mode

      # Authenticate Docker to GHCR using the built-in GITHUB_TOKEN.
      # No manual secret setup needed — GitHub provides this token automatically
      # on every run, scoped to this repository.
      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      # Build the image and tag it with two tags:
      # :sha-<commit> — immutable tag tied to this exact commit (used by Helm/ArgoCD later)
      # :latest       — always points to the most recent main-branch build
      - name: Build Docker image
        run: |
          docker build \
            -t ghcr.io/spencertong/cicd-platform-api:sha-${{ github.sha }} \
            -t ghcr.io/spencertong/cicd-platform-api:latest \
            ./services/api

      # Scan the built image for known vulnerabilities before pushing.
      # This is "shift-left" security — catching CVEs in the pipeline rather
      # than discovering them in production.
      #
      # exit-code: 1    — pipeline fails if any HIGH or CRITICAL CVEs are found
      # ignore-unfixed  — skips vulnerabilities with no available fix yet
      #                   (without this, base image CVEs outside our control
      #                   would permanently block the pipeline)
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/spencertong/cicd-platform-api:sha-${{ github.sha }}
          format: table
          exit-code: '1'
          severity: HIGH,CRITICAL
          ignore-unfixed: true

      # Push both tags to GHCR — but only on pushes to main, not on PRs.
      # On a PR we want to build and scan (verify the code is good) without
      # publishing an image that could be mistaken for a production build.
      - name: Push to GHCR
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          docker push ghcr.io/spencertong/cicd-platform-api:sha-${{ github.sha }}
          docker push ghcr.io/spencertong/cicd-platform-api:latest
```

- [ ] **Step 3: Validate the YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-api.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-api.yml
git commit -m "ci(pipeline): add GitHub Actions CI workflow for API service"
```

---

## Task 2: Write ci-web.yml

**Files:**
- Create: `.github/workflows/ci-web.yml`

- [ ] **Step 1: Create `.github/workflows/ci-web.yml`**

```yaml
# CI pipeline for the React web frontend service.
#
# Runs on every push to main or PR targeting main when files under
# services/web/ change. Also triggers when this workflow file itself
# changes.

name: CI — Web

on:
  push:
    branches: [main]
    paths:
      # Only run when web service files or this workflow change.
      - 'services/web/**'
      - '.github/workflows/ci-web.yml'
  pull_request:
    branches: [main]
    paths:
      - 'services/web/**'
      - '.github/workflows/ci-web.yml'

# Explicit permissions — same as ci-api.yml.
permissions:
  contents: read
  packages: write

jobs:
  build-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout source code
        uses: actions/checkout@v4

      # Install Node 20 and restore the npm cache.
      # cache-dependency-path points to services/web/package-lock.json so the
      # cache key is computed from the web service's lockfile, not the repo root.
      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/web/package-lock.json

      # Install exact dependency versions from package-lock.json.
      # npm ci fails if the lockfile is out of sync with package.json — this
      # catches dependency drift early, before it reaches production.
      - name: Install dependencies
        working-directory: services/web
        run: npm ci

      # Authenticate Docker to GHCR using the built-in GITHUB_TOKEN.
      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      # Build the image. The multi-stage Dockerfile runs `npm run build` (Vite)
      # inside Stage 1 — so the Docker build itself verifies the app compiles.
      # Tagged with :sha-<commit> and :latest.
      - name: Build Docker image
        run: |
          docker build \
            -t ghcr.io/spencertong/cicd-platform-web:sha-${{ github.sha }} \
            -t ghcr.io/spencertong/cicd-platform-web:latest \
            ./services/web

      # Scan the built image for vulnerabilities before pushing.
      # Same configuration as ci-api.yml — fail on HIGH/CRITICAL, skip unfixed.
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/spencertong/cicd-platform-web:sha-${{ github.sha }}
          format: table
          exit-code: '1'
          severity: HIGH,CRITICAL
          ignore-unfixed: true

      # Push to GHCR only on pushes to main — not on PRs.
      - name: Push to GHCR
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          docker push ghcr.io/spencertong/cicd-platform-web:sha-${{ github.sha }}
          docker push ghcr.io/spencertong/cicd-platform-web:latest
```

- [ ] **Step 2: Validate the YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-web.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-web.yml
git commit -m "ci(pipeline): add GitHub Actions CI workflow for web service"
```

---

## Task 3: Push branch and open PR

The workflows must land on `main` before they can trigger on PRs. This task gets them there.

- [ ] **Step 1: Verify you are on the feature branch**

```bash
git branch --show-current
```

Expected: `phase/2-github-actions-ci` (or whatever branch was created)

- [ ] **Step 2: Push the branch**

```bash
git push -u origin phase/2-github-actions-ci
```

- [ ] **Step 3: Open a PR on GitHub**

Go to `github.com/SpencerTong/cicd-platform-project` — GitHub will show a banner to open a PR from the pushed branch. Open it targeting `main`.

Note: The CI workflows will NOT run on this PR because they don't exist on `main` yet. That's expected — you're adding them for the first time.

- [ ] **Step 4: Merge the PR**

Once opened, merge it. This lands the workflow files on `main` and activates them for all future PRs.

- [ ] **Step 5: Pull main locally**

```bash
git checkout main && git pull origin main
```

---

## Task 4: Trigger and verify the API pipeline

Now that workflows are on `main`, create a PR that touches `services/api/**` to trigger `ci-api.yml`.

- [ ] **Step 1: Create a verification branch**

```bash
git checkout -b verify/ci-api-pipeline
```

- [ ] **Step 2: Make a trivial change to trigger the path filter**

Add a comment to `services/api/src/main/java/com/cicdplatform/api/InfoController.java`:

```java
// CI verification comment — triggers ci-api.yml path filter
```

Add it as the first line inside the class body (after the class declaration).

- [ ] **Step 3: Commit and push**

```bash
git add services/api/src/main/java/com/cicdplatform/api/InfoController.java
git commit -m "chore(api): trigger CI verification run"
git push -u origin verify/ci-api-pipeline
```

- [ ] **Step 4: Open a PR on GitHub**

Go to `github.com/SpencerTong/cicd-platform-project` and open a PR from `verify/ci-api-pipeline` targeting `main`.

- [ ] **Step 5: Watch the pipeline run**

On the PR page, click the **Checks** tab. You should see `CI — API` running. Confirm:
- ✅ Set up Java 21 (with cache miss on first run, ~60s)
- ✅ Run tests — 4 passed
- ✅ Build Docker image
- ✅ Scan image with Trivy — no HIGH/CRITICAL found
- ❌ Push to GHCR — skipped (this is correct — PRs don't push)

- [ ] **Step 6: Confirm `CI — Web` did NOT run**

On the same PR, verify only `CI — API` ran. The web pipeline should not appear because no `services/web/**` files were changed.

- [ ] **Step 7: Merge the PR**

Merge into `main`. This triggers `ci-api.yml` as a push event, which WILL push the image to GHCR.

- [ ] **Step 8: Verify image in GHCR**

Go to `github.com/SpencerTong?tab=packages`. Open `cicd-platform-api`. You should see:
- `:latest` tag
- `:sha-<commit>` tag matching the merge commit SHA

---

## Task 5: Trigger and verify the Web pipeline

- [ ] **Step 1: Create a verification branch**

```bash
git checkout main && git pull origin main
git checkout -b verify/ci-web-pipeline
```

- [ ] **Step 2: Make a trivial change to trigger the path filter**

Add a comment to `services/web/src/App.jsx`:

```jsx
{/* CI verification comment — triggers ci-web.yml path filter */}
```

Add it inside the `return` block, just before the `<div className="container">` line.

- [ ] **Step 3: Commit and push**

```bash
git add services/web/src/App.jsx
git commit -m "chore(web): trigger CI verification run"
git push -u origin verify/ci-web-pipeline
```

- [ ] **Step 4: Open a PR and watch the pipeline**

Open a PR from `verify/ci-web-pipeline` to `main`. On the **Checks** tab confirm:
- ✅ Set up Node 20 (cache miss on first run)
- ✅ Install dependencies — npm ci succeeded
- ✅ Build Docker image
- ✅ Scan image with Trivy — no HIGH/CRITICAL found
- ❌ Push to GHCR — skipped (PR, not push)

Confirm `CI — API` did NOT run.

- [ ] **Step 5: Merge the PR**

Merge into `main`. The push event triggers `ci-web.yml`, which pushes the web image to GHCR.

- [ ] **Step 6: Verify image in GHCR**

Go to `github.com/SpencerTong?tab=packages`. Open `cicd-platform-web`. Confirm `:latest` and `:sha-<commit>` tags are present.

---

## Task 6: Set GHCR package visibility to public

By default GHCR packages are private. Make them public so they can be pulled without authentication (required for k3s in Phase 3).

- [ ] **Step 1: Set API package to public**

1. Go to `github.com/SpencerTong?tab=packages`
2. Click `cicd-platform-api`
3. Click **Package settings** (right sidebar)
4. Scroll to **Danger Zone** → **Change visibility** → set to **Public**
5. Confirm

- [ ] **Step 2: Set Web package to public**

Repeat the same steps for `cicd-platform-web`.

- [ ] **Step 3: Verify public access**

```bash
docker pull ghcr.io/spencertong/cicd-platform-api:latest
docker pull ghcr.io/spencertong/cicd-platform-web:latest
```

Expected: both pull without authentication errors.

---

## Definition of Done

- [ ] `ci-api.yml` triggers on a PR touching `services/api/**` — pipeline runs green (test → build → scan)
- [ ] `ci-web.yml` triggers on a PR touching `services/web/**` — pipeline runs green (install → build → scan)
- [ ] A push to `main` (via merge) triggers the relevant pipeline and pushes images to GHCR
- [ ] Only the relevant pipeline runs — touching API files doesn't trigger the web pipeline
- [ ] Both images visible in GHCR with `:sha-<commit>` and `:latest` tags
- [ ] Both GHCR packages set to public
- [ ] Second CI run is faster than first (cache populated)
