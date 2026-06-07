package com.cicdplatform.api;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

// Reads the message baked into the JAR at build time (message.txt on the classpath).
// Because the message is part of the image, committing a new message.txt and
// rebuilding the image is what makes the user's input "go live" — the whole
// point of the demo. This service simply surfaces whatever this running pod has.
@Service
public class MessageService {

    public String currentMessage() {
        try {
            var resource = new ClassPathResource("message.txt");
            return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "(no message)";
        }
    }
}
