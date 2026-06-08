# Phase 5 (Part 1) — Interactive GitOps Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive demo where a user types a message, the API commits it via the GitHub API, the full CI/CD + GitOps pipeline runs, and a live horizontal pipeline visualization with beginner explanations tracks every stage until the message appears in the running app.

**Architecture:** Spring Boot gains four endpoints — `GET /api/message`, `POST /api/deploy`, `GET /api/status?sha=`, plus existing `/api/info`. `/api/deploy` commits `message.txt` via the GitHub REST API (PAT from a k8s Secret). `/api/status` is **stateless** — it derives the 8 pipeline stages from the GitHub Actions API for the target SHA plus a live-message comparison, so it survives the API pod being replaced mid-rollout. The React app adds a deploy form, a horizontal animated pipeline, and a per-stage explainer panel, all driven by polling `/api/status`.

**Tech Stack:** Java 21 / Spring Boot 3.5 (`RestClient`, MockMvc), React 18 / Vite, Helm, Kubernetes Secrets, GitHub REST API

---

## File Map

```
services/api/
├── src/main/java/com/cicdplatform/api/
│   ├── MessageController.java     ← Task 1  (GET /api/message)
│   ├── MessageService.java        ← Task 1  (reads message.txt from classpath)
│   ├── GitHubClient.java          ← Task 2  (commit file, read workflow runs)
│   ├── DeployController.java      ← Task 3  (POST /api/deploy)
│   ├── DeployService.java         ← Task 3  (guard, lock, validate, commit)
│   ├── StatusController.java      ← Task 4  (GET /api/status?sha=)
│   ├── StatusService.java         ← Task 4  (stateless stage derivation)
│   └── DemoConfig.java            ← Task 2  (env-var config: token, repo, guard)
├── src/main/resources/
│   └── message.txt                ← Task 1  (the message, baked into the JAR)
└── src/test/java/com/cicdplatform/api/
    ├── MessageControllerTest.java ← Task 1
    ├── DeployServiceTest.java     ← Task 3
    └── StatusServiceTest.java     ← Task 4
helm/api/
├── templates/secret-ref... (env)  ← Task 5 (deployment.yaml env block)
└── values.yaml                    ← Task 5 (demo config values)
services/web/src/
├── App.jsx                        ← Task 6,7,8,9 (wire in the demo section)
├── api.js                         ← Task 6 (fetch helpers)
├── useStatus.js                   ← Task 6 (polling hook)
├── DeployForm.jsx                 ← Task 6
├── PipelineFlow.jsx               ← Task 7
├── StageExplainer.jsx             ← Task 8
└── demo.css                       ← Task 7,8 (demo styles)
```

---

## Task 1: message.txt + GET /api/message

**Files:**
- Create: `services/api/src/main/resources/message.txt`
- Create: `services/api/src/main/java/com/cicdplatform/api/MessageService.java`
- Create: `services/api/src/main/java/com/cicdplatform/api/MessageController.java`
- Create: `services/api/src/test/java/com/cicdplatform/api/MessageControllerTest.java`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git pull origin main
git checkout -b phase/5-interactive-demo
```

- [ ] **Step 2: Create `services/api/src/main/resources/message.txt`**

```
Hello from the GitOps loop
```

(Single line, no trailing newline needed. This file is baked into the JAR and is what the user's input will overwrite via a commit.)

- [ ] **Step 3: Write the failing test `MessageControllerTest.java`**

```java
package com.cicdplatform.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Loads only the web layer for MessageController.
// @Import pulls in the real MessageService — @WebMvcTest does not load @Service
// beans by default, and MessageController needs it constructed. We want the real
// one here so the test exercises the actual seeded message.txt read.
@WebMvcTest(MessageController.class)
@Import(MessageService.class)
class MessageControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void message_returnsSeededMessage() throws Exception {
        // The seeded message.txt contains "Hello from the GitOps loop".
        mockMvc.perform(get("/api/message"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello from the GitOps loop"));
    }
}
```

- [ ] **Step 4: Run the test, confirm it fails**

```bash
cd services/api && mvn test -Dtest=MessageControllerTest
```
Expected: FAIL — `MessageController` does not exist (compilation error).

- [ ] **Step 5: Create `MessageService.java`**

```java
package com.cicdplatform.api;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

// Reads the message baked into the JAR at build time (message.txt on the classpath).
// Because the message is part of the image, committing a new message.txt and
// rebuilding the image is what makes the user's input "go live" — the whole
// point of the demo. This service simply surfaces whatever this running pod has.
@Service
public class MessageService {

    public String currentMessage() {
        try {
            var resource = new ClassPathResource("message.txt");
            return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            // If the file is missing the image was built wrong — surface a clear default.
            return "(no message)";
        }
    }
}
```

- [ ] **Step 6: Create `MessageController.java`**

```java
package com.cicdplatform.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// GET /api/message — returns the message this pod is currently serving.
// The web UI displays this; once the GitOps loop rolls out a new pod with a
// new message.txt baked in, this endpoint returns the new value.
@RestController
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @GetMapping("/api/message")
    public Map<String, String> message() {
        return Map.of("message", messageService.currentMessage());
    }
}
```

- [ ] **Step 7: Run the test, confirm it passes**

```bash
cd services/api && mvn test -Dtest=MessageControllerTest
```
Expected: `Tests run: 1, Failures: 0, Errors: 0`

- [ ] **Step 8: Commit**

```bash
git add services/api/src/main/resources/message.txt \
        services/api/src/main/java/com/cicdplatform/api/MessageService.java \
        services/api/src/main/java/com/cicdplatform/api/MessageController.java \
        services/api/src/test/java/com/cicdplatform/api/MessageControllerTest.java
