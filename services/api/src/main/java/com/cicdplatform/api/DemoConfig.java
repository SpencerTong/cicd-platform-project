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
