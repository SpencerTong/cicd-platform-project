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
