package com.cicdplatform.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Loads only the web layer for MessageController.
// @Import pulls in the real MessageService — @WebMvcTest does not load @Service
// beans by default, and MessageController needs it constructed. We want the real
// one here so the test exercises the actual seeded message.txt read.
@WebMvcTest(MessageController.class)
@Import(MessageService.class)
class MessageControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void message_returnsSeededMessage() throws Exception {
        mockMvc.perform(get("/api/message"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello from the GitOps loop"));
    }
}
