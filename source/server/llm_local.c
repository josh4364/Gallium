#include "llm_local.h"
#include <stddef.h>
#include <string.h>

/*
 * STUB: Local Llama.cpp Support (Optional/Planned)
 */

struct llm_local_context {
    void *opaque_llama_state;
};

void llm_local_init(const char *model_path) {
    // TODO: implementation
    (void)model_path;
}

char* llm_local_generate(llm_local_context_t *ctx, const char *prompt) {
    // TODO: implementation
    (void)ctx;
    (void)prompt;
    return strdup("Local LLM not implemented yet.");
}
