#define _XOPEN_SOURCE 600
#include <wchar.h> 
#include "network.h"
#include <libwebsockets.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include "dispatch.h"
#include "net_utils.h"
#include "network_internal.h"

static struct lws *client_wsi = NULL;
static struct lws_context *context = NULL;
static int connected = 0;
static int retry_count = 0;
static gallium_ui_t* g_ui = NULL;
static int current_backoff = 1;
static pthread_t network_thread;
static int network_thread_running = 0;
static pthread_mutex_t queue_mutex = PTHREAD_MUTEX_INITIALIZER;

#define MAX_DEBUG_LOGS 5
static char* debug_logs[MAX_DEBUG_LOGS];
static int debug_log_count = 0;

static void add_debug_log(const char* log) {
    pthread_mutex_lock(&queue_mutex);
    if (debug_logs[debug_log_count % MAX_DEBUG_LOGS]) {
        free(debug_logs[debug_log_count % MAX_DEBUG_LOGS]);
    }
    debug_logs[debug_log_count % MAX_DEBUG_LOGS] = strdup(log);
    debug_log_count++;
    pthread_mutex_unlock(&queue_mutex);
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

    pthread_mutex_lock(&queue_mutex);
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
    if (context) {
        lws_cancel_service(context);
    }
    pthread_mutex_unlock(&queue_mutex);
}

static int callback_gallium_client(struct lws *wsi, enum lws_callback_reasons reason,
                                  void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            connected = 1;
            retry_count = 0;
            current_backoff = 1;
            add_debug_log("Connected to server");
            client_network_get_events();
            break;

        case LWS_CALLBACK_CLIENT_RECEIVE: {
            // Push to UI queue instead of handling directly
            if (len < sizeof(gallium_msg_header)) break;
            gallium_msg msg;
            memcpy(&msg.header, in, sizeof(gallium_msg_header));
            gallium_header_ntoh(&msg.header);
            
            msg.payload = malloc(msg.header.payload_len + 1);
            memcpy(msg.payload, (char*)in + sizeof(gallium_msg_header), msg.header.payload_len);
            msg.payload[msg.header.payload_len] = '\0';

            if (g_ui) {
                gallium_queue_push(&g_ui->network_queue, msg);
                g_ui->needs_render = true;
            } else {
                gallium_msg_free(&msg);
            }
            break;
        }

        case LWS_CALLBACK_CLIENT_WRITEABLE: {
            pthread_mutex_lock(&queue_mutex);
            if (!send_queue) {
                pthread_mutex_unlock(&queue_mutex);
                break;
            }

            struct msg_node* node = send_queue;
            send_queue = node->next;
            pthread_mutex_unlock(&queue_mutex);

            size_t total_len = 0;
            unsigned char* buf = gallium_net_pack(node->msg_id, node->payload, &total_len);
            
            if (buf) {
                lws_write(wsi, buf + LWS_PRE, total_len, LWS_WRITE_BINARY);
                free(buf);
            }
            free(node->payload);
            free(node);

            pthread_mutex_lock(&queue_mutex);
            if (send_queue) {
                lws_callback_on_writable(wsi);
            }
            pthread_mutex_unlock(&queue_mutex);
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
    i.address = saved_host;
    i.port = saved_port;
    i.path = "/";
    i.host = i.address;
    i.origin = i.address;
    i.protocol = protocols[0].name;

    client_wsi = lws_client_connect_via_info(&i);
}

void* network_thread_func(void* arg) {
    (void)arg;
    while (network_thread_running) {
        if (context) {
            lws_service(context, 50);
            
            static time_t last_try = 0;
            static time_t last_heartbeat = 0;
            time_t now = time(NULL);

            if (!connected && !client_wsi && (now - last_try > current_backoff)) {
                last_try = now;
                try_connect();
                if (current_backoff < 30) {
                    current_backoff *= 2;
                    if (current_backoff > 30) current_backoff = 30;
                }
            }

            if (connected && (now - last_heartbeat > 10)) {
                last_heartbeat = now;
                client_network_send(GALLIUM_MSG_HEARTBEAT, "{}");
            }
        } else {
            usleep(100000);
        }
    }
    return NULL;
}

void client_network_set_ui(gallium_ui_t* ui) {
    g_ui = ui;
}

int client_network_init(const char* host, int port) {
    strncpy(saved_host, host, sizeof(saved_host));
    saved_port = port;
    gallium_dispatch_init();
    
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = CONTEXT_PORT_NO_LISTEN;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;

    context = lws_create_context(&info);
    if (!context) return -1;

    network_thread_running = 1;
    if (pthread_create(&network_thread, NULL, network_thread_func, NULL) != 0) {
        lws_context_destroy(context);
        context = NULL;
        return -1;
    }

    return 0;
}

void client_network_service() {
}

void client_network_cleanup() {
    network_thread_running = 0;
    if (context) lws_cancel_service(context);
    pthread_join(network_thread, NULL);
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
    pthread_mutex_lock(&queue_mutex);
    *out_logs = debug_logs;
    int count = (debug_log_count < MAX_DEBUG_LOGS) ? debug_log_count : MAX_DEBUG_LOGS;
    pthread_mutex_unlock(&queue_mutex);
    return count;
}

int client_network_get_events() {
    return client_network_send(GALLIUM_MSG_GET_EVENTS, "{}");
}
