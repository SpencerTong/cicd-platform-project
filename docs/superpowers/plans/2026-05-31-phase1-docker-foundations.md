# Phase 1 — Docker Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize the Spring Boot API and React frontend, run both locally via Docker Compose, and push both images to GHCR manually.

**Architecture:** Build the API end-to-end first (app → Dockerfile → docker run), then the web app, then wire them together with Docker Compose. Each service uses a multi-stage Docker build: a heavyweight builder stage compiles the app, a slim runtime stage copies only the output — leaving no build tools in the final image.

**Tech Stack:** Java 21, Spring Boot 3.3.5, Maven, React 18, Vite 5, nginx:alpine, Docker, Docker Compose, GHCR

---

## File Map

```
cicd-platform/
├── docker-compose.yml                             ← Task 12
├── services/
│   ├── api/
│   │   ├── pom.xml                                ← Task 1
│   │   ├── Dockerfile                             ← Task 5
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/cicdplatform/api/
│   │       │   │   ├── ApiApplication.java        ← Task 1
│   │       │   │   └── InfoController.java        ← Task 3
│   │       │   └── resources/
│   │       │       └── application.properties     ← Task 1
│   │       └── test/java/com/cicdplatform/api/
│   │           └── InfoControllerTest.java        ← Task 2
│   └── web/
│       ├── package.json                           ← Task 7
│       ├── package-lock.json                      ← Task 7 (generated)
│       ├── vite.config.js                         ← Task 7
│       ├── index.html                             ← Task 7
│       ├── nginx.conf                             ← Task 10
│       ├── Dockerfile                             ← Task 10
│       └── src/
│           ├── main.jsx                           ← Task 7
│           ├── App.jsx                            ← Task 8
│           └── App.css                            ← Task 8
```

---

## Task 1: Bootstrap the Spring Boot API project

**Files:**
- Create: `services/api/pom.xml`
- Create: `services/api/src/main/java/com/cicdplatform/api/ApiApplication.java`
- Create: `services/api/src/main/resources/application.properties`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p services/api/src/main/java/com/cicdplatform/api
mkdir -p services/api/src/main/resources
mkdir -p services/api/src/test/java/com/cicdplatform/api
```

- [ ] **Step 2: Create `services/api/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- Spring Boot parent provides sensible defaults for dependencies and plugins.
         It pins compatible versions of every library so we don't have to. -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.5</version>
        <relativePath/>
    </parent>

    <groupId>com.cicdplatform</groupId>
    <artifactId>api</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>api</name>
    <description>CI/CD Platform API Service</description>

    <properties>
        <!-- Tell Maven and Spring Boot to compile for Java 21. -->
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <!-- spring-boot-starter-web pulls in Spring MVC + embedded Tomcat.
             This is everything we need to write REST endpoints. -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- spring-boot-starter-test pulls in JUnit 5 + MockMvc for our tests.
             scope=test means it's never included in the production JAR. -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- The Spring Boot Maven plugin packages the app into a single
                 executable "fat JAR" that includes all dependencies.
                 This is the JAR we'll copy into the Docker runtime image. -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 3: Create `services/api/src/main/java/com/cicdplatform/api/ApiApplication.java`**

```java
package com.cicdplatform.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// @SpringBootApplication enables component scanning, auto-configuration, and
// configuration properties in one annotation. It's the entry point for Spring.
@SpringBootApplication
public class ApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(ApiApplication.class, args);
    }
}
```

- [ ] **Step 4: Create `services/api/src/main/resources/application.properties`**

```properties
# Bind the embedded Tomcat server to port 8080.
# This is the port Docker will expose and nginx will proxy to.
server.port=8080
```

- [ ] **Step 5: Commit**

```bash
git add services/api/pom.xml \
        services/api/src/main/java/com/cicdplatform/api/ApiApplication.java \
        services/api/src/main/resources/application.properties
git commit -m "feat(api): bootstrap Spring Boot project with Maven"
```

---

## Task 2: Write failing tests for InfoController

**Files:**
- Create: `services/api/src/test/java/com/cicdplatform/api/InfoControllerTest.java`

- [ ] **Step 1: Create `services/api/src/test/java/com/cicdplatform/api/InfoControllerTest.java`**

