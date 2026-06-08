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

    @SuppressWarnings("unchecked")
    public Map<String, Object> statusFor(String sha) {
        Map<String, String> stages = new LinkedHashMap<>();
        // commit is done as soon as we have a sha (the deploy endpoint already committed).
        stages.put("commit", "done");

        // --- CI (ci-api.yml): build / test / scan / push from the run's steps ---
        Map<String, Object> ciRun = github.workflowRunForSha("ci-api.yml", sha);
        String runUrl = ciRun == null ? null : (String) ciRun.get("html_url");
        boolean ciDone = ciRun != null && "completed".equals(ciRun.get("status"));
        boolean ciFailed = ciDone && !"success".equals(ciRun.get("conclusion"));

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
            for (String s : List.of("test", "build", "scan", "push")) {
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
