#ifndef GALLIUM_NETWORK_INTERNAL_H
#define GALLIUM_NETWORK_INTERNAL_H

#include <libwebsockets.h>
#include "protocol.h"

/**
 * @brief Helper to pack a message into a buffer with LWS_PRE padding.
 * 
 * @param msg_id The message ID.
 * @param json_payload The JSON payload (can be NULL).
 * @param out_len Pointer to store the total length (header + payload).
 * @return unsigned char* Pointer to the buffer START (including LWS_PRE).
 *         The actual data starts at return_value + LWS_PRE.
 *         Must be freed by caller.
 */
static inline unsigned char* gallium_net_pack(GALLIUM_MSG_ID msg_id, const char* json_payload, size_t* out_len) {
    size_t payload_len = json_payload ? strlen(json_payload) : 0;
    size_t total_len = sizeof(gallium_msg_header) + payload_len;
    *out_len = total_len;

    unsigned char* buf = malloc(LWS_PRE + total_len);
    if (!buf) return NULL;

    gallium_msg_header header;
    header.msg_id = msg_id;
    header.payload_len = (uint32_t)payload_len;
    gallium_header_hton(&header);

    memcpy(buf + LWS_PRE, &header, sizeof(gallium_msg_header));
    if (json_payload && payload_len > 0) {
        memcpy(buf + LWS_PRE + sizeof(gallium_msg_header), json_payload, payload_len);
    }

    return buf;
}

#endif // GALLIUM_NETWORK_INTERNAL_H
