#include "network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "db_manager.h"

#include "dispatch.h"
#include "net_utils.h"

struct per_session_data__gallium {
    // Session specific data if needed
};

static int handle_init(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    (void)payload_obj;
    return gallium_net_send(wsi, GALLIUM_MSG_INIT, "{\"status\": \"acknowledged\"}");
}

static int callback_gallium(struct lws *wsi, enum lws_callback_reasons reason,
                           void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:
            gallium_log("network", "{\"event\": \"client_connected\"}");
            break;

        case LWS_CALLBACK_RECEIVE: {
            if (gallium_dispatch_message(wsi, in, len) < 0) {
                // Could not dispatch or handler failed
            }
            break;
        }

        case LWS_CALLBACK_CLOSED:
            gallium_log("network", "{\"event\": \"client_disconnected\"}");
            break;

        default:
            break;
    }
    return 0;
}

static struct lws_protocols protocols[] = {
    { "gallium-protocol", callback_gallium, sizeof(struct per_session_data__gallium), 4096 },
    { "", callback_gallium, sizeof(struct per_session_data__gallium), 4096 },
    { NULL, NULL, 0, 0 } /* terminator */
};

static struct lws_context *context = NULL;

int network_init(int port) {
    gallium_dispatch_init();
    gallium_dispatch_register(GALLIUM_MSG_INIT, handle_init);

    lws_set_log_level(LLL_ERR | LLL_WARN | LLL_NOTICE | LLL_USER, NULL);
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));

    info.port = port;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;
    info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT | 
                   LWS_SERVER_OPTION_ALLOW_LISTEN_SHARE;

    context = lws_create_context(&info);
    if (!context) {
        return -1;
    }
    return 0;
}

void network_service() {
    if (context) {
        lws_service(context, 50);
    }
}

void network_cleanup() {
    if (context) {
        lws_context_destroy(context);
        context = NULL;
    }
}

void network_broadcast(GALLIUM_MSG_ID msg_id, const char* json_payload) {
    // Implementation for broadcast involves keeping track of active WSI's
    // For now, this is a placeholder
    (void)msg_id;
    (void)json_payload;
}
