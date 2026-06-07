package com.cicdplatform.api;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StatusServiceTest {

    @Test
    @SuppressWarnings("unchecked")
    void allPendingWhenNoCiRunYet() {
        GitHubClient github = mock(GitHubClient.class);
        MessageService message = mock(MessageService.class);
        when(github.workflowRunForSha(eq("ci-api.yml"), anyString())).thenReturn(null);
        when(github.messageAtRef(anyString())).thenReturn("new msg");
        when(message.currentMessage()).thenReturn("old msg");

        StatusService svc = new StatusService(github, message);
        Map<String, Object> status = svc.statusFor("sha1");

        Map<String, String> stages = (Map<String, String>) status.get("stages");
        assertEquals("done", stages.get("commit"));
        assertEquals("pending", stages.get("build"));
        assertEquals("pending", stages.get("live"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void liveDoneWhenMessageMatchesTarget() {
        GitHubClient github = mock(GitHubClient.class);
        MessageService message = mock(MessageService.class);
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
        when(message.currentMessage()).thenReturn("new msg");

        StatusService svc = new StatusService(github, message);
        Map<String, Object> status = svc.statusFor("sha1");

        Map<String, String> stages = (Map<String, String>) status.get("stages");
        assertEquals("done", stages.get("scan"));
        assertEquals("done", stages.get("cd"));
        assertEquals("done", stages.get("live"));
        assertEquals("new msg", status.get("currentMessage"));
    }
}
