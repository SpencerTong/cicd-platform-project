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
