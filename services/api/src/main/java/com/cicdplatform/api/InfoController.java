package com.cicdplatform.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// @RestController marks this class as a Spring MVC controller where every method
// returns JSON (no view rendering). Combines @Controller and @ResponseBody.
@RestController
public class InfoController {

    // Phase 3 CD verification — this comment triggers CI → CD → cluster update.
    // GET /health — used by Kubernetes as a liveness probe in Phase 3.
    // CD loop verification attempt 2.
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
