#include "network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include "db_manager.h"
#include "dispatch.h"
#include "net_utils.h"
#include "sandbox.h"
#include "project_init.h"

struct per_session_data__gallium {
};

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
            gallium_log("server", "{\"event\": \"panic_activated\"}");
            sandbox_kill_all();
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

static int handle_get_tasks(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header; (void)payload_obj;
    char* tasks_json = db_get_tasks();
    if (tasks_json) {
        int ret = gallium_net_send(wsi, GALLIUM_MSG_TASK_LIST, tasks_json);
        free(tasks_json);
        return ret;
    } else {
        return gallium_net_send(wsi, GALLIUM_MSG_TASK_LIST, "{\"tasks\": []}");
    }
}

static int handle_list_files(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    const char* path = "/";
    struct json_object* path_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "path", &path_obj)) {
        path = json_object_get_string(path_obj);
    }
    
    char* files_json = sandbox_list_files(path);
    if (files_json) {
        int ret = gallium_net_send(wsi, GALLIUM_MSG_FILE_LIST, files_json);
        free(files_json);
        return ret;
    } else {
        return gallium_net_send(wsi, GALLIUM_MSG_FILE_LIST, "[]");
    }
}

static int handle_read_file(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    const char* file_path = NULL;
    struct json_object* path_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "path", &path_obj)) {
        file_path = json_object_get_string(path_obj);
    }
    
    if (!file_path) return -1;

    char* content = sandbox_read_file(file_path);
    if (content) {
        struct json_object* resp = json_object_new_object();
        json_object_object_add(resp, "path", json_object_new_string(file_path));
        json_object_object_add(resp, "content", json_object_new_string(content));
        
        const char* json_str = json_object_to_json_string(resp);
        int ret = gallium_net_send(wsi, GALLIUM_MSG_FILE_CONTENT, json_str);
        
        json_object_put(resp);
        free(content);
        return ret;
    } else {
        return gallium_net_send(wsi, GALLIUM_MSG_ERROR, "{\"message\": \"Failed to read file\"}");
    }
}

static int handle_heartbeat(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)wsi; (void)header; (void)payload_obj;
    return 0;
}

static int handle_init(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header; (void)payload_obj;
    int ret = gallium_net_send(wsi, GALLIUM_MSG_INIT, "{\"status\": \"acknowledged\"}");
    if (project_init_needs_start()) {
        project_init_start(wsi);
    }
    return ret;
}

typedef struct {
    struct lws* wsi;
    char* task_name;
} TaskArgs;

static void* task_thread_func(void* arg) {
    TaskArgs* args = (TaskArgs*)arg;
    struct lws* wsi = args->wsi;
    char* task_name = args->task_name;

    printf("[Network] Executing task in background: %s\n", task_name);
    int res = sandbox_execute_task(task_name);
    
    if (res == -2) {
        gallium_net_send(wsi, GALLIUM_MSG_USER_INPUT, "{\"prompt\": \"Command requires approval\", \"task\": \"...\"}");
    } else if (res == 0) {
        gallium_net_send(wsi, GALLIUM_MSG_TASK_UPDATE, "{\"status\": \"completed\", \"task\": \"...\"}");
    } else {
        gallium_net_send(wsi, GALLIUM_MSG_ERROR, "{\"message\": \"Task failed or not found\"}");
    }

    free(task_name);
    free(args);
    return NULL;
}

static int handle_task_update(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    struct json_object* task_name_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "task", &task_name_obj)) {
        const char* task_name = json_object_get_string(task_name_obj);
        
        TaskArgs* args = malloc(sizeof(TaskArgs));
        args->wsi = wsi;
        args->task_name = strdup(task_name);

        pthread_t tid;
        if (pthread_create(&tid, NULL, task_thread_func, args) == 0) {
            pthread_detach(tid);
        } else {
            free(args->task_name);
            free(args);
            return -1;
        }
        return 0;
    }
    return -1;
}

static int handle_user_input(struct lws* wsi, gallium_msg_header* header, struct json_object* payload_obj) {
    (void)header;
    struct json_object* text_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "text", &text_obj)) {
        const char* text = json_object_get_string(text_obj);
        return project_init_handle_input(wsi, text);
    }

    struct json_object* approved_obj = NULL;
    if (json_object_object_get_ex(payload_obj, "approved", &approved_obj)) {
        bool approved = json_object_get_boolean(approved_obj);
        if (approved) {
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
        case LWS_CALLBACK_RECEIVE:
            if (gallium_dispatch_message(wsi, in, len) < 0) {
            }
            break;
        case LWS_CALLBACK_CLOSED:
            gallium_log("network", "{\"event\": \"client_disconnected\"}");
            break;
        default:
            break;
    }
    return 0;
}

static struct lws_protocols protocols[] = {
    { "http", lws_callback_http_dummy, 0, 0 },
    { "gallium-protocol", callback_gallium, sizeof(struct per_session_data__gallium), 4096 },
    { NULL, NULL, 0, 0 }
};

static const struct lws_http_mount mount = {
    /* .mount_next */               NULL,
    /* .mountpoint */               "/",
    /* .origin */                   "./source/client-web",
    /* .def */                      "index.html",
    /* .protocol */                 "http",
    /* .cgienv */                   NULL,
    /* .extra_mimetypes */          NULL,
    /* .interpret */                NULL,
    /* .cgi_timeout */              0,
    /* .cache_max_age */            0,
    /* .auth_mask */                0,
    /* .cache_reusable */           0,
    /* .cache_revalidate */         0,
    /* .cache_intermediaries */     0,
    /* .origin_protocol */          LWSMPRO_FILE,
    /* .mountpoint_len */           1,
    /* .basic_auth_login_file */    NULL,
};

static struct lws_context *context = NULL;

int network_init(int port) {
    gallium_dispatch_init();
    gallium_dispatch_register(GALLIUM_MSG_INIT, handle_init);
    gallium_dispatch_register(GALLIUM_MSG_TASK_UPDATE, handle_task_update);
    gallium_dispatch_register(GALLIUM_MSG_USER_INPUT, handle_user_input);
    gallium_dispatch_register(GALLIUM_MSG_PANIC, handle_panic);
    gallium_dispatch_register(GALLIUM_MSG_GET_EVENTS, handle_get_events);
    gallium_dispatch_register(GALLIUM_MSG_GET_TASKS, handle_get_tasks);
    gallium_dispatch_register(GALLIUM_MSG_LIST_FILES, handle_list_files);
    gallium_dispatch_register(GALLIUM_MSG_READ_FILE, handle_read_file);
    gallium_dispatch_register(GALLIUM_MSG_HEARTBEAT, handle_heartbeat);

    lws_set_log_level(LLL_ERR | LLL_WARN | LLL_NOTICE | LLL_USER, NULL);
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = port;
    info.protocols = protocols;
    info.mounts = &mount;
    info.gid = -1;
    info.uid = -1;
    info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT | LWS_SERVER_OPTION_ALLOW_LISTEN_SHARE;

    context = lws_create_context(&info); 
    if (!context) return -1;
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
    (void)msg_id;
    (void)json_payload;
}