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
        service.deploy("hello\nworld\t!", "secret");
        verify(github).commitMessage("hello world !");
    }
}
