#ifndef GALLIUM_LLM_GEMINI_H
#define GALLIUM_LLM_GEMINI_H

#include <json-c/json.h>

/**
 * @brief Initialize the Gemini client (load keys, etc.)
 */
void llm_gemini_init(void);

/**
 * @brief Send a prompt to Gemini and get a string response.
 * 
 * @param system_prompt The system instruction.
 * @param user_prompt The user prompt.
 * @return char* The response text (caller must free). NULL on failure.
 */
char* llm_gemini_send(const char* system_prompt, const char* user_prompt);

/**
 * @brief Get the last token usage count.
 * @return int Total tokens used in the last request.
 */
int llm_gemini_get_last_token_usage(void);

#endif // GALLIUM_LLM_GEMINI_H
