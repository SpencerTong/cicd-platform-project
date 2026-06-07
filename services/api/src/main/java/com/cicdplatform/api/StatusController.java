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
