#include "network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "db_manager.h"

struct per_session_data__gallium {
    // Session specific data if needed
};

static int network_send_to(struct lws* wsi, GALLIUM_MSG_ID msg_id, const char* json_payload) {
    if (!wsi) return -1;
    size_t payload_len = json_payload ? strlen(json_payload) : 0;
    size_t total_len = sizeof(gallium_msg_header) + payload_len;
    unsigned char* buf = malloc(LWS_PRE + total_len);

    gallium_msg_header header;
    header.msg_id = msg_id;
    header.payload_len = payload_len;
    gallium_header_hton(&header);

    memcpy(buf + LWS_PRE, &header, sizeof(gallium_msg_header));
    if (json_payload) {
        memcpy(buf + LWS_PRE + sizeof(gallium_msg_header), json_payload, payload_len);
    }

    int n = lws_write(wsi, buf + LWS_PRE, total_len, LWS_WRITE_BINARY);
    free(buf);
    return n;
}

static int callback_gallium(struct lws *wsi, enum lws_callback_reasons reason,
                           void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:
            gallium_log("network", "{\"event\": \"client_connected\"}");
            break;

        case LWS_CALLBACK_RECEIVE: {
            if (len < sizeof(gallium_msg_header)) {
                break;
            }

            gallium_msg_header header;
            memcpy(&header, in, sizeof(gallium_msg_header));
            gallium_header_ntoh(&header);

            if (len < sizeof(gallium_msg_header) + header.payload_len) {
                break;
            }

            // Log the message
            char log_msg[512];
            snprintf(log_msg, sizeof(log_msg), "{\"msg_id\": %d, \"payload_len\": %u}", header.msg_id, header.payload_len);
            gallium_log("network", log_msg);

            // Echo back if it's an INIT
            if (header.msg_id == GALLIUM_MSG_INIT) {
                network_send_to(wsi, GALLIUM_MSG_INIT, "{\"status\": \"acknowledged\"}");
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
    lws_set_log_level(LLL_ERR | LLL_WARN | LLL_NOTICE | LLL_USER, NULL);
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));

    info.port = port;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;
    info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;

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
