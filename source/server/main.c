#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include "db_manager.h"
#include "network.h"
#include "sandbox.h"
#include "common/protocol.h"

static int interrupted = 0;

void sigint_handler(int sig) {
    interrupted = 1;
}

int main(int argc, char **argv) {
    printf("Gallium Server Initializing...\n");

    signal(SIGINT, sigint_handler);
    
    // Initialize Sandbox
    sandbox_init(".");

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
