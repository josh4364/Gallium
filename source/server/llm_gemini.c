#include "llm_gemini.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>
#include <unistd.h>
#include <math.h>

#define GEMINI_MODEL "gemini-1.5-flash"
#define MAX_RETRIES 5

static char api_key[256] = {0};
static int last_token_usage = 0;

struct string_buffer {
    char *ptr;
    size_t len;
};

static void init_string(struct string_buffer *s) {
    s->len = 0;
    s->ptr = malloc(s->len + 1);
    if (s->ptr == NULL) {
        fprintf(stderr, "malloc() failed\n");
        exit(EXIT_FAILURE);
    }
    s->ptr[0] = '\0';
}

static size_t writefunc(void *ptr, size_t size, size_t nmemb, struct string_buffer *s) {
    size_t new_len = s->len + size * nmemb;
    s->ptr = realloc(s->ptr, new_len + 1);
    if (s->ptr == NULL) {
        fprintf(stderr, "realloc() failed\n");
        exit(EXIT_FAILURE);
    }
    memcpy(s->ptr + s->len, ptr, size * nmemb);
    s->ptr[new_len] = '\0';
    s->len = new_len;
    return size * nmemb;
}

void llm_gemini_init(void) {
    FILE *f = fopen("keys.json", "r");
    if (!f) {
        fprintf(stderr, "[Gemini] Warning: keys.json not found.\n");
        return;
    }
    
    // Simple verification, assuming small file
    char buffer[1024];
    size_t n = fread(buffer, 1, sizeof(buffer)-1, f);
    buffer[n] = 0;
    fclose(f);

    struct json_object *parsed = json_tokener_parse(buffer);
    if (parsed) {
        struct json_object *key_obj;
        if (json_object_object_get_ex(parsed, "gemini_api_key", &key_obj)) {
            strncpy(api_key, json_object_get_string(key_obj), sizeof(api_key)-1);
        }
        json_object_put(parsed);
    }
}

int llm_gemini_get_last_token_usage(void) {
    return last_token_usage;
}

char* llm_gemini_send(const char* system_prompt, const char* user_prompt) {
    if (strlen(api_key) == 0) {
        llm_gemini_init();
        if (strlen(api_key) == 0) {
            fprintf(stderr, "[Gemini] No API Key found.\n");
            return NULL;
        }
    }

    CURL *curl;
    CURLcode res;
    long response_code;
    
    // Prepare JSON payload
    struct json_object *root = json_object_new_object();
    
    // Contents (User prompt with System prompt prepended)
    struct json_object *contents = json_object_new_array();
    struct json_object *content = json_object_new_object();
    json_object_object_add(content, "role", json_object_new_string("user"));
    
    struct json_object *parts = json_object_new_array();
    struct json_object *part = json_object_new_object();
    
    // Combine system and user prompt
    char *full_prompt = malloc(strlen(system_prompt) + strlen(user_prompt) + 64);
    sprintf(full_prompt, "System: %s\n\nUser: %s", system_prompt, user_prompt);
    
    json_object_object_add(part, "text", json_object_new_string(full_prompt));
    free(full_prompt);
    
    json_object_array_add(parts, part);
    
    json_object_object_add(content, "parts", parts);
    json_object_array_add(contents, content);
    
    json_object_object_add(root, "contents", contents);

    const char *json_str = json_object_to_json_string(root);

    // Prepare Request
    char url[256];
    snprintf(url, sizeof(url), "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", GEMINI_MODEL);
    
    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    char key_header[512];
    snprintf(key_header, sizeof(key_header), "x-goog-api-key: %s", api_key);
    headers = curl_slist_append(headers, key_header);

    char *result_text = NULL;
    int retries = 0;
    
    while (retries < MAX_RETRIES) {
        curl = curl_easy_init();
        if(curl) {
            struct string_buffer s;
            init_string(&s);

            curl_easy_setopt(curl, CURLOPT_URL, url);
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_str);
            curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writefunc);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &s);
            
            res = curl_easy_perform(curl);
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);
            
            if (res != CURLE_OK) {
                fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
                free(s.ptr);
                curl_easy_cleanup(curl);
                break; // Network error, maybe don't retry immediately unless it's transient
            }

            if (response_code == 429) {
                fprintf(stderr, "[Gemini] 429 Too Many Requests. Retrying...\n");
                free(s.ptr);
                curl_easy_cleanup(curl);
                int wait_time = (int)pow(2, retries);
                sleep(wait_time);
                retries++;
                continue;
            }
            
            if (response_code != 200) {
                 fprintf(stderr, "[Gemini] Error %ld: %s\n", response_code, s.ptr);
                 free(s.ptr);
                 curl_easy_cleanup(curl);
                 break;
            }

            // Parse Response
            struct json_object *resp_json = json_tokener_parse(s.ptr);
            if (resp_json) {
                // Extract Text
                struct json_object *candidates, *cand, *content_resp, *parts_resp, *part_resp, *text, *usage, *total_tokens;
                if (json_object_object_get_ex(resp_json, "candidates", &candidates) &&
                    json_object_array_length(candidates) > 0) {
                    cand = json_object_array_get_idx(candidates, 0);
                    if (json_object_object_get_ex(cand, "content", &content_resp) &&
                        json_object_object_get_ex(content_resp, "parts", &parts_resp) &&
                        json_object_array_length(parts_resp) > 0) {
                        part_resp = json_object_array_get_idx(parts_resp, 0);
                        if (json_object_object_get_ex(part_resp, "text", &text)) {
                            result_text = strdup(json_object_get_string(text));
                        }
                    }
                }
                
                // Extract Usage
                if (json_object_object_get_ex(resp_json, "usageMetadata", &usage) &&
                    json_object_object_get_ex(usage, "totalTokenCount", &total_tokens)) {
                    last_token_usage = json_object_get_int(total_tokens);
                }

                json_object_put(resp_json);
            }
            
            free(s.ptr);
            curl_easy_cleanup(curl);
            break; // Success
        }
    }

    curl_slist_free_all(headers);
    json_object_put(root);
    
    return result_text;
}