```java
package com.cicdplatform.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// @WebMvcTest loads only the web layer (controllers) — no database, no full context.
// It's faster than @SpringBootTest and focused on testing HTTP behaviour.
@WebMvcTest(InfoController.class)
class InfoControllerTest {

    // MockMvc lets us fire HTTP requests at the controller without starting a real server.
    @Autowired
    private MockMvc mockMvc;

    @Test
    void health_returnsStatusUp() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void info_returnsAppName() throws Exception {
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.app").value("cicd-platform-api"));
    }

    @Test
    void info_returnsJavaVersion() throws Exception {
        // We don't assert a specific version — just that the field is present
        // and non-empty. The actual value comes from the JVM at runtime.
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.java").isString())
                .andExpect(jsonPath("$.java").isNotEmpty());
    }

    @Test
    void info_returnsStatusUp() throws Exception {
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd services/api && mvn test
```

Expected: BUILD FAILURE — `InfoController` doesn't exist yet. You should see something like:
```
[ERROR] COMPILATION ERROR
[ERROR] cannot find symbol: class InfoController
```

- [ ] **Step 3: Commit the failing tests**

```bash
git add services/api/src/test/java/com/cicdplatform/api/InfoControllerTest.java
git commit -m "test(api): add failing tests for /health and /api/info endpoints"
```

---

## Task 3: Implement InfoController to make tests pass

**Files:**
- Create: `services/api/src/main/java/com/cicdplatform/api/InfoController.java`

- [ ] **Step 1: Create `services/api/src/main/java/com/cicdplatform/api/InfoController.java`**

```java
package com.cicdplatform.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// @RestController marks this class as a Spring MVC controller where every method
// returns JSON (no view rendering). Combines @Controller and @ResponseBody.
@RestController
public class InfoController {

    // GET /health — used by Kubernetes as a liveness probe in Phase 3.
    // Returns a simple JSON object so health checkers can parse the response.
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }

    // GET /api/info — returns build metadata about this running instance.
    // The java version is read from the JVM at runtime, not hardcoded, so it
    // reflects the actual environment the container is running in.
    @GetMapping("/api/info")
    public Map<String, String> info() {
        return Map.of(
                "app",     "cicd-platform-api",
                "version", "0.0.1-SNAPSHOT",
                "java",    System.getProperty("java.version"),
                "status",  "UP"
        );
    }
}
```

- [ ] **Step 2: Run the tests and confirm they pass**

```bash
cd services/api && mvn test
```

Expected:
```
[INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

- [ ] **Step 3: Commit**

```bash
git add services/api/src/main/java/com/cicdplatform/api/InfoController.java
git commit -m "feat(api): implement /health and /api/info endpoints"
```

---

## Task 4: Verify the API runs locally

- [ ] **Step 1: Start the API with Maven**

```bash
cd services/api && mvn spring-boot:run
```

Expected output (last few lines):
```
Started ApiApplication in 2.3 seconds (process running for 2.6)
```

- [ ] **Step 2: Smoke-test both endpoints**

In a second terminal:

```bash
curl -s localhost:8080/health | python3 -m json.tool
```
Expected:
```json
{
    "status": "UP"
}
```

```bash
curl -s localhost:8080/api/info | python3 -m json.tool
```
Expected:
```json
{
    "app": "cicd-platform-api",
    "java": "21.0.x",
    "status": "UP",
    "version": "0.0.1-SNAPSHOT"
}
```

- [ ] **Step 3: Stop the server**

Press `Ctrl+C` in the terminal running Spring Boot.

---

## Task 5: Write the API Dockerfile

**Files:**
- Create: `services/api/Dockerfile`

- [ ] **Step 1: Create `services/api/Dockerfile`**

```dockerfile
# =============================================================================
# Stage 1: Builder
# -----------------------------------------------------------------------------
# Uses the official Maven image with Java 21 to compile and package the app.
# Alpine is the lightweight Linux variant — it keeps this stage small even
# though we discard it entirely after building.
# =============================================================================
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

# Set the working directory inside the build container.
WORKDIR /app

# Copy the Maven project descriptor BEFORE the source code.
# Docker builds images in layers. By copying pom.xml separately, the
# dependency-download layer is cached and only re-runs when pom.xml changes —
# not on every source code change. This makes rebuilds much faster.
COPY pom.xml .

# Download all declared dependencies into the local Maven cache.
# --batch-mode suppresses interactive prompts (required in CI/Docker contexts).
RUN mvn dependency:go-offline --batch-mode

# Now copy the source code and build the fat JAR.
# -DskipTests: tests are run by the CI pipeline (Phase 2), not during the
# Docker build. Running them here would slow every image build unnecessarily.
COPY src/ src/
RUN mvn package -DskipTests --batch-mode

