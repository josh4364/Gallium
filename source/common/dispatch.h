#ifndef GALLIUM_DISPATCH_H
#define GALLIUM_DISPATCH_H

#include <libwebsockets.h>
#include "protocol.h"

#include <json-c/json.h>

typedef int (*gallium_msg_handler)(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj);

/**
 * @brief Initialize the dispatch system.
 */
void gallium_dispatch_init();

/**
 * @brief Register a handler for a specific message ID.
 * 
 * @param msg_id The message ID to handle.
 * @param handler The handler function.
 */
void gallium_dispatch_register(GALLIUM_MSG_ID msg_id, gallium_msg_handler handler);

/**
 * @brief Dispatch an incoming message to its registered handler.
 * 
 * @param wsi The websocket instance.
 * @param in The raw message data (starting with header).
 * @param len The total length of the raw data.
 * @return int 0 on success, -1 if no handler or handler error.
 */
int gallium_dispatch_message(struct lws* wsi, void* in, size_t len);

#endif // GALLIUM_DISPATCH_H
