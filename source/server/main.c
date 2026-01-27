#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libwebsockets.h>
#include "db_manager.h"
#include "common/protocol.h"

int main(int argc, char **argv) {
    printf("Gallium Server Initializing...\n");

    // Initialize Database
    if (db_init("db/project.db") != 0) {
        fprintf(stderr, "Failed to initialize database\n");
        return 1;
    }
    printf("Opened database successfully\n");

    // Test Audit Log
    gallium_log("server", "{\"message\": \"Server started\", \"version\": \"0.1.0\"}");

    // libwebsockets Initialization
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = 7681;
    info.protocols = NULL; // We'll add protocols later
    info.gid = -1;
    info.uid = -1;

    struct lws_context *context = lws_create_context(&info);
    if (!context) {
        fprintf(stderr, "lws_create_context failed\n");
        return 1;
    }

    printf("Gallium Server running on port %d...\n", info.port);

    // Minimal loop (just for bootstrap, normally this would run infinitely)
    for (int i = 0; i < 5; i++) {
        lws_service(context, 50);
    }

    lws_context_destroy(context);
    db_close();
    printf("Gallium Server exhiting cleanly.\n");

    return 0;
}
