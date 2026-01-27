#include "network.h"
#include <libwebsockets.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static struct lws *client_wsi = NULL;
static struct lws_context *context = NULL;
static int connected = 0;
static int should_connect = 1;

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
            break;

        case LWS_CALLBACK_CLIENT_RECEIVE:
            // Handle incoming messages from server
            break;

        case LWS_CALLBACK_CLIENT_WRITEABLE: {
            if (!send_queue) break;

            struct msg_node* node = send_queue;
            send_queue = node->next;

            size_t total_len = sizeof(gallium_msg_header) + node->payload_len;
            unsigned char* buf = malloc(LWS_PRE + total_len);
            
            gallium_msg_header header;
            header.msg_id = node->msg_id;
            header.payload_len = node->payload_len;
            gallium_header_hton(&header);

            memcpy(buf + LWS_PRE, &header, sizeof(gallium_msg_header));
            if (node->payload) {
                memcpy(buf + LWS_PRE + sizeof(gallium_msg_header), node->payload, node->payload_len);
            }

            lws_write(wsi, buf + LWS_PRE, total_len, LWS_WRITE_BINARY);

            free(buf);
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

        if (!connected && !client_wsi && (now - last_try > 2)) {
            last_try = now;
            try_connect();
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
