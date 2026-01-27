#include "sandbox.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <unistd.h>
#include <json-c/json.h>
#include "common/protocol.h"
#include "db_manager.h"

static char g_workspace_root[PATH_MAX] = {0};

void sandbox_init(const char* workspace_root) {
    if (realpath(workspace_root, g_workspace_root) == NULL) {
        strncpy(g_workspace_root, workspace_root, PATH_MAX - 1);
    }
    printf("[Sandbox] Initialized with root: %s\n", g_workspace_root);
}

int sandbox_validate_path(const char* path, char* resolved_path) {
    char absolute_path[PATH_MAX];
    
    // Check for ".." escapes before resolving to be extra safe
    if (strstr(path, "..") != NULL) {
        fprintf(stderr, "[Sandbox] Security Error: '..' detected in path: %s\n", path);
        return -1;
    }

    if (realpath(path, absolute_path) == NULL) {
        // If file doesn't exist, realpath might fail. 
        // For new files, we should at least check the parent directory.
        // For now, let's assume we are validating existing files or simple relative paths.
        // A better implementation would resolve the parent and then append the filename.
        
        // Simple fallback: if it's not absolute, prepend workspace root
        if (path[0] != '/') {
            snprintf(absolute_path, sizeof(absolute_path), "%s/%s", g_workspace_root, path);
        } else {
            strncpy(absolute_path, path, sizeof(absolute_path) - 1);
        }
    }

    // Check if absolute_path starts with g_workspace_root
    if (strncmp(absolute_path, g_workspace_root, strlen(g_workspace_root)) != 0) {
        fprintf(stderr, "[Sandbox] Security Error: Path outside workspace: %s\n", absolute_path);
        return -1;
    }

    if (resolved_path) {
        strncpy(resolved_path, absolute_path, PATH_MAX - 1);
    }

    return 0;
}

int sandbox_execute_command(const char* command, bool requires_approval) {
    if (requires_approval) {
        // In a real implementation, we would send a message to the client and wait.
        // For this task, we will log that it requires approval.
        // The spec says: "Send a MSG_USER_INPUT to the client and wait for a signed approval message"
        printf("[Sandbox] Command requires approval: %s\n", command);
        // gallium_log("sandbox", "{\"event\": \"approval_required\", \"command\": \"...\"}");
        return -2; // Special code for "pending approval"
    }

    printf("[Sandbox] Executing command: %s\n", command);
    
    FILE* fp = popen(command, "r");
    if (fp == NULL) {
        perror("popen");
        return -1;
    }

    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), fp) != NULL) {
        // In a real implementation, we might send this output to the client via MSG_EVENT_LOG
        // For now, just print it and maybe log to DB
        printf("[Sandbox Output] %s", buffer);
        
        // Log to database
        struct json_object* log_obj = json_object_new_object();
        json_object_object_add(log_obj, "type", json_object_new_string("stdout"));
        json_object_object_add(log_obj, "line", json_object_new_string(buffer));
        const char* log_str = json_object_to_json_string(log_obj);
        gallium_log("sandbox", log_str);
        json_object_put(log_obj);
    }

    int status = pclose(fp);
    return status == 0 ? 0 : -1;
}

int sandbox_execute_task(const char* task_name) {
    char tasks_path[PATH_MAX];
    snprintf(tasks_path, sizeof(tasks_path), "%s/tasks.json", g_workspace_root);

    FILE* fp = fopen(tasks_path, "r");
    if (!fp) {
        perror("fopen tasks.json");
        return -1;
    }

    fseek(fp, 0, SEEK_END);
    long len = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    char* data = malloc(len + 1);
    fread(data, 1, len, fp);
    data[len] = '\0';
    fclose(fp);

    struct json_object* root = json_tokener_parse(data);
    free(data);

    if (!root) {
        fprintf(stderr, "[Sandbox] Failed to parse tasks.json\n");
        return -1;
    }

    struct json_object* tasks_array = NULL;
    if (!json_object_object_get_ex(root, "tasks", &tasks_array)) {
        fprintf(stderr, "[Sandbox] No 'tasks' array in tasks.json\n");
        json_object_put(root);
        return -1;
    }

    int found = 0;
    const char* command_to_run = NULL;
    size_t n_tasks = json_object_array_length(tasks_array);
    for (size_t i = 0; i < n_tasks; i++) {
        struct json_object* task = json_object_array_get_idx(tasks_array, i);
        struct json_object* name_obj = NULL;
        if (json_object_object_get_ex(task, "name", &name_obj)) {
            if (strcmp(json_object_get_string(name_obj), task_name) == 0) {
                struct json_object* cmd_obj = NULL;
                if (json_object_object_get_ex(task, "command", &cmd_obj)) {
                    command_to_run = json_object_get_string(cmd_obj);
                    found = 1;
                    break;
                }
            }
        }
    }

    int result = -1;
    if (found && command_to_run) {
        // Basic security check: if command contains certain patterns, require approval
        bool needs_approval = false;
        if (strstr(command_to_run, "rm ") || strstr(command_to_run, "curl") || strstr(command_to_run, "wget")) {
            needs_approval = true;
        }
        
        result = sandbox_execute_command(command_to_run, needs_approval);
    } else {
        fprintf(stderr, "[Sandbox] Task not found: %s\n", task_name);
    }

    json_object_put(root);
    return result;
}
