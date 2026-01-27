#ifndef GALLIUM_SERVER_NETWORK_H
#define GALLIUM_SERVER_NETWORK_H

#include <libwebsockets.h>
#include "common/protocol.h"

/**
 * @brief Initialize the network subsystem.
 * @param port The port to listen on.
 * @return 0 on success, non-zero on failure.
 */
int network_init(int port);

/**
 * @brief Run the network service loop.
 */
void network_service();

/**
 * @brief Shutdown the network subsystem.
 */
void network_cleanup();

/**
 * @brief Send a message to all connected clients (broadcast).
 */
void network_broadcast(GALLIUM_MSG_ID msg_id, const char* json_payload);

#endif // GALLIUM_SERVER_NETWORK_H
