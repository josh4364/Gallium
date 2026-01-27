#ifndef GALLIUM_CLIENT_NETWORK_H
#define GALLIUM_CLIENT_NETWORK_H

#include "common/protocol.h"

/**
 * @brief Initialize the client network subsystem.
 * @param host The hostname/IP to connect to.
 * @param port The port to connect to.
 * @return 0 on success, non-zero on failure.
 */
int client_network_init(const char* host, int port);

/**
 * @brief Run the client network service loop.
 */
void client_network_service();

/**
 * @brief Shutdown the client network subsystem.
 */
void client_network_cleanup();

/**
 * @brief Send a message to the server.
 */
int client_network_send(GALLIUM_MSG_ID msg_id, const char* json_payload);

/**
 * @brief Check if the client is connected to the server.
 */
int client_network_is_connected();

/**
 * @brief Get the last 5 network debug messages.
 * @param logs Array of 5 strings to be filled.
 * @return Number of logs filled.
 */
int client_network_get_debug_logs(char*** out_logs);

#endif // GALLIUM_CLIENT_NETWORK_H
