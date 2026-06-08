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
    void message_returnsNonEmptyMessage() throws Exception {
        // Assert the CONTRACT (a non-empty message field), NOT a specific value.
        // The interactive demo rewrites message.txt on every deploy, so asserting
        // an exact string would make CI fail the moment anyone uses the demo —
        // the very pipeline this test gates. Test the shape, not the content.
        mockMvc.perform(get("/api/message"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }
}