git commit -m "feat(api): add message.txt and GET /api/message endpoint"
```

---

## Task 2: GitHubClient + DemoConfig

**Files:**
- Create: `services/api/src/main/java/com/cicdplatform/api/DemoConfig.java`
- Create: `services/api/src/main/java/com/cicdplatform/api/GitHubClient.java`

- [ ] **Step 1: Create `DemoConfig.java`**

```java
package com.cicdplatform.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// Configuration for the interactive demo, sourced from environment variables.
// In Kubernetes these come from a Secret (token) and the Helm values (repo, guard).
// Defaults are dev-friendly so the app still boots locally without the demo wired up.
@Component
public class DemoConfig {

    // Fine-grained GitHub PAT with contents:write + actions:read on this repo only.
    @Value("${GITHUB_TOKEN:}")
    private String githubToken;

    // "owner/repo", e.g. SpencerTong/cicd-platform-project
    @Value("${GITHUB_REPO:SpencerTong/cicd-platform-project}")
    private String githubRepo;

    // Non-secret shared string the frontend must send to use POST /api/deploy.
    // This is a casual guard against random POSTs, NOT real authentication.
    @Value("${DEPLOY_GUARD_TOKEN:local-demo}")
    private String guardToken;

    public String githubToken() { return githubToken; }
    public String githubRepo()  { return githubRepo; }
    public String guardToken()  { return guardToken; }
}
```

- [ ] **Step 2: Create `GitHubClient.java`**

```java
package com.cicdplatform.api;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Base64;
import java.util.List;
import java.util.Map;

// Thin wrapper over the GitHub REST API using Spring's built-in RestClient.
// Two responsibilities:
//   1. commitMessage(): update services/api/src/main/resources/message.txt on main
//   2. workflowRunForSha(): read the most recent run of a workflow file for a commit
@Component
public class GitHubClient {

    private static final String PATH = "services/api/src/main/resources/message.txt";
    private final DemoConfig config;
    private final RestClient http;

    public GitHubClient(DemoConfig config) {
        this.config = config;
        this.http = RestClient.builder()
                .baseUrl("https://api.github.com")
                .build();
    }

    private RestClient.RequestHeadersSpec<?> auth(RestClient.RequestHeadersSpec<?> spec) {
        return spec
                .header("Authorization", "Bearer " + config.githubToken())
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28");
    }

    // Commit a new message by updating message.txt on main.
    // GitHub's Contents API requires the current file's blob SHA to update it,
    // so we GET the file first, then PUT the new base64 content with that SHA.
    // Returns the new commit SHA.
    @SuppressWarnings("unchecked")
    public String commitMessage(String newMessage) {
        String repo = config.githubRepo();

        // 1. Get the current file to obtain its blob sha.
        Map<String, Object> current = (Map<String, Object>) auth(
                http.get().uri("/repos/{repo}/contents/{path}", repo, PATH)
        ).retrieve().body(Map.class);
        String blobSha = (String) current.get("sha");

        // 2. PUT the updated content (base64-encoded), referencing the blob sha.
        String encoded = Base64.getEncoder()
                .encodeToString((newMessage + "\n").getBytes());
        Map<String, Object> body = Map.of(
                "message", "demo: deploy message via interactive UI",
                "content", encoded,
                "sha", blobSha,
                "branch", "main"
        );
        Map<String, Object> resp = (Map<String, Object>) auth(
                http.put().uri("/repos/{repo}/contents/{path}", repo, PATH)
                        .body(body)
        ).retrieve().body(Map.class);

        Map<String, Object> commit = (Map<String, Object>) resp.get("commit");
        return (String) commit.get("sha");
    }

    // Return the most recent workflow run for a given workflow file + head SHA,
    // or null if none exists yet. Used by StatusService to derive stage state.
    @SuppressWarnings("unchecked")
    public Map<String, Object> workflowRunForSha(String workflowFile, String headSha) {
        Map<String, Object> resp = (Map<String, Object>) auth(
                http.get().uri("/repos/{repo}/actions/workflows/{wf}/runs?head_sha={sha}&per_page=1",
                        config.githubRepo(), workflowFile, headSha)
        ).retrieve().body(Map.class);
        List<Map<String, Object>> runs = (List<Map<String, Object>>) resp.get("workflow_runs");
        return (runs == null || runs.isEmpty()) ? null : runs.get(0);
    }

    // Return the jobs (with steps) for a given run id. Used to map CI steps to stages.
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> jobsForRun(long runId) {
        Map<String, Object> resp = (Map<String, Object>) auth(
                http.get().uri("/repos/{repo}/actions/runs/{id}/jobs", config.githubRepo(), runId)
        ).retrieve().body(Map.class);
        List<Map<String, Object>> jobs = (List<Map<String, Object>>) resp.get("jobs");
        return jobs == null ? List.of() : jobs;
    }

