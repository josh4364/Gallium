#include "git_workflow.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

static char g_workspace_root[PATH_MAX] = {0};
static bool g_push_checkpoint = false;
static bool g_push_finalize = false;

void git_workflow_init(const char* workspace_root) {
    if (realpath(workspace_root, g_workspace_root) == NULL) {
        strncpy(g_workspace_root, workspace_root, PATH_MAX - 1);
    }
    printf("[GitWorkflow] Initialized with root: %s\n", g_workspace_root);
}

void git_workflow_set_push_checkpoint(bool enabled) {
    g_push_checkpoint = enabled;
}

void git_workflow_set_push_finalize(bool enabled) {
    g_push_finalize = enabled;
}

static int run_git_command(const char* args) {
    char command[2048];
    // Use -C to run git in the workspace root
    int n = snprintf(command, sizeof(command), "git -C \"%s\" %s", g_workspace_root, args);
    if (n < 0 || n >= (int)sizeof(command)) {
        fprintf(stderr, "[GitWorkflow] Command too long\n");
        return -1;
    }

    printf("[GitWorkflow] Running: %s\n", command);
    int result = system(command);
    
    // system() returns exit status in higher bits, or -1 on error
    if (result == -1) return -1;
    return WEXITSTATUS(result);
}

int git_workflow_start_task(const char* task_id) {
    if (!g_workspace_root[0]) return -1;
    
    char args[256];
    snprintf(args, sizeof(args), "checkout -b task-%s", task_id);
    return run_git_command(args);
}

int git_workflow_start_alt_task(const char* task_id, int attempt) {
    if (!g_workspace_root[0]) return -1;
    
    char args[256];
    snprintf(args, sizeof(args), "checkout -b task-%s-alt-%d", task_id, attempt);
    return run_git_command(args);
}

int git_workflow_checkpoint(const char* subtask_name) {
    if (!g_workspace_root[0]) return -1;

    // 1. Git Add
    if (run_git_command("add .") != 0) {
        return -1;
    }

    // 2. Git Commit
    char commit_args[512];
    snprintf(commit_args, sizeof(commit_args), "commit -m \"Gallium: %s completed\"", subtask_name);
    if (run_git_command(commit_args) != 0) {
        return -1;
    }

    // 3. Optional Push
    if (g_push_checkpoint) {
        run_git_command("push origin HEAD");
    }

    return 0;
}

int git_workflow_finalize_task(const char* task_id, const char* main_branch) {
    if (!g_workspace_root[0]) return -1;
    
    // 1. Checkout main
    char checkout_args[256];
    snprintf(checkout_args, sizeof(checkout_args), "checkout %s", main_branch);
    if (run_git_command(checkout_args) != 0) {
        return -1;
    }

    // 2. Merge task branch
    char merge_args[256];
    snprintf(merge_args, sizeof(merge_args), "merge task-%s", task_id);
    if (run_git_command(merge_args) != 0) {
        return -1;
    }

    // 3. Optional Push
    if (g_push_finalize) {
        char push_args[256];
        snprintf(push_args, sizeof(push_args), "push origin %s", main_branch);
        run_git_command(push_args);
    }
    
    return 0;
}
