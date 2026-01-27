#include "protocol.h"
#include <string.h>
#include <stdlib.h>
#include <arpa/inet.h>

struct json_object* gallium_json_parse(const char* buffer, size_t len) {
    if (!buffer || len == 0) return NULL;
    
    struct json_tokener* tok = json_tokener_new();
    struct json_object* obj = json_tokener_parse_ex(tok, buffer, (int)len);
    
    enum json_tokener_error jerr = json_tokener_get_error(tok);
    if (jerr != json_tokener_success) {
        if (obj) json_object_put(obj);
        obj = NULL;
    }
    
    json_tokener_free(tok);
    return obj;
}

char* gallium_json_serialize(struct json_object* obj, size_t* out_len) {
    if (!obj) return NULL;
    
    const char* str = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
    if (!str) return NULL;
    
    size_t len = strlen(str);
    char* result = malloc(len + 1);
    if (result) {
        memcpy(result, str, len + 1);
        if (out_len) *out_len = len;
    }
    
    return result;
}

void gallium_header_hton(gallium_msg_header* header) {
    if (!header) return;
    header->msg_id = htons(header->msg_id);
    header->payload_len = htonl(header->payload_len);
}

void gallium_header_ntoh(gallium_msg_header* header) {
    if (!header) return;
    header->msg_id = ntohs(header->msg_id);
    header->payload_len = ntohl(header->payload_len);
}

void gallium_msg_free(gallium_msg* msg) {
    if (!msg) return;
    if (msg->payload) {
        free(msg->payload);
        msg->payload = NULL;
    }
}