    // Read message.txt content at a specific commit ref (used to know the target message).
    @SuppressWarnings("unchecked")
    public String messageAtRef(String ref) {
        Map<String, Object> resp = (Map<String, Object>) auth(
                http.get().uri("/repos/{repo}/contents/{path}?ref={ref}", config.githubRepo(), PATH, ref)
        ).retrieve().body(Map.class);
        String encoded = ((String) resp.get("content")).replaceAll("\\s", "");
        return new String(Base64.getDecoder().decode(encoded)).trim();
    }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd services/api && mvn compile
```
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit**

```bash
git add services/api/src/main/java/com/cicdplatform/api/DemoConfig.java \
        services/api/src/main/java/com/cicdplatform/api/GitHubClient.java
git commit -m "feat(api): add DemoConfig and GitHubClient for GitHub REST API"
```

---

## Task 3: POST /api/deploy (DeployService + DeployController)

**Files:**
- Create: `services/api/src/main/java/com/cicdplatform/api/DeployService.java`
- Create: `services/api/src/main/java/com/cicdplatform/api/DeployController.java`
- Create: `services/api/src/test/java/com/cicdplatform/api/DeployServiceTest.java`

- [ ] **Step 1: Write the failing test `DeployServiceTest.java`**

```java
package com.cicdplatform.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeployServiceTest {

    private GitHubClient github;
    private DemoConfig config;
    private DeployService service;

    @BeforeEach
    void setup() {
        github = mock(GitHubClient.class);
        config = mock(DemoConfig.class);
        when(config.guardToken()).thenReturn("secret");
        when(github.commitMessage(anyString())).thenReturn("abc123");
        service = new DeployService(github, config);
    }

    @Test
    void rejectsBadGuardToken() {
        var ex = assertThrows(DeployService.GuardException.class,
                () -> service.deploy("hello", "wrong-token"));
        assertNotNull(ex);
    }

    @Test
    void rejectsBlankMessage() {
        assertThrows(IllegalArgumentException.class,
                () -> service.deploy("   ", "secret"));
    }

    @Test
    void rejectsTooLongMessage() {
        String tooLong = "x".repeat(101);
        assertThrows(IllegalArgumentException.class,
                () -> service.deploy(tooLong, "secret"));
    }

    @Test
    void commitsAndReturnsSha() {
        String sha = service.deploy("hello world", "secret");
        assertEquals("abc123", sha);
        verify(github).commitMessage("hello world");
    }

    @Test
    void sanitizesMessage() {
        // Newlines and control chars are stripped so the commit content stays one clean line.
        service.deploy("hello\nworld\t!", "secret");
        verify(github).commitMessage("hello world !".replace("  ", " "));
    }
}
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd services/api && mvn test -Dtest=DeployServiceTest
```
Expected: FAIL — `DeployService` does not exist.

- [ ] **Step 3: Create `DeployService.java`**

```java
package com.cicdplatform.api;

import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicBoolean;

// Handles POST /api/deploy: validate the guard token, sanitize + bound the message,
// enforce a single in-flight deploy, then commit via GitHubClient.
//
// The in-flight lock is in-memory and intentionally best-effort: it only needs to
// hold for the brief moment of the commit (which returns in well under a second),
// long before ArgoCD replaces this pod. Status tracking does NOT rely on it
// (see StatusService — that is fully stateless).
@Service
public class DeployService {

    // Thrown when the guard token doesn't match. Mapped to HTTP 403 by the controller.
    public static class GuardException extends RuntimeException {}
    // Thrown when a deploy is already running. Mapped to HTTP 409 by the controller.
    public static class InFlightException extends RuntimeException {}

    private static final int MAX_LEN = 100;
    private final GitHubClient github;
    private final DemoConfig config;
    private final AtomicBoolean inFlight = new AtomicBoolean(false);

    public DeployService(GitHubClient github, DemoConfig config) {
        this.github = github;
        this.config = config;
    }

    public String deploy(String rawMessage, String guardToken) {
        if (!config.guardToken().equals(guardToken)) {
            throw new GuardException();
        }
        String message = sanitize(rawMessage);
        if (message.isBlank()) {
            throw new IllegalArgumentException("message must not be blank");
        }
        if (message.length() > MAX_LEN) {
            throw new IllegalArgumentException("message too long (max " + MAX_LEN + ")");
        }
        if (!inFlight.compareAndSet(false, true)) {
            throw new InFlightException();
        }
        try {
            return github.commitMessage(message);
        } finally {
            inFlight.set(false);
        }
    }

    // Collapse all whitespace (including newlines/tabs) to single spaces and trim.
    // Keeps the committed message.txt a single clean line and avoids injection of
    // control characters into the file.
    private String sanitize(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("\\s+", " ").trim();
    }
}
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
cd services/api && mvn test -Dtest=DeployServiceTest
```
Expected: `Tests run: 5, Failures: 0, Errors: 0`. (The `sanitizesMessage` assertion expects collapsed whitespace `"hello world !"`.)

- [ ] **Step 5: Create `DeployController.java`**

```java
package com.cicdplatform.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

// POST /api/deploy — accepts { message, guardToken }, commits the new message,
// returns { sha }. The frontend uses the sha to track the pipeline via /api/status.
@RestController
public class DeployController {

    private final DeployService deployService;

    public DeployController(DeployService deployService) {
        this.deployService = deployService;
    }

