#ifndef GALLIUM_LLM_CLIENT_H
#define GALLIUM_LLM_CLIENT_H

#include <json-c/json.h>

/**
 * @brief Send a prompt to the LLM and get a response.
 * 
 * @param system_prompt The system prompt (agent profile).
 * @param user_prompt The user's request.
 * @return char* The response string (caller must free).
 */
char* gallium_llm_generate(const char* system_prompt, const char* user_prompt);

/**
 * @brief Send a prompt and expect a JSON response.
 * 
 * @param system_prompt The system prompt.
 * @param user_prompt The user's request.
 * @return struct json_object* The parsed JSON object (or NULL on failure).
 */
struct json_object* gallium_llm_generate_json(const char* system_prompt, const char* user_prompt);

#endif // GALLIUM_LLM_CLIENT_H
