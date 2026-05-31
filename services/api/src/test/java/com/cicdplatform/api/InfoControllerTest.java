package com.cicdplatform.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
// Wildcard import from MockMvcResultMatchers — gives us status(), isOk(), jsonPath(), etc.
// jsonPath() uses Jayway JsonPath syntax: "$.fieldName" reads the top-level JSON field.
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// @WebMvcTest loads only the web layer (controllers) — no database, no full context.
// It's faster than @SpringBootTest and focused on testing HTTP behaviour.
@WebMvcTest(InfoController.class)
class InfoControllerTest {

    // MockMvc lets us fire HTTP requests at the controller without starting a real server.
    @Autowired
    private MockMvc mockMvc;

    @Test
    void health_returnsStatusUp() throws Exception {
        // /health is a minimal liveness endpoint — just a status field, nothing else.
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void info_returnsAppName() throws Exception {
        // "cicd-platform-api" must match the hardcoded value in InfoController.
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.app").value("cicd-platform-api"));
    }

    @Test
    void info_returnsJavaVersion() throws Exception {
        // We don't assert a specific version — just that the field is present
        // and non-empty. The actual value comes from the JVM at runtime.
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.java").isString())
                .andExpect(jsonPath("$.java").isNotEmpty());
    }

    @Test
    void info_returnsStatusUp() throws Exception {
        mockMvc.perform(get("/api/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