    @PostMapping("/api/deploy")
    public Map<String, String> deploy(@RequestBody Map<String, String> body) {
        String message = body.get("message");
        String guardToken = body.get("guardToken");
        try {
            String sha = deployService.deploy(message, guardToken);
            return Map.of("sha", sha);
        } catch (DeployService.GuardException e) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "invalid guard token");
        } catch (DeployService.InFlightException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "a deploy is already in progress");
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
```

- [ ] **Step 6: Run the full API test suite**

```bash
cd services/api && mvn test
```
Expected: all tests pass (InfoController + MessageController + DeployService).

- [ ] **Step 7: Commit**

```bash
git add services/api/src/main/java/com/cicdplatform/api/DeployService.java \
        services/api/src/main/java/com/cicdplatform/api/DeployController.java \
        services/api/src/test/java/com/cicdplatform/api/DeployServiceTest.java
git commit -m "feat(api): add POST /api/deploy with guard, lock, and validation"
```

---

## Task 4: GET /api/status?sha= (StatusService — stateless)

**Files:**
- Create: `services/api/src/main/java/com/cicdplatform/api/StatusService.java`
- Create: `services/api/src/main/java/com/cicdplatform/api/StatusController.java`
- Create: `services/api/src/test/java/com/cicdplatform/api/StatusServiceTest.java`

- [ ] **Step 1: Write the failing test `StatusServiceTest.java`**

```java
package com.cicdplatform.api;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StatusServiceTest {

    @Test
    void allPendingWhenNoCiRunYet() {
        GitHubClient github = mock(GitHubClient.class);
        MessageService message = mock(MessageService.class);
        when(github.workflowRunForSha(eq("ci-api.yml"), anyString())).thenReturn(null);
        when(github.messageAtRef(anyString())).thenReturn("new msg");
        when(message.currentMessage()).thenReturn("old msg");

        StatusService svc = new StatusService(github, message);
        Map<String, Object> status = svc.statusFor("sha1");

        Map<String, String> stages = (Map<String, String>) status.get("stages");
        assertEquals("done", stages.get("commit"));     // commit always done once sha exists
        assertEquals("pending", stages.get("build"));   // no CI run yet
        assertEquals("pending", stages.get("live"));
    }

    @Test
    void liveDoneWhenMessageMatchesTarget() {
        GitHubClient github = mock(GitHubClient.class);
        MessageService message = mock(MessageService.class);
        // CI run completed successfully.
        when(github.workflowRunForSha(eq("ci-api.yml"), anyString()))
                .thenReturn(Map.of("id", 1L, "status", "completed", "conclusion", "success"));
        when(github.jobsForRun(1L)).thenReturn(List.of(Map.of(
                "steps", List.of(
                        Map.of("name", "Run tests", "status", "completed", "conclusion", "success"),
                        Map.of("name", "Build Docker image", "status", "completed", "conclusion", "success"),
                        Map.of("name", "Scan image with Trivy", "status", "completed", "conclusion", "success"),
                        Map.of("name", "Push to GHCR", "status", "completed", "conclusion", "success")
                )
        )));
        when(github.workflowRunForSha(eq("cd.yml"), anyString()))
                .thenReturn(Map.of("id", 2L, "status", "completed", "conclusion", "success"));
        when(github.messageAtRef("sha1")).thenReturn("new msg");
        when(message.currentMessage()).thenReturn("new msg"); // pod now serves the new message

        StatusService svc = new StatusService(github, message);
        Map<String, Object> status = svc.statusFor("sha1");

        Map<String, String> stages = (Map<String, String>) status.get("stages");
        assertEquals("done", stages.get("scan"));
        assertEquals("done", stages.get("cd"));
        assertEquals("done", stages.get("live"));
        assertEquals("new msg", status.get("currentMessage"));
    }
}
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd services/api && mvn test -Dtest=StatusServiceTest
```
Expected: FAIL — `StatusService` does not exist.

- [ ] **Step 3: Create `StatusService.java`**

```java
package com.cicdplatform.api;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Derives the 8 pipeline stages for a target commit SHA from external sources only:
//   - GitHub Actions runs/jobs for ci-api.yml and cd.yml (build/test/scan/push/cd)
//   - comparison of the live pod's message to the message committed at the target SHA (live)
//
// STATELESS BY DESIGN: holds no per-deploy fields. The API pod is replaced mid-loop,
// so any pod (old or new) must answer identically. Everything is computed on demand
// from the SHA the frontend passes in.
@Service
public class StatusService {

    private final GitHubClient github;
    private final MessageService message;

    public StatusService(GitHubClient github, MessageService message) {
        this.github = github;
        this.message = message;
    }

