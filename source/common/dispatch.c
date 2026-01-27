#include "dispatch.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define MAX_HANDLERS 1024

static gallium_msg_handler handlers[MAX_HANDLERS];

void gallium_dispatch_init() {
    memset(handlers, 0, sizeof(handlers));
}

void gallium_dispatch_register(GALLIUM_MSG_ID msg_id, gallium_msg_handler handler) {
    if (msg_id < MAX_HANDLERS) {
        handlers[msg_id] = handler;
    } else {
        fprintf(stderr, "[Dispatch] Error: Message ID %d exceeds max handlers %d\n", msg_id, MAX_HANDLERS);
    }
}

int gallium_dispatch_message(struct lws* wsi, void* in, size_t len) {
    if (len < sizeof(gallium_msg_header)) {
        return -1;
    }

    gallium_msg_header header;
    memcpy(&header, in, sizeof(gallium_msg_header));
    gallium_header_ntoh(&header);

    if (len < sizeof(gallium_msg_header) + header.payload_len) {
        return -1;
    }

    struct json_object* payload_obj = NULL;
    if (header.payload_len > 0) {
        const char* payload_str = (const char*)in + sizeof(gallium_msg_header);
        payload_obj = gallium_json_parse(payload_str, header.payload_len);
        if (!payload_obj) {
            fprintf(stderr, "[Dispatch] Error: Failed to parse JSON payload for msg_id %d\n", header.msg_id);
            return -1;
        }
    }
    
    int result = -1;
    if (header.msg_id < MAX_HANDLERS && handlers[header.msg_id]) {
        result = handlers[header.msg_id](wsi, &header, payload_obj);
    } else {
        // Default: Log unhandled message
        fprintf(stderr, "[Dispatch] Warning: No handler for message ID %d\n", header.msg_id);
    }

    if (payload_obj) {
        json_object_put(payload_obj);
    }

    return result;
}
