#include "llm_client.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* gallium_llm_generate(const char* system_prompt, const char* user_prompt) {
    // STUB: Real implementation will be in Task 7 (LLM Integration).
    // For now, return a placeholder.
    fprintf(stderr, "[LLM] System: %s\n", system_prompt);
    fprintf(stderr, "[LLM] User: %s\n", user_prompt);
    
    return strdup("Placeholder LLM Response");
}

struct json_object* gallium_llm_generate_json(const char* system_prompt, const char* user_prompt) {
    fprintf(stderr, "[LLM JSON] System: %s\n", system_prompt);
    fprintf(stderr, "[LLM JSON] User: %s\n", user_prompt);

    // STUB: Return a mock task list if it looks like a task breakdown request
    if (strstr(system_prompt, "Task Manager")) {
        return json_tokener_parse("[\"Subtask A\", \"Subtask B\", \"Subtask C\"]");
    }

    return json_object_new_object();
}