# =============================================================================
# Stage 2: Runtime
# -----------------------------------------------------------------------------
# Uses a slim JRE-only image. A JRE can run Java programs but cannot compile
# them — Maven and the Java SDK are not present. This is all we need.
#
# eclipse-temurin is the official OpenJDK distribution maintained by the
# Eclipse Adoptium project. It's the recommended base for production Java images.
# =============================================================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy ONLY the compiled JAR from Stage 1. Everything else — Maven, the SDK,
# source code, build caches — is left behind and never enters this image.
# Result: ~200MB final image instead of ~700MB.
COPY --from=builder /app/target/api-0.0.1-SNAPSHOT.jar app.jar

# Document that the app listens on port 8080.
# EXPOSE is metadata only — it doesn't open the port. The actual port mapping
# happens at runtime with -p (docker run) or in docker-compose.yml.
EXPOSE 8080

# Start the Spring Boot application when the container runs.
# Using the exec form (JSON array) so the JVM receives OS signals directly —
# important for graceful shutdown when Kubernetes stops the container.
CMD ["java", "-jar", "app.jar"]
```

- [ ] **Step 2: Commit**

```bash
git add services/api/Dockerfile
git commit -m "docker(api): add multi-stage Dockerfile — maven builder + JRE runtime"
```

---

## Task 6: Build and smoke-test the API Docker image

- [ ] **Step 1: Build the image**

Run from the repo root:

```bash
docker build -t cicd-platform-api:local ./services/api
```

Expected: build completes with output ending in:
```
Successfully tagged cicd-platform-api:local
```
The build will take a few minutes on first run (downloading Maven dependencies). Subsequent builds are fast due to layer caching.

- [ ] **Step 2: Check the image size**

```bash
docker images cicd-platform-api:local
```

Expected: size around 180–220MB (not 700MB+ which a single-stage build would produce).

- [ ] **Step 3: Run the container**

```bash
docker run --rm -p 8080:8080 cicd-platform-api:local
```

- [ ] **Step 4: Smoke-test the running container**

In a second terminal:

```bash
curl -s localhost:8080/health
```
Expected: `{"status":"UP"}`

```bash
curl -s localhost:8080/api/info
```
Expected: `{"app":"cicd-platform-api","java":"21.x.x","status":"UP","version":"0.0.1-SNAPSHOT"}`

- [ ] **Step 5: Stop the container**

Press `Ctrl+C` in the terminal running the container.

---

## Task 7: Bootstrap the React web app

**Files:**
- Create: `services/web/package.json`
- Create: `services/web/vite.config.js`
- Create: `services/web/index.html`
- Create: `services/web/src/main.jsx`
- Generated: `services/web/package-lock.json`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p services/web/src
mkdir -p services/web/public
```

- [ ] **Step 2: Create `services/web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create `services/web/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In development (npm run dev), Vite proxies /api requests to the Spring Boot
    // API running locally on port 8080. This mirrors the nginx proxy config used
    // in the Docker image, so the React code works identically in both environments.
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
})
```

- [ ] **Step 4: Create `services/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CI/CD Platform</title>
  </head>
  <body>
    <!-- React mounts into this div. The entire app lives here. -->
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `services/web/src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// StrictMode activates extra development-only checks in React.
// It has no effect in production builds.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Install dependencies to generate package-lock.json**

```bash
cd services/web && npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 7: Commit**

```bash
git add services/web/package.json \
        services/web/package-lock.json \
        services/web/vite.config.js \
        services/web/index.html \
        services/web/src/main.jsx
git commit -m "feat(web): bootstrap Vite + React project"
```

---

## Task 8: Implement App.jsx and App.css

**Files:**
- Create: `services/web/src/App.jsx`
- Create: `services/web/src/App.css`

- [ ] **Step 1: Create `services/web/src/App.jsx`**

```jsx
import { useState, useEffect } from 'react'
import './App.css'

export default function App() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch build metadata from the Spring Boot API.
    // In development: Vite proxies this to localhost:8080 (vite.config.js).
    // In Docker/production: nginx proxies this to the api container (nginx.conf).
    fetch('/api/info')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setInfo)
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="container">
        <p className="error">Could not reach the API: {error}</p>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="container">
        <p className="loading">Connecting to API...</p>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>CI/CD Platform</h1>
      <p className="subtitle">Live data from the Spring Boot API</p>
      <div className="cards">
        <Card label="APP"     value={info.app} />
        <Card label="VERSION" value={info.version} />
        <Card label="JAVA"    value={info.java} />
        <Card label="STATUS"  value={info.status} highlight />
      </div>
    </div>
  )
}

function Card({ label, value, highlight }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${highlight ? ' card-value--up' : ''}`}>
        {value}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `services/web/src/App.css`**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f8fafc;
  color: #1e293b;
}

