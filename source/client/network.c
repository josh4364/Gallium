#include "network.h"
#include <libwebsockets.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "dispatch.h"
#include "net_utils.h"
#include "network_internal.h"

static struct lws *client_wsi = NULL;
static struct lws_context *context = NULL;
static int connected = 0;
static int should_connect = 1;
static int retry_count = 0;
static int current_backoff = 1;
#define MAX_DEBUG_LOGS 5
static char* debug_logs[MAX_DEBUG_LOGS];
static int debug_log_count = 0;

static void add_debug_log(const char* log) {
    if (debug_logs[debug_log_count % MAX_DEBUG_LOGS]) {
        free(debug_logs[debug_log_count % MAX_DEBUG_LOGS]);
    }
    debug_logs[debug_log_count % MAX_DEBUG_LOGS] = strdup(log);
    debug_log_count++;
}

struct msg_node {
    GALLIUM_MSG_ID msg_id;
    char* payload;
    size_t payload_len;
    struct msg_node* next;
};

static struct msg_node* send_queue = NULL;

static void queue_message(GALLIUM_MSG_ID msg_id, const char* json_payload) {
    struct msg_node* node = malloc(sizeof(struct msg_node));
    node->msg_id = msg_id;
    node->payload_len = json_payload ? strlen(json_payload) : 0;
    node->payload = json_payload ? strdup(json_payload) : NULL;
    node->next = NULL;

    if (!send_queue) {
        send_queue = node;
    } else {
        struct msg_node* curr = send_queue;
        while (curr->next) curr = curr->next;
        curr->next = node;
    }
    
    if (client_wsi) {
        lws_callback_on_writable(client_wsi);
    }
}

static int callback_gallium_client(struct lws *wsi, enum lws_callback_reasons reason,
                                  void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            connected = 1;
            retry_count = 0;
            current_backoff = 1;
            add_debug_log("Connected to server");
            break;

        case LWS_CALLBACK_CLIENT_RECEIVE:
            if (gallium_dispatch_message(wsi, in, len) < 0) {
                add_debug_log("Dispatch failed or no handler");
            }
            break;

        case LWS_CALLBACK_CLIENT_WRITEABLE: {
            if (!send_queue) break;

            struct msg_node* node = send_queue;
            send_queue = node->next;

            size_t total_len = 0;
            unsigned char* buf = gallium_net_pack(node->msg_id, node->payload, &total_len);
            
            if (buf) {
                lws_write(wsi, buf + LWS_PRE, total_len, LWS_WRITE_BINARY);
                free(buf);
            }
            free(node->payload);
            free(node);

            if (send_queue) {
                lws_callback_on_writable(wsi);
            }
            break;
        }

        case LWS_CALLBACK_CLIENT_CLOSED:
        case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
            connected = 0;
            client_wsi = NULL;
            add_debug_log("Disconnected/Connection Error");
            break;

        default:
            break;
    }
    return 0;
}

static struct lws_protocols protocols[] = {
    { "gallium-protocol", callback_gallium_client, 0, 4096 },
    { NULL, NULL, 0, 0 }
};

static char saved_host[256];
static int saved_port;

static void try_connect() {
    struct lws_client_connect_info i;
    memset(&i, 0, sizeof(i));
    i.context = context;
    i.address = "127.0.0.1";
    i.port = saved_port;
    i.path = "/";
    i.host = i.address;
    i.origin = i.address;
    i.protocol = protocols[0].name;

    client_wsi = lws_client_connect_via_info(&i);
}

int client_network_init(const char* host, int port) {
    strncpy(saved_host, host, sizeof(saved_host));
    saved_port = port;
    gallium_dispatch_init();
    lws_set_log_level(LLL_ERR | LLL_WARN | LLL_NOTICE | LLL_USER, NULL);

    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));

    info.port = CONTEXT_PORT_NO_LISTEN;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;

    context = lws_create_context(&info);
    if (!context) return -1;

    try_connect();
    return 0;
}

void client_network_service() {
    if (context) {
        lws_service(context, 50);
        
        static time_t last_try = 0;
        static time_t last_heartbeat = 0;
        time_t now = time(NULL);

        if (!connected && !client_wsi && (now - last_try > current_backoff)) {
            last_try = now;
            try_connect();
            
            // Exponential backoff: 1, 2, 4, 8, 16, 30...
            if (current_backoff < 30) {
                current_backoff *= 2;
                if (current_backoff > 30) current_backoff = 30;
            }
        }

        if (connected && (now - last_heartbeat > 10)) {
            last_heartbeat = now;
            client_network_send(GALLIUM_MSG_HEARTBEAT, "{}");
        }
    }
}

void client_network_cleanup() {
    if (context) {
        lws_context_destroy(context);
        context = NULL;
    }
}

int client_network_send(GALLIUM_MSG_ID msg_id, const char* json_payload) {
    queue_message(msg_id, json_payload);
    return 0;
}

int client_network_is_connected() {
    return connected;
}

int client_network_get_debug_logs(char*** out_logs) {
    *out_logs = debug_logs;
    return (debug_log_count < MAX_DEBUG_LOGS) ? debug_log_count : MAX_DEBUG_LOGS;
}
