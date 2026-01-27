#include "llm_client.h"
#include "llm_gemini.h"
#include "db_manager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CONTEXT_WINDOW_LIMIT 1000000 // Gemini 1.5 Flash 1M token limit
#define CONTEXT_WARNING_THRESHOLD 0.8 // Warn at 80%

char* gallium_llm_generate(const char* system_prompt, const char* user_prompt) {
    char* response = llm_gemini_send(system_prompt, user_prompt);
    
    if (response) {
        int tokens = llm_gemini_get_last_token_usage();
        gallium_log_llm("unknown_agent", user_prompt, response, tokens); // TODO: Pass agent ID

        // Context Window Monitoring
        long long total_lifetime_tokens = db_get_total_tokens();
        
        // Calculate percentage of context window used by THIS request
        double percent_used = (double)tokens / CONTEXT_WINDOW_LIMIT;
        
        char log_payload[256];
        if (percent_used > CONTEXT_WARNING_THRESHOLD) {
             snprintf(log_payload, sizeof(log_payload), 
                      "{\"event\": \"context_warning\", \"current_usage\": %d, \"limit\": %d, \"percent\": %.2f}", 
                      tokens, CONTEXT_WINDOW_LIMIT, percent_used * 100.0);
             gallium_log("LLM_MONITOR", log_payload);
        }

        // Report usage stats
        snprintf(log_payload, sizeof(log_payload), 
                 "{\"event\": \"context_report\", \"current_usage\": %d, \"lifetime_usage\": %lld}", 
                 tokens, total_lifetime_tokens);
        gallium_log("LLM_MONITOR", log_payload);

    } else {
        fprintf(stderr, "[LLM] Failed to generate response.\n");
    }
    
    return response;
}

struct json_object* gallium_llm_generate_json(const char* system_prompt, const char* user_prompt) {
    char* response_text = gallium_llm_generate(system_prompt, user_prompt);
    if (!response_text) {
        return NULL;
    }

    struct json_object* json = json_tokener_parse(response_text);
    // If response is markdown wrapped ```json ... ```, we might need to clean it.
    // Basic cleaning: find first { or [
    if (!json) {
        char *start = strchr(response_text, '{');
        char *start_arr = strchr(response_text, '[');
        if (start_arr && (!start || start_arr < start)) start = start_arr;
        
        if (start) {
            char *end = strrchr(start, '}');
            char *end_arr = strrchr(start, ']');
            if (end_arr && (!end || end_arr > end)) end = end_arr;
            
            if (end) {
                *(end + 1) = '\0';
                json = json_tokener_parse(start);
            }
        }
    }
    
    free(response_text);
    return json;
}
