#include "network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "db_manager.h"

#include "dispatch.h"
#include "net_utils.h"
#include "sandbox.h"

struct per_session_data__gallium {
    // Session specific data if needed
};

#include "project_init.h"

static int g_panic_active = 0;

int network_is_panic_active() {
    return g_panic_active;
}

static int handle_panic(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    struct json_object* active_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "active", &active_obj)) {
        g_panic_active = json_object_get_boolean(active_obj);
        printf("[Network] Panic state changed to: %s\n", g_panic_active ? "ACTIVE" : "INACTIVE");
        
        if (g_panic_active) {
            // Log to database
            gallium_log("server", "{\"event\": \"panic_activated\"}");
            sandbox_kill_all();
            // Broadcast to other clients if any
            network_broadcast(GALLIUM_MSG_PANIC, "{\"active\": true}");
        } else {
            gallium_log("server", "{\"event\": \"panic_deactivated\"}");
            network_broadcast(GALLIUM_MSG_PANIC, "{\"active\": false}");
        }
        return 0;
    }
    return -1;
}

static int handle_get_events(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header; (void)payload_obj;
    int limit = 50;
    
    char* events_json = db_get_events(limit);
    if (events_json) {
        int ret = gallium_net_send(wsi, GALLIUM_MSG_EVENT_LIST, events_json);
        free(events_json);
        return ret;
    } else {
        return gallium_net_send(wsi, GALLIUM_MSG_EVENT_LIST, "[]");
    }
}

static int handle_init(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    (void)payload_obj;
    int ret = gallium_net_send(wsi, GALLIUM_MSG_INIT, "{\"status\": \"acknowledged\"}");
    
    // Check if we need to start interview
    if (project_init_needs_start()) {
        project_init_start(wsi);
    }
    return ret;
}

static int handle_task_update(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    struct json_object* task_name_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "task", &task_name_obj)) {
        const char* task_name = json_object_get_string(task_name_obj);
        gallium_log("network", "{\"event\": \"task_request\", \"task\": \"...\"}");
        
        int res = sandbox_execute_task(task_name);
        if (res == -2) {
            // Approval required
            return gallium_net_send(wsi, GALLIUM_MSG_USER_INPUT, "{\"prompt\": \"Command requires approval\", \"task\": \"...\"}");
        } else if (res == 0) {
            return gallium_net_send(wsi, GALLIUM_MSG_TASK_UPDATE, "{\"status\": \"completed\", \"task\": \"...\"}");
        } else {
            return gallium_net_send(wsi, GALLIUM_MSG_ERROR, "{\"message\": \"Task failed or not found\"}");
        }
    }
    return -1;
}

static int handle_user_input(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    
    // Check for Init Mode Input (Text)
    struct json_object* text_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "text", &text_obj)) {
        const char* text = json_object_get_string(text_obj);
        return project_init_handle_input(wsi, text);
    }

    // Default Approval Logic
    struct json_object* approved_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "approved", &approved_obj)) {
        bool approved = json_object_get_boolean(approved_obj);
        if (approved) {
            // In a real system, we'd resume the pending command. 
            // For now, let's just log and acknowledge.
            printf("[Network] User approved command.\n");
            return gallium_net_send(wsi, GALLIUM_MSG_USER_INPUT, "{\"status\": \"acknowledged\"}");
        } else {
            printf("[Network] User rejected command.\n");
            return gallium_net_send(wsi, GALLIUM_MSG_USER_INPUT, "{\"status\": \"rejected\"}");
        }
    }
    return -1;
}

static int callback_gallium(struct lws *wsi, enum lws_callback_reasons reason,
                           void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:
            gallium_log("network", "{\"event\": \"client_connected\"}");
            if (project_init_needs_start()) {
                project_init_start(wsi);
            }
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
    gallium_dispatch_register(GALLIUM_MSG_TASK_UPDATE, handle_task_update);
    gallium_dispatch_register(GALLIUM_MSG_USER_INPUT, handle_user_input);
    gallium_dispatch_register(GALLIUM_MSG_PANIC, handle_panic);
    gallium_dispatch_register(GALLIUM_MSG_GET_EVENTS, handle_get_events);

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
