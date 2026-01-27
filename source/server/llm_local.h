#ifndef GALLIUM_LLM_LOCAL_H
#define GALLIUM_LLM_LOCAL_H

typedef struct llm_local_context llm_local_context_t;

void llm_local_init(const char *model_path);
char* llm_local_generate(llm_local_context_t *ctx, const char *prompt);

#endif
