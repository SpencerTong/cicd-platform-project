# Phase 2 — GitHub Actions CI Design

**Date:** 2026-06-01
**Status:** Approved
**Scope:** Two CI workflow files that automatically build, test, scan, and push Docker images on every PR and push to main.

---

## Goal

Automate what was done manually in Phase 1. Every push to `main` or PR that touches a service triggers a pipeline that: runs tests, builds the Docker image, scans it for vulnerabilities with Trivy, and pushes it to GHCR. No manual `docker build` or `docker push` commands after this phase.

---

## File Structure

```
.github/
└── workflows/
    ├── ci-api.yml    ← API pipeline
    └── ci-web.yml    ← Web pipeline
```

Two self-contained files. No shared workflows, no reusable actions — each file is independently readable from top to bottom.

---

## Triggers

Both workflows trigger on the same events but with different path filters:

**`ci-api.yml`** triggers on:
- `push` to `main` — paths: `services/api/**`, `.github/workflows/ci-api.yml`
- `pull_request` to `main` — same paths

**`ci-web.yml`** triggers on:
- `push` to `main` — paths: `services/web/**`, `.github/workflows/ci-web.yml`
- `pull_request` to `main` — same paths

Path filters ensure only the relevant pipeline runs when a service changes. Including the workflow file itself in the path filter means changes to the pipeline also trigger a run (so you can test CI changes).

---

## Permissions

Both workflows declare explicit permissions at the top:

```yaml
permissions:
  contents: read
  packages: write
```

`packages: write` is required to push images to GHCR. The `GITHUB_TOKEN` — a built-in secret automatically available in every GitHub Actions run — is used for authentication. No manual PAT or secret setup required.

---

## API Pipeline (`ci-api.yml`)

### Jobs

Single job: `build-test-push`, runs on `ubuntu-latest`.

### Steps

| Step | Action / Command | Purpose |
|---|---|---|
| Checkout | `actions/checkout@v4` | Get the source code |
| Set up Java 21 | `actions/setup-java@v4` with `cache: 'maven'` | Install Java, restore Maven cache |
| Run tests | `mvn test` in `services/api/` | 4 MockMvc tests must pass |
| Log in to GHCR | `docker login ghcr.io` with `GITHUB_TOKEN` | Authenticate before build |
| Build Docker image | `docker build` tagged with `:sha-<commit>` and `:latest` | Produce the image |
| Trivy scan | `aquasecurity/trivy-action` | Scan image — fail on HIGH or CRITICAL |
| Push to GHCR | `docker push` both tags | Publish only if scan passes |

### Caching

`actions/setup-java@v4` with `cache: 'maven'` caches `~/.m2` keyed on the hash of `services/api/pom.xml`. Cache hit skips dependency downloads (~30–60s saved per run).

### Image tags produced

- `ghcr.io/spencertong/cicd-platform-api:sha-<github.sha>` — immutable, traceable to commit
- `ghcr.io/spencertong/cicd-platform-api:latest` — always points to most recent build

---

## Web Pipeline (`ci-web.yml`)

### Jobs

Single job: `build-push`, runs on `ubuntu-latest`.

### Steps

| Step | Action / Command | Purpose |
|---|---|---|
| Checkout | `actions/checkout@v4` | Get the source code |
| Set up Node 20 | `actions/setup-node@v4` with `cache: 'npm'` | Install Node, restore npm cache |
| Install dependencies | `npm ci` in `services/web/` | Validates package-lock.json, installs exact versions |
| Log in to GHCR | `docker login ghcr.io` with `GITHUB_TOKEN` | Authenticate before build |
| Build Docker image | `docker build` tagged with `:sha-<commit>` and `:latest` | Produce the image (Vite build runs inside) |
| Trivy scan | `aquasecurity/trivy-action` | Scan image — fail on HIGH or CRITICAL |
| Push to GHCR | `docker push` both tags | Publish only if scan passes |

### Caching

`actions/setup-node@v4` with `cache: 'npm'` and `cache-dependency-path: services/web/package-lock.json` caches `~/.npm` keyed on the hash of `package-lock.json`.

### Image tags produced

- `ghcr.io/spencertong/cicd-platform-web:sha-<github.sha>` — immutable, traceable to commit
- `ghcr.io/spencertong/cicd-platform-web:latest` — always points to most recent build

### Note on testing

The web pipeline has no explicit test step — the React app has no test suite. `npm ci` validates the lockfile and the Docker build (`npm run build` inside the Dockerfile) confirms the app compiles. A test suite can be added in Phase 5 if desired.

---

## Trivy Configuration

Both pipelines use `aquasecurity/trivy-action` with:
- `scan-type: image`
- `severity: HIGH,CRITICAL`
- `exit-code: 1` — pipeline fails if any HIGH or CRITICAL CVEs are found

The image is scanned after it's built but before it's pushed. A vulnerable image never reaches GHCR.

---

## Authentication

GitHub Actions provides `GITHUB_TOKEN` automatically on every run. No manual secret creation is needed.

Login command used in both workflows:
```yaml
- name: Log in to GHCR
  run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
```

**Post-setup step:** After the first CI push, GHCR packages default to private. Navigate to `github.com/SpencerTong?tab=packages`, open each package's settings, and set visibility to public if you want them accessible without authentication.

---

## Commenting Standard

Both workflow files will be commented for learning and blog post follow-along:
- Every `on:` trigger block explains what events and paths it watches and why
- Every step explains what it does and why it's in this order
- Trivy step explains what "shift-left security" means in practice
- Cache step explains the key hashing strategy

---

## Definition of Done

- [ ] `ci-api.yml` triggers on a PR that touches `services/api/` — pipeline runs green
- [ ] `ci-web.yml` triggers on a PR that touches `services/web/` — pipeline runs green
- [ ] A push to `main` triggers both pipelines (if both paths changed) or only the relevant one
- [ ] Both images visible in GHCR with `:sha-<commit>` and `:latest` tags after a successful run
- [ ] A deliberate vulnerability (or HIGH/CRITICAL CVE in a base image) causes the pipeline to fail before pushing
- [ ] Caches are populated after the first run — second run is faster
