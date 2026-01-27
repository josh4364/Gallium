#include <libwebsockets.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include "protocol.h"
#include "dispatch.h"

static int interrupted = 0;

static int spy_handler(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)wsi;
    printf("[SPY] Message ID: %d, Length: %u\n", header->msg_id, header->payload_len);
    if (payload_obj) {
        printf("[SPY] Payload: %s\n", json_object_to_json_string(payload_obj));
    }
    printf("----------------------------------------\n");
    return 0;
}

static int callback_spy(struct lws *wsi, enum lws_callback_reasons reason,
                        void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            printf("[SPY] Connected to server.\n");
            break;

        case LWS_CALLBACK_CLIENT_RECEIVE:
            gallium_dispatch_message(wsi, in, len);
            break;

        case LWS_CALLBACK_CLIENT_CLOSED:
        case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
            printf("[SPY] Disconnected or connection error.\n");
            interrupted = 1;
            break;

        default:
            break;
    }
    return 0;
}

static struct lws_protocols protocols[] = {
    { "gallium-protocol", callback_spy, 0, 4096 },
    { NULL, NULL, 0, 0 }
};

void sigint_handler(int sig) {
    interrupted = 1;
}

int main(int argc, char** argv) {
    signal(SIGINT, sigint_handler);

    int port = 7681;
    if (argc > 1) port = atoi(argv[1]);

    gallium_dispatch_init();
    // Register spy handlers for all known IDs
    for (int i = 1; i < 10; i++) {
        gallium_dispatch_register(i, spy_handler);
    }

    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = CONTEXT_PORT_NO_LISTEN;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;

    struct lws_context *context = lws_create_context(&info);
    if (!context) {
        fprintf(stderr, "Failed to create context\n");
        return 1;
    }

    struct lws_client_connect_info i;
    memset(&i, 0, sizeof(i));
    i.context = context;
    i.address = "127.0.0.1";
    i.port = port;
    i.path = "/";
    i.host = i.address;
    i.origin = i.address;
    i.protocol = protocols[0].name;

    if (!lws_client_connect_via_info(&i)) {
        fprintf(stderr, "Failed to initiate connection\n");
        lws_context_destroy(context);
        return 1;
    }

    while (!interrupted) {
        lws_service(context, 50);
    }

    lws_context_destroy(context);
    printf("[SPY] Exiting.\n");
    return 0;
}
