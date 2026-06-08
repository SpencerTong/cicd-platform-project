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
