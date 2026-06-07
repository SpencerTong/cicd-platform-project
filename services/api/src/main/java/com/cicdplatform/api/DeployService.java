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