    public Map<String, Object> statusFor(String sha) {
        Map<String, String> stages = new LinkedHashMap<>();
        // commit is done as soon as we have a sha (the deploy endpoint already committed).
        stages.put("commit", "done");

        // --- CI (ci-api.yml): build / test / scan / push from the run's steps ---
        Map<String, Object> ciRun = github.workflowRunForSha("ci-api.yml", sha);
        String runUrl = ciRun == null ? null : (String) ciRun.get("html_url");
        boolean ciDone = ciRun != null && "completed".equals(ciRun.get("status"));
        boolean ciFailed = ciDone && !"success".equals(ciRun.get("conclusion"));

        // Map specific CI step names to our stages. Names match ci-api.yml step names.
        stages.put("build", "pending");
        stages.put("test",  "pending");
        stages.put("scan",  "pending");
        stages.put("push",  "pending");
        if (ciRun != null) {
            long runId = ((Number) ciRun.get("id")).longValue();
            for (Map<String, Object> job : github.jobsForRun(runId)) {
                List<Map<String, Object>> steps = (List<Map<String, Object>>) job.get("steps");
                if (steps == null) continue;
                for (Map<String, Object> step : steps) {
                    String name = ((String) step.get("name")).toLowerCase();
                    String state = stepState(step);
                    if (name.contains("test"))        stages.put("test", state);
                    else if (name.contains("build"))  stages.put("build", state);
                    else if (name.contains("trivy") || name.contains("scan")) stages.put("scan", state);
                    else if (name.contains("push"))   stages.put("push", state);
                }
            }
        }

        // --- CD (cd.yml): commits the new tag for ArgoCD ---
        Map<String, Object> cdRun = github.workflowRunForSha("cd.yml", sha);
        stages.put("cd", runState(cdRun));

        // --- ArgoCD + Live: compare the live pod's message to the target commit's message ---
        // Without the optional ArgoCD token we infer the cluster stages from the message:
        //   argocd "running" once cd is done; "done" once the new message is live.
        String targetMessage = safeMessageAtRef(sha);
        String liveMessage = message.currentMessage();
        boolean live = targetMessage != null && targetMessage.equals(liveMessage);

        boolean cdDone = "done".equals(stages.get("cd"));
        stages.put("argocd", live ? "done" : (cdDone ? "running" : "pending"));
        stages.put("live", live ? "done" : "pending");

        // If CI failed, mark the first non-done CI stage failed for a clear visual.
        if (ciFailed) {
            for (String s : List.of("build", "test", "scan", "push")) {
                if (!"done".equals(stages.get(s))) { stages.put(s, "failed"); break; }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stages", stages);
        result.put("currentMessage", liveMessage);
        result.put("targetSha", sha);
        result.put("runUrl", runUrl);
        return result;
    }

    // Map a GitHub step's status/conclusion to our pending|running|done|failed vocabulary.
    private String stepState(Map<String, Object> step) {
        String status = (String) step.get("status");
        String conclusion = (String) step.get("conclusion");
        if ("completed".equals(status)) {
            return "success".equals(conclusion) ? "done" : "failed";
        }
        if ("in_progress".equals(status) || "queued".equals(status)) return "running";
        return "pending";
    }

    // Map a whole workflow run to a single stage state.
    private String runState(Map<String, Object> run) {
        if (run == null) return "pending";
        if ("completed".equals(run.get("status"))) {
            return "success".equals(run.get("conclusion")) ? "done" : "failed";
        }
        return "running";
    }

    // The target message may not be readable for a moment right after the commit;
    // treat read failures as "not yet known" rather than erroring the whole status.
    private String safeMessageAtRef(String sha) {
        try {
            return github.messageAtRef(sha);
        } catch (Exception e) {
            return null;
        }
    }
}
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
cd services/api && mvn test -Dtest=StatusServiceTest
```
Expected: `Tests run: 2, Failures: 0, Errors: 0`

- [ ] **Step 5: Create `StatusController.java`**

```java
package com.cicdplatform.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// GET /api/status?sha=<target> — stateless pipeline status for the given commit.
// The frontend remembers the sha returned by /api/deploy and polls this every ~2s.
@RestController
public class StatusController {

    private final StatusService statusService;

    public StatusController(StatusService statusService) {
        this.statusService = statusService;
    }

    @GetMapping("/api/status")
    public Map<String, Object> status(@RequestParam String sha) {
        return statusService.statusFor(sha);
    }
}
```

- [ ] **Step 6: Run the full suite + commit**

```bash
cd services/api && mvn test
git add services/api/src/main/java/com/cicdplatform/api/StatusService.java \
        services/api/src/main/java/com/cicdplatform/api/StatusController.java \
        services/api/src/test/java/com/cicdplatform/api/StatusServiceTest.java
git commit -m "feat(api): add stateless GET /api/status?sha= pipeline aggregation"
```

---

## Task 5: Helm chart — inject the demo Secret + config

**Files:**
- Modify: `helm/api/values.yaml`
- Modify: `helm/api/templates/deployment.yaml`

- [ ] **Step 1: Add demo config to `helm/api/values.yaml`**

Append:
```yaml
# Interactive demo configuration (Phase 5).
# githubToken comes from a pre-created Kubernetes Secret (NOT stored in Git).
# guardToken is a non-secret shared string the frontend sends; repo is owner/repo.
demo:
  enabled: true
  githubRepo: SpencerTong/cicd-platform-project
  guardToken: local-demo
  # Name of the pre-created Secret holding key GITHUB_TOKEN.
  secretName: api-demo-secret
```

- [ ] **Step 2: Add env vars to the container in `helm/api/templates/deployment.yaml`**

Inside the container spec (after `imagePullPolicy`, before `ports`), add:
```yaml
          # Interactive demo env vars (Phase 5).
          # GITHUB_TOKEN is pulled from a Secret so the credential never lives in Git
          # or the image. The repo + guard token are non-secret config from values.yaml.
          {{- if .Values.demo.enabled }}
          env:
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.demo.secretName }}
                  key: GITHUB_TOKEN
            - name: GITHUB_REPO
              value: {{ .Values.demo.githubRepo | quote }}
            - name: DEPLOY_GUARD_TOKEN
              value: {{ .Values.demo.guardToken | quote }}
          {{- end }}
```

- [ ] **Step 3: Lint the chart**

```bash
helm lint helm/api/
```
Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 4: Render the template to verify env block appears**

```bash
helm template api helm/api/ | grep -A2 "GITHUB_TOKEN"
```
Expected: shows the `secretKeyRef` referencing `api-demo-secret`.

- [ ] **Step 5: Commit**

```bash
git add helm/api/values.yaml helm/api/templates/deployment.yaml
git commit -m "helm(api): inject demo GitHub token Secret and config as env vars"
```

---

## Task 6: Create the Kubernetes Secret + GitHub token (manual)

**⚠️ Manual task — requires you to create a GitHub token and run kubectl.**

- [ ] **Step 1: Create a fine-grained GitHub PAT**

On GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token.
- Repository access: only `SpencerTong/cicd-platform-project`
- Permissions: **Contents: Read and write**, **Actions: Read-only**
- Copy the token (starts with `github_pat_`).

- [ ] **Step 2: Create the Secret in the cicd namespace**

```bash
kubectl create secret generic api-demo-secret \
  --namespace cicd \
  --from-literal=GITHUB_TOKEN=github_pat_YOUR_TOKEN_HERE
```
Expected: `secret/api-demo-secret created`

- [ ] **Step 3: Verify the Secret exists**

```bash
kubectl get secret api-demo-secret -n cicd
```
Expected: shows the secret with 1 data key.

---

## Task 7: Frontend — DeployForm + useStatus hook + api helpers

**Files:**
- Create: `services/web/src/api.js`
- Create: `services/web/src/useStatus.js`
- Create: `services/web/src/DeployForm.jsx`
- Modify: `services/web/src/App.jsx`

- [ ] **Step 1: Create `services/web/src/api.js`**

```js
// Small fetch helpers for the demo API. All requests go to the same origin —
// nginx proxies /api/* to the Spring Boot service (same pattern as Phase 1+).

// The guard token is NOT a secret — it's a casual bar against random POSTs.
// It must match DEPLOY_GUARD_TOKEN configured on the API (Helm values).
export const GUARD_TOKEN = 'local-demo'

export async function getMessage() {
  const res = await fetch('/api/message')
  if (!res.ok) throw new Error(`message HTTP ${res.status}`)
  return res.json()
}

export async function deploy(message) {
  const res = await fetch('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, guardToken: GUARD_TOKEN }),
  })
  if (res.status === 409) throw new Error('A deploy is already in progress — wait for it to finish.')
  if (!res.ok) throw new Error(`deploy HTTP ${res.status}`)
  return res.json() // { sha }
}

