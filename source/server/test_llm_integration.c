#include "llm_gemini.h"
#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("Starting LLM Integration Test...\n");
    
    // Check keys.json
    FILE *f = fopen("keys.json", "r");
    if (!f) {
        fprintf(stderr, "Skipping test: keys.json not found in current directory.\n");
        // We return 0 so CI doesn't fail if keys are missing, but locally we know we need them.
        return 0;
    }
    fclose(f);

    llm_gemini_init();
    
    printf("Sending request to Gemini...\n");
    char *response = llm_gemini_send("You are a helpful test assistant.", "Say 'Hello Gallium!'");
    
    if (response) {
        printf("Response received: %s\n", response);
        int tokens = llm_gemini_get_last_token_usage();
        printf("Tokens used: %d\n", tokens);
        free(response);
        
        if (tokens > 0) {
            printf("Test Passed: Response received and tokens tracked.\n");
            return 0;
        } else {
            fprintf(stderr, "Test Failed: Tokens were 0.\n");
            return 1;
        }
    } else {
        fprintf(stderr, "Test Failed: No response received.\n");
        return 1;
    }
}
