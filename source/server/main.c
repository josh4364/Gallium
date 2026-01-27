#include <stdio.h>
#include <stdlib.h>
#include <sqlite3.h>
#include <libwebsockets.h>
#include "common/protocol.h"

int main(int argc, char **argv) {
    printf("Gallium Server Initializing...\n");

    // SQLite Initialization
    sqlite3 *db;
    int rc = sqlite3_open("db/gallium.db", &db);
    if (rc) {
        fprintf(stderr, "Can't open database: %s\n", sqlite3_errmsg(db));
        return 1;
    } else {
        printf("Opened database successfully\n");
    }
    sqlite3_close(db);

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
    printf("Gallium Server exhiting cleanly.\n");

    return 0;
}