.container {
  max-width: 560px;
  margin: 64px auto;
  padding: 0 24px;
}

h1 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.subtitle {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 28px;
}

/* 2-column grid — one card per API field */
.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.card-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #94a3b8;
  margin-bottom: 6px;
}

.card-value {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

/* Green colour for the STATUS card */
.card-value--up {
  color: #16a34a;
}

.loading {
  color: #94a3b8;
  text-align: center;
  padding: 40px 0;
}

.error {
  color: #dc2626;
  text-align: center;
  padding: 40px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add services/web/src/App.jsx services/web/src/App.css
git commit -m "feat(web): implement dashboard card UI with API data fetch"
```

---

## Task 9: Verify the React app runs locally

The Spring Boot API must be running for the fetch to succeed. Start it first.

- [ ] **Step 1: Start the API in one terminal**

```bash
cd services/api && mvn spring-boot:run
```

Wait for: `Started ApiApplication in 2.x seconds`

- [ ] **Step 2: Start the React dev server in a second terminal**

```bash
cd services/web && npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

- [ ] **Step 3: Open the app in your browser**

Navigate to `http://localhost:5173`. You should see the dashboard with four cards populated with real data from the API.

- [ ] **Step 4: Stop both servers**

Press `Ctrl+C` in both terminals.

---

## Task 10: Write the Web Dockerfile and nginx.conf

**Files:**
- Create: `services/web/nginx.conf`
- Create: `services/web/Dockerfile`

- [ ] **Step 1: Create `services/web/nginx.conf`**

```nginx
server {
    # nginx listens on port 80 inside the container.
    # Docker Compose maps this to port 3000 on your laptop (3000:80).
    listen 80;

    # Serve files from the dist/ directory copied in during the Docker build.
    root /usr/share/nginx/html;
    index index.html;

    # Proxy any request starting with /api to the Spring Boot API container.
    # "api" is the service name defined in docker-compose.yml — Docker's internal
    # DNS resolves it to the API container's IP automatically.
    # This is why the browser never needs to know the API's address directly,
    # and why we avoid CORS: all requests come from the same origin (port 3000).
    location /api/ {
        proxy_pass http://api:8080;

        # Forward the original host header so Spring Boot knows the real origin.
        proxy_set_header Host $host;
    }

    # For all other paths, serve index.html.
    # This is essential for single-page apps: without it, refreshing a URL like
    # /dashboard would make nginx look for a file called "dashboard" and 404.
    # try_files checks for the file first, then falls back to index.html.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create `services/web/Dockerfile`**

```dockerfile
# =============================================================================
# Stage 1: Builder
# -----------------------------------------------------------------------------
# Uses Node.js 20 Alpine to install dependencies and compile the React app
# into static files. Node is only needed for this step — it doesn't run in
# production.
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files before source code so npm install is cached separately.
# npm ci installs exact versions from package-lock.json — faster and stricter
# than npm install. It fails if package-lock.json is out of sync, which catches
# dependency drift early.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the production bundle.
# Vite outputs to dist/ — a folder of plain HTML, CSS, and JS files.
COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Serve
# -----------------------------------------------------------------------------
# Uses a bare nginx Alpine image. No Node.js, no npm, no source code.
# nginx just serves the static files from Stage 1.
# =============================================================================
FROM nginx:alpine

# Remove nginx's default config and replace with ours.
# Our config adds the /api proxy rule that routes API requests to the
# Spring Boot container on the Docker Compose network.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled static files from Stage 1 into nginx's serving directory.
COPY --from=builder /app/dist /usr/share/nginx/html

# Document that nginx listens on port 80 inside the container.
EXPOSE 80
```

- [ ] **Step 3: Commit**

```bash
git add services/web/nginx.conf services/web/Dockerfile
git commit -m "docker(web): add multi-stage Dockerfile — node builder + nginx runtime"
```

---

## Task 11: Build and smoke-test the Web Docker image standalone

We'll test the web image in isolation before wiring it to the API via Compose.

- [ ] **Step 1: Build the image**

```bash
docker build -t cicd-platform-web:local ./services/web
```

Expected: build completes successfully. First build downloads node and nginx base images.

- [ ] **Step 2: Check the image size**

```bash
docker images cicd-platform-web:local
```

Expected: size around 30–50MB (nginx:alpine is tiny).

- [ ] **Step 3: Run the container**

```bash
docker run --rm -p 3000:80 cicd-platform-web:local
```

- [ ] **Step 4: Verify nginx serves the app**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`

Open `http://localhost:3000` in your browser. The page should load but show "Connecting to API..." — this is correct. The API container isn't running yet, so the fetch fails gracefully.

- [ ] **Step 5: Stop the container**

Press `Ctrl+C`.

---

## Task 12: Wire both services with Docker Compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml` at the repo root**

```yaml
# Docker Compose wires both containers together on a shared private network.
#
# Usage:
#   Start:   docker compose up --build
#   Stop:    docker compose down
#   Rebuild: docker compose up --build (rebuilds changed images)

services:

  # The Spring Boot REST API — serves /health and /api/info
  api:
    build:
      context: ./services/api
      dockerfile: Dockerfile
    ports:
      # Exposes the API directly on localhost:8080 so you can test it with curl
      # without going through the web container. Useful during development.
      - "8080:8080"

  # The React frontend served by nginx
  web:
    build:
      context: ./services/web
      dockerfile: Dockerfile
    ports:
      # Maps nginx's internal port 80 to localhost:3000.
      # Open http://localhost:3000 in your browser.
      - "3000:80"
    depends_on:
      # Ensures the api container starts before web. Note: this only controls
      # start order, not readiness. The React app handles API unavailability
      # gracefully with a loading/error state.
      - api
```

- [ ] **Step 2: Start the full stack**

```bash
docker compose up --build
```

`--build` forces Docker to rebuild both images from source. On subsequent runs you can omit it if the code hasn't changed.

Wait for both services to report ready:
```
api-1  | Started ApiApplication in 2.x seconds
web-1  | ... nginx ready
```

- [ ] **Step 3: Smoke-test the full stack**

Open `http://localhost:3000` in your browser. You should see the dashboard with all four cards populated:
- **APP:** cicd-platform-api
- **VERSION:** 0.0.1-SNAPSHOT
- **JAVA:** 21.x.x
- **STATUS:** UP (in green)

Test the nginx proxy directly:
```bash
curl -s http://localhost:3000/api/info
```
Expected: `{"app":"cicd-platform-api","java":"21.x.x","status":"UP","version":"0.0.1-SNAPSHOT"}`

Test the API directly (bypassing nginx):
```bash
curl -s http://localhost:8080/api/info
```
Expected: same response.

- [ ] **Step 4: Stop the stack**

```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "docker(global): add Docker Compose to run api and web together"
```

---

## Task 13: Push both images to GHCR

**Prerequisites:** A GitHub Personal Access Token (PAT) with `write:packages` scope.

**Create the PAT:**
1. Go to github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Set expiration to 90 days, check `write:packages` (this also selects `read:packages`)
4. Copy the token — you won't see it again

- [ ] **Step 1: Authenticate Docker to GHCR**

```bash
echo YOUR_PAT_HERE | docker login ghcr.io -u SpencerTong --password-stdin
```

Expected: `Login Succeeded`

- [ ] **Step 2: Build and tag the API image for GHCR**

```bash
docker build -t ghcr.io/spencertong/cicd-platform-api:latest ./services/api
```

- [ ] **Step 3: Build and tag the Web image for GHCR**

```bash
docker build -t ghcr.io/spencertong/cicd-platform-web:latest ./services/web
```

- [ ] **Step 4: Push both images**

```bash
docker push ghcr.io/spencertong/cicd-platform-api:latest
docker push ghcr.io/spencertong/cicd-platform-web:latest
```

Expected for each push: progress bars followed by:
```
latest: digest: sha256:... size: ...
```

- [ ] **Step 5: Verify images are visible on GitHub**

Navigate to `https://github.com/SpencerTong?tab=packages` — both packages should appear.

- [ ] **Step 6: Final commit**

```bash
git commit --allow-empty -m "chore(global): Phase 1 complete — images pushed to GHCR"
```

---

## Definition of Done

- [ ] `services/api` Spring Boot app runs locally (`mvn spring-boot:run`)
- [ ] `services/api` Docker image builds and runs (`docker build` + `docker run`)
- [ ] `services/web` React app runs locally (`npm run dev`)
- [ ] `services/web` Docker image builds and runs
- [ ] `docker compose up` starts both services; browser at `localhost:3000` shows the dashboard with live data from the API
- [ ] Both images pushed to GHCR and visible at `github.com/SpencerTong?tab=packages`
