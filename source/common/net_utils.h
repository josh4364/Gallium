#ifndef GALLIUM_NET_UTILS_H
#define GALLIUM_NET_UTILS_H

#include <libwebsockets.h>
#include "protocol.h"

/**
 * @brief Send a message over a websocket.
 * 
 * @param wsi The websocket instance.
 * @param msg_id The message ID.
 * @param json_payload The JSON payload (can be NULL).
 * @return int Number of bytes sent, or -1 on error.
 */
int gallium_net_send(struct lws* wsi, GALLIUM_MSG_ID msg_id, const char* json_payload);

#endif // GALLIUM_NET_UTILS_H
