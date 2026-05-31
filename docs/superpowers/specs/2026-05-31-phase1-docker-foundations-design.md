# Phase 1 — Docker Foundations Design

**Date:** 2026-05-31
**Status:** Approved
**Scope:** Containerize both services, run locally via Docker Compose, push images to GHCR manually.

---

## Goal

Produce two Docker images — one for the Spring Boot API, one for the React frontend — that run together locally via Docker Compose. At the end of the phase, push both images to GitHub Container Registry (GHCR) manually. This establishes the container foundation that every subsequent phase builds on.

---

## Sequencing

Work through each service end-to-end before moving to the next. The order:

1. Build and run the Spring Boot API standalone (app → Dockerfile → `docker run`)
2. Build and run the React web app standalone (app → Dockerfile → `docker run`)
3. Wire both together with Docker Compose
4. Push both images to GHCR

Debugging one thing at a time means that when something breaks, the cause is isolated.

---

## Service 1 — Spring Boot API

### What it does

A minimal REST API with two endpoints:

| Endpoint | Response |
|---|---|
| `GET /health` | `{"status": "UP"}` |
| `GET /api/info` | `{"app": "cicd-platform-api", "version": "0.0.1-SNAPSHOT", "java": "21.0.2", "status": "UP"}` |

`/health` exists for Kubernetes liveness probes in later phases. `/api/info` returns build metadata pulled from the Java runtime — this is what the React frontend displays.

### Tech choices

- **Java 21** (current LTS)
- **Spring Boot 3.3.x**
- **Maven** (build tool — `pom.xml`)
- Dependencies: `spring-boot-starter-web` only — no database, no security, nothing extra

### Project structure

```
services/api/
├── src/main/java/com/cicdplatform/api/
│   ├── ApiApplication.java        ← Spring Boot entry point
│   └── InfoController.java        ← the two endpoints
├── src/main/resources/
│   └── application.properties     ← server.port=8080
├── Dockerfile
└── pom.xml
```

### Dockerfile — multi-stage build

**Why multi-stage:** Stage 1 compiles the app using a Maven image. Stage 2 copies only the compiled JAR into a slim JRE image and discards Stage 1. The final image contains no Maven, no source code, no build tools — only the JRE and the JAR. Result: ~200MB instead of ~700MB, smaller attack surface.

```
Stage 1 (builder):
  Base image: maven:3.9-eclipse-temurin-21-alpine
  Copy pom.xml and src/
  Run: mvn package -DskipTests
  Output: target/api-0.0.1-SNAPSHOT.jar

Stage 2 (runtime):
  Base image: eclipse-temurin:21-jre-alpine
  Copy JAR from Stage 1
  Expose port 8080
  CMD: java -jar app.jar
```

---

## Service 2 — React Web App

### What it does

A single-page React app that fetches `GET /api/info` on load and displays the response as a dashboard card grid — one card per field (app name, version, Java version, status). Shows a loading state while fetching, an error state if the API is unreachable.

### Tech choices

- **Vite + React** (Create React App is deprecated — Vite is the modern standard)
- **Plain CSS** — no Tailwind, no component library — keeps focus on the platform
- Single `App.jsx` component with one `fetch()` call — the entire application logic

### Project structure

```
services/web/
├── src/
│   ├── App.jsx          ← fetches /api/info, renders dashboard cards
│   └── main.jsx         ← Vite entry point
├── public/
├── nginx.conf           ← proxy rule: /api/* → http://api:8080
├── Dockerfile
├── package.json
└── vite.config.js
```

### Dockerfile — multi-stage build

**Why multi-stage:** Stage 1 uses Node to compile the React source into static files (`dist/`). Stage 2 copies only `dist/` into an nginx image and discards Stage 1. The final image contains no Node, no npm, no source code — only nginx and static files.

```
Stage 1 (builder):
  Base image: node:20-alpine
  Copy package.json, run: npm ci
  Copy src/, run: npm run build
  Output: dist/ folder of static HTML/CSS/JS

Stage 2 (runtime):
  Base image: nginx:alpine
  Copy dist/ from Stage 1
  Copy nginx.conf
  Expose port 80
```

### nginx.conf — the proxy rule

nginx serves static files for all requests by default. One additional rule: any request matching `/api/*` is forwarded (proxied) to `http://api:8080` on the internal Docker network. This means the browser only ever talks to one origin (port 3000), which avoids CORS issues entirely. The API container is never exposed to the browser directly.

---

## Docker Compose

Single `docker-compose.yml` at the repo root. Runs both containers with `docker compose up`.

```yaml
services:
  api:
    build: ./services/api
    ports:
      - "8080:8080"       # exposed for direct testing during development

  web:
    build: ./services/web
    ports:
      - "3000:80"         # browser hits localhost:3000
    depends_on:
      - api               # api container starts before web
```

Both containers automatically join the same private Docker network. Docker resolves the container name `api` to the API container's internal IP — this is why `nginx.conf` can proxy to `http://api:8080` by name rather than a hardcoded IP address.

`depends_on` controls startup order only, not readiness. This is intentional for Phase 1 — Kubernetes handles readiness properly in Phase 3 via the `/health` endpoint.

---

## GHCR Push (Phase 1 Deliverable)

After both services run correctly via Docker Compose, push both images to GitHub Container Registry manually. Doing this by hand once makes it clear exactly what GitHub Actions automates in Phase 2.

**Prerequisites:**
- GitHub Personal Access Token (PAT) with `write:packages` scope

**Steps:**

```bash
# 1. Authenticate
docker login ghcr.io -u SpencerTong --password <GitHub PAT>

# 2. Build and tag
docker build -t ghcr.io/spencertong/cicd-platform-api:latest ./services/api
docker build -t ghcr.io/spencertong/cicd-platform-web:latest ./services/web

# 3. Push
docker push ghcr.io/spencertong/cicd-platform-api:latest
docker push ghcr.io/spencertong/cicd-platform-web:latest
```

After pushing, images are visible at `github.com/SpencerTong?tab=packages`.

---

## Commenting & Documentation Standard

Every file produced in this phase will be commented for learning and blog post follow-along. The goal is that a reader can understand every decision without needing to Google anything:

- **Dockerfiles:** every instruction commented — what it does and why
- **nginx.conf:** proxy rule explained inline
- **docker-compose.yml:** every field explained
- **pom.xml:** non-obvious dependencies flagged
- **Commit messages:** explain *why* a decision was made, not just what changed

---

## Definition of Done

- [ ] `services/api` Spring Boot app runs locally (`mvn spring-boot:run`)
- [ ] `services/api` Docker image builds and runs (`docker build` + `docker run`)
- [ ] `services/web` React app runs locally (`npm run dev`)
- [ ] `services/web` Docker image builds and runs
- [ ] `docker compose up` starts both services; browser at `localhost:3000` shows the dashboard with data from the API
- [ ] Both images pushed to GHCR and visible at `github.com/SpencerTong?tab=packages`