export async function getStatus(sha) {
  const res = await fetch(`/api/status?sha=${encodeURIComponent(sha)}`)
  if (!res.ok) throw new Error(`status HTTP ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Create `services/web/src/useStatus.js`**

```js
import { useState, useEffect, useRef } from 'react'
import { getStatus } from './api'

// Polls GET /api/status?sha= every 2s while tracking a deploy.
// Stops when the 'live' stage is done, on a failed stage, or after a 12-min timeout.
// Tolerant of transient errors: the API pod is briefly unavailable during the
// ArgoCD rollout, so a failed poll is ignored and retried, not treated as fatal.
const POLL_MS = 2000
const TIMEOUT_MS = 12 * 60 * 1000

export function useStatus(sha) {
  const [status, setStatus] = useState(null)
  const [timedOut, setTimedOut] = useState(false)
  const startRef = useRef(null)

  useEffect(() => {
    if (!sha) return
    startRef.current = Date.now()
    setTimedOut(false)
    let active = true

    async function tick() {
      if (!active) return
      try {
        const s = await getStatus(sha)
        if (!active) return
        setStatus(s)
        const stages = s.stages || {}
        const done = stages.live === 'done'
        const failed = Object.values(stages).includes('failed')
        if (done || failed) return // stop polling
      } catch (e) {
        // transient (pod rolling) — ignore and keep polling
      }
      if (Date.now() - startRef.current > TIMEOUT_MS) {
        setTimedOut(true)
        return
      }
      setTimeout(tick, POLL_MS)
    }
    tick()
    return () => { active = false }
  }, [sha])

  return { status, timedOut }
}
```

- [ ] **Step 3: Create `services/web/src/DeployForm.jsx`**

```jsx
import { useState } from 'react'
import { deploy } from './api'

// Input + Deploy button. On submit, POSTs the message, gets the commit sha,
// and hands it up to the parent (App) which starts tracking the pipeline.
export default function DeployForm({ onDeployed, disabled }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { sha } = await deploy(message.trim())
      onDeployed(sha, message.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="deploy-form" onSubmit={handleSubmit}>
      <input
        className="deploy-input"
        type="text"
        maxLength={100}
        placeholder="Type a message to deploy through the pipeline…"
        value={message}
        onChange={e => setMessage(e.target.value)}
        disabled={disabled || submitting}
      />
      <button className="deploy-button" type="submit" disabled={disabled || submitting || !message.trim()}>
        {submitting ? 'Committing…' : 'Deploy'}
      </button>
      {error && <p className="deploy-error">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Wire the demo section into `App.jsx`**

Replace the contents of `services/web/src/App.jsx` with:
```jsx
import { useState, useEffect } from 'react'
import './App.css'
import './demo.css'
import { getMessage } from './api'
import DeployForm from './DeployForm'
import PipelineFlow from './PipelineFlow'
import StageExplainer from './StageExplainer'
import { useStatus } from './useStatus'

export default function App() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [sha, setSha] = useState(null)
  const { status, timedOut } = useStatus(sha)

  useEffect(() => {
    fetch('/api/info')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(setInfo)
      .catch(err => setError(err.message))
  }, [])

  const stages = status?.stages || {}
  const liveMessage = status?.currentMessage
  const tracking = !!sha && stages.live !== 'done' && !Object.values(stages).includes('failed') && !timedOut

  return (
    <div className="container">
      <h1>CI/CD Platform</h1>
      <p className="subtitle">Live data from the Spring Boot API</p>

      {error && <p className="error">Could not reach the API: {error}</p>}
      {!info && !error && <p className="loading">Connecting to API...</p>}

      {info && (
        <div className="cards">
          <Card label="APP"     value={info.app} />
          <Card label="VERSION" value={info.version} />
          <Card label="JAVA"    value={info.java} />
          <Card label="STATUS"  value={info.status} highlight />
        </div>
      )}

      {/* ---- Interactive GitOps demo ---- */}
      <div className="demo">
        <h2>Try the GitOps loop</h2>
        <p className="subtitle">
          Type a message and watch it travel through the entire pipeline — build, test,
          scan, deploy, and sync — until it goes live in the cluster.
        </p>
        <DeployForm onDeployed={(s) => setSha(s)} disabled={tracking} />
        {sha && <PipelineFlow stages={stages} />}
        {sha && <StageExplainer stages={stages} timedOut={timedOut} runUrl={status?.runUrl} />}
        {sha && stages.live === 'done' && (
          <p className="demo-live">✓ Live: "{liveMessage}"</p>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, highlight }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${highlight ? ' card-value--up' : ''}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 5: Verify the build (PipelineFlow/StageExplainer/demo.css come next — create empty stubs so it compiles)**

Create temporary stubs so this task builds on its own:
```bash
cd services/web
printf "export default function PipelineFlow(){return null}\n" > src/PipelineFlow.jsx
printf "export default function StageExplainer(){return null}\n" > src/StageExplainer.jsx
printf "/* demo styles added in later tasks */\n" > src/demo.css
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add services/web/src/api.js services/web/src/useStatus.js \
        services/web/src/DeployForm.jsx services/web/src/App.jsx \
        services/web/src/PipelineFlow.jsx services/web/src/StageExplainer.jsx \
        services/web/src/demo.css
git commit -m "feat(web): add deploy form, status polling hook, and demo wiring"
```

---

## Task 8: Frontend — PipelineFlow (horizontal visualization)

**Files:**
- Modify: `services/web/src/PipelineFlow.jsx`
- Modify: `services/web/src/demo.css`

- [ ] **Step 1: Replace `services/web/src/PipelineFlow.jsx`**

```jsx
// Horizontal pipeline visualization. Eight nodes connected left-to-right;
// each reflects its stage state from /api/status. Connectors fill green as
// the flow progresses. Purely presentational — all state comes from props.
const STAGES = [
  ['commit', 'Commit'],
  ['build',  'Build'],
  ['test',   'Test'],
  ['scan',   'Scan'],
  ['push',   'Push'],
  ['cd',     'Deploy'],
  ['argocd', 'ArgoCD'],
  ['live',   'Live'],
]

function symbol(state) {
  if (state === 'done') return '✓'
  if (state === 'failed') return '✗'
  if (state === 'running') return '●'
  return '○'
}

export default function PipelineFlow({ stages }) {
  return (
    <div className="flow">
      {STAGES.map(([key, label], i) => {
        const state = stages[key] || 'pending'
        return (
          <div className="flow-node-wrap" key={key}>
            {i > 0 && <div className={`flow-connector flow-${stages[STAGES[i - 1][0]] || 'pending'}`} />}
            <div className="flow-node-inner">
              <div className={`flow-node flow-${state}`}>{symbol(state)}</div>
              <div className="flow-label">{label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Replace `services/web/src/demo.css`**

```css
.demo {
  margin-top: 40px;
  border-top: 1px solid #e2e8f0;
  padding-top: 28px;
}

.demo h2 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }

.deploy-form { display: flex; gap: 8px; margin: 16px 0; }
.deploy-input {
  flex: 1; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 6px;
  font-size: 14px;
}
.deploy-button {
  padding: 9px 18px; border: none; border-radius: 6px; background: #6366f1;
  color: #fff; font-weight: 600; font-size: 14px; cursor: pointer;
}
.deploy-button:disabled { background: #c7d2fe; cursor: not-allowed; }
.deploy-error { color: #dc2626; font-size: 13px; }

/* Horizontal pipeline flow */
.flow { display: flex; align-items: flex-start; margin: 24px 0; }
.flow-node-wrap { display: flex; align-items: center; flex: 1; }
.flow-node-wrap:last-child { flex: 0; }
.flow-node-inner { display: flex; flex-direction: column; align-items: center; width: 48px; }
.flow-node {
  width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; font-size: 15px; font-weight: 700;
  background: #f1f5f9; border: 1px solid #cbd5e1; color: #94a3b8;
}
.flow-label { font-size: 10px; color: #64748b; margin-top: 6px; text-align: center; }
.flow-connector { flex: 1; height: 2px; background: #cbd5e1; margin: 0 2px; }

/* state colours */
.flow-node.flow-done { background: #16a34a; border-color: #16a34a; color: #fff; }
.flow-node.flow-running { background: #2563eb; border-color: #2563eb; color: #fff; animation: pulse 1.1s ease-in-out infinite; }
.flow-node.flow-failed { background: #dc2626; border-color: #dc2626; color: #fff; }
.flow-connector.flow-done { background: #16a34a; }

@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }

.demo-live {
  margin-top: 16px; font-weight: 700; color: #16a34a; font-size: 15px;
}
.explainer {
  margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 14px 16px;
}
.explainer-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; margin-bottom: 6px; }
.explainer-body { font-size: 14px; color: #334155; line-height: 1.5; }
.explainer-link { font-size: 12px; color: #6366f1; margin-top: 8px; display: inline-block; }
```

- [ ] **Step 3: Build to verify**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/PipelineFlow.jsx services/web/src/demo.css
git commit -m "feat(web): add horizontal pipeline flow visualization"
```

---

## Task 9: Frontend — StageExplainer (beginner copy)

**Files:**
- Modify: `services/web/src/StageExplainer.jsx`

- [ ] **Step 1: Replace `services/web/src/StageExplainer.jsx`**

```jsx
// Beginner-facing explainer. Shows the currently-active stage's plain-English
// description: what is happening and why it exists in a CI/CD pipeline.
// The copy doubles as raw material for the blog post.
const COPY = {
  commit: ['Commit', 'Your message was committed to Git. In GitOps, Git is the single source of truth — every change starts as a commit, which makes the whole history auditable and reversible.'],
  build:  ['Build', 'GitHub Actions is compiling the app and packaging it into a Docker image — a self-contained, frozen snapshot that runs identically everywhere.'],
  test:   ['Test', 'Automated tests run against the new code. If any fail, the pipeline stops here and nothing ships — this is how CI catches mistakes before they reach users.'],
  scan:   ['Security Scan', 'Trivy inspects the built image for known vulnerabilities (CVEs) in its OS packages and libraries. Catching them now — before shipping — is called "shift-left" security.'],
  push:   ['Push', 'The verified image is pushed to the container registry (GHCR), tagged with the exact commit SHA so we always know precisely what code is in it.'],
  cd:     ['Deploy (CD)', "The CD pipeline records the new image tag in the Helm chart's values and commits it back to Git. It doesn't touch the cluster directly — it just updates the desired state."],
  argocd: ['ArgoCD Sync', 'ArgoCD, running inside the cluster, notices Git changed and reconciles the cluster to match — pulling the new image and rolling out a new pod. No one ran a deploy command.'],
  live:   ['Live', 'The new pod is serving traffic. The message you typed traveled through the entire pipeline and is now live in the cluster — the platform updated itself.'],
}

const ORDER = ['commit', 'build', 'test', 'scan', 'push', 'cd', 'argocd', 'live']

export default function StageExplainer({ stages, timedOut, runUrl }) {
  if (timedOut) {
    return (
      <div className="explainer">
        <div className="explainer-title">Taking longer than expected</div>
        <div className="explainer-body">
          The pipeline is still running. You can follow it on GitHub Actions.
        </div>
        {runUrl && <a className="explainer-link" href={runUrl} target="_blank" rel="noreferrer">View the run →</a>}
      </div>
    )
  }

  // Find a failed stage first; otherwise the running stage; otherwise the last done stage.
  const failed = ORDER.find(k => stages[k] === 'failed')
  const running = ORDER.find(k => stages[k] === 'running')
  const lastDone = [...ORDER].reverse().find(k => stages[k] === 'done')
  const activeKey = failed || running || lastDone || 'commit'
  const [title, body] = COPY[activeKey]

  return (
    <div className="explainer">
      <div className="explainer-title">
        {failed ? `${title} — failed` : title}
      </div>
      <div className="explainer-body">
        {failed
          ? 'This stage failed, so the pipeline stopped and nothing shipped — exactly what should happen when something is wrong. Check the run for details.'
          : body}
      </div>
      {runUrl && <a className="explainer-link" href={runUrl} target="_blank" rel="noreferrer">View on GitHub Actions →</a>}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

```bash
cd services/web && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/StageExplainer.jsx
git commit -m "feat(web): add beginner-friendly per-stage explainer panel"
```

---

## Task 10: Push, deploy through the pipeline, and verify end-to-end

This deploys the new API + web images via the existing CI/CD/ArgoCD loop, then runs the interactive demo for real.

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin phase/5-interactive-demo
gh pr create --title "feat: Phase 5 — interactive GitOps demo" --base main --head phase/5-interactive-demo \
  --body "Adds the interactive demo: type a message, watch it flow through the full pipeline. New API endpoints (/api/message, /api/deploy, /api/status) + horizontal pipeline visualization with per-stage explainers."
```

- [ ] **Step 2: Let CI run on the PR, then merge**

Both `CI — API` and `CI — Web` run (services/api and services/web changed). Confirm green, then merge the PR. The merge triggers CI on main → CD bumps tags → ArgoCD rolls out the new images.

- [ ] **Step 3: Wait for ArgoCD to roll out both new images**

```bash
git checkout main && git pull origin main
kubectl get applications -n argocd
```
Wait until `api` and `web` show `Synced` / `Healthy` on the new SHAs. Confirm pods rolled:
```bash
kubectl get pods -n cicd
```

- [ ] **Step 4: Verify the new endpoints are live**

```bash
curl -s http://api.cicd.local/api/message
```
Expected: `{"message":"Hello from the GitOps loop"}`

- [ ] **Step 5: Run the interactive demo in the browser**

Ensure the self-hosted runner is online (`cd ~/actions-runner && ./run.sh`) — the demo's commit will trigger CI/CD just like any other change.

Open `http://web.cicd.local`. In the "Try the GitOps loop" section, type a message (e.g., "GitOps is live") and click **Deploy**. Watch:
- The pipeline animates: Commit → Build → Test → Scan → Push → Deploy → ArgoCD → Live
- The explainer panel updates with each stage
- After ~8 minutes, "✓ Live: GitOps is live" appears and `curl http://api.cicd.local/api/message` returns the new message

- [ ] **Step 6: Confirm the loop closed**

```bash
curl -s http://api.cicd.local/api/message
```
Expected: returns the message you typed — proving the full interactive GitOps loop works end-to-end.

---

## Definition of Done

- [ ] `GET /api/message` returns the current message from `message.txt`
- [ ] `POST /api/deploy` commits the message via GitHub API, guarded + locked + validated
- [ ] `GET /api/status?sha=` reports accurate stage status, derived statelessly
- [ ] GitHub PAT stored as a k8s Secret, injected into the API pod
- [ ] Web UI: type a message → horizontal pipeline animates through all 8 stages live
- [ ] Per-stage explainer shows beginner-friendly what/why text as each stage runs
- [ ] On completion the new message displays as "✓ Live"; failures and timeouts handled gracefully
- [ ] Full end-to-end run verified: typed message reaches the cluster and displays
```
