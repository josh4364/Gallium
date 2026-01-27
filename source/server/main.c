#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include "db_manager.h"
#include "network.h"
#include "sandbox.h"
#include "common/protocol.h"

#include "git_workflow.h"
#include "agent_manager.h"

// ... imports ...

static int interrupted = 0;

void sigint_handler(int sig) {
    interrupted = 1;
}

void run_git_test() {
    printf("Running Git Workflow Test...\n");
    const char* test_dir = "build/test_git_workspace";
    
    // Setup test repo
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "rm -rf %s && mkdir -p %s && cd %s && git init && echo 'init' > README.md && git add . && git commit -m 'Initial commit'", test_dir, test_dir, test_dir);
    system(cmd);

    git_workflow_init(test_dir);

    // 1. Start Task
    printf("Testing Start Task...\n");
    if (git_workflow_start_task("101") != 0) {
        printf("FAILED: Start Task\n");
        return;
    }

    // Testing Alt Task
    printf("Testing Alt Task...\n");
    if (git_workflow_start_alt_task("101", 1) != 0) {
        printf("FAILED: Start Alt Task\n");
        return;
    }
    // Switch back to task-101 for the rest of the test
    system("git -C build/test_git_workspace checkout task-101");

    // 2. Sub-task Checkpoint
    printf("Testing Checkpoint...\n");
    // Create a change
    snprintf(cmd, sizeof(cmd), "echo 'change' >> %s/README.md", test_dir);
    system(cmd);
    
    if (git_workflow_checkpoint("setup-env") != 0) {
        printf("FAILED: Checkpoint\n");
        return;
    }

    // 3. Finalize
    printf("Testing Finalize...\n");
    if (git_workflow_finalize_task("101", "master") != 0) {
        printf("FAILED: Finalize\n");
        return;
    }

    printf("Git Workflow Test PASSED.\n");
    printf("Inspect %s to see git log.\n", test_dir);
}

void run_agent_test() {
    printf("Running Agent Orchestration Test...\n");
    
    // DB Init required for logging
    if (db_init("agent_test.db") != 0) {
        printf("FAILED: DB Init\n");
        return;
    }

    gallium_agent_manager_init();

    // 1. Spawn Agents
    Agent* top_manager = gallium_agent_spawn(AGENT_ROLE_TOP_MANAGER);
    Agent* task_manager = gallium_agent_spawn(AGENT_ROLE_TASK_MANAGER);
    
    if (!top_manager || !task_manager) {
        printf("FAILED: Agent Spawn\n");
        return;
    }
    printf("Agents spawned successfully.\n");

    // 2. Concurrency Test
    // Send messages simultaneously
    gallium_agent_send(top_manager, "Analyze the project structure.");
    gallium_agent_send(task_manager, "Task Manager: Break down 'Build a Rocket'.");
    
    // Wait for processing (simple sleep for test)
    sleep(2);

    // 3. Loop Detection Test
    printf("Testing Loop Detection...\n");
    Agent* loopy = gallium_agent_spawn(AGENT_ROLE_CODER);
    gallium_agent_send(loopy, "Edit file A");
    gallium_agent_send(loopy, "Edit file A");
    gallium_agent_send(loopy, "Edit file A"); // Should trigger loop logic on processing
    
    sleep(1);

    // Cleanup
    gallium_agent_shutdown(top_manager);
    gallium_agent_shutdown(task_manager);
    gallium_agent_shutdown(loopy);
    db_close();

    printf("Agent Test Completed. Check agent_test.db or stdout logs.\n");
}

int main(int argc, char **argv) {
    if (argc > 1 && strcmp(argv[1], "--test-git") == 0) {
        run_git_test();
        return 0;
    }
    if (argc > 1 && strcmp(argv[1], "--test-agents") == 0) {
        run_agent_test();
        return 0;
    }

    printf("Gallium Server Initializing...\n");

    signal(SIGINT, sigint_handler);
    
    // Initialize Sandbox
    sandbox_init(".");
    
    // Initialize Git Workflow (default to current dir for now)
    git_workflow_init(".");

    // Initialize Database
    if (db_init("db/project.db") != 0) {
        fprintf(stderr, "Failed to initialize database\n");
        return 1;
    }
    printf("Opened database successfully\n");

    // Initialize Network
    if (network_init(7681) != 0) {
        fprintf(stderr, "Failed to initialize network\n");
        db_close();
        return 1;
    }
    printf("Gallium Server running on port 7681...\n");

    // Test Audit Log
    gallium_log("server", "{\"message\": \"Server started\", \"version\": \"0.1.0\"}");

    // Main Loop
    while (!interrupted) {
        network_service();
    }

    printf("Shutting down...\n");
    network_cleanup();
    db_close();
    printf("Gallium Server exiting cleanly.\n");

    return 0;
}
