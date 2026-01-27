#define _XOPEN_SOURCE 600
#include <notcurses/notcurses.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <time.h>
#include "common/protocol.h"
#include "network.h"
#include "ui.h"

int main(int argc, char **argv) {
    // Initialize Network
    // Initialize Network (deferred until UI is ready)
    if (client_network_init("localhost", 7681) != 0) {
        fprintf(stderr, "Failed to initialize client network\n");
        return EXIT_FAILURE;
    }

    struct notcurses_options nopts = {
        .flags = NCOPTION_SUPPRESS_BANNERS,
    };
    struct notcurses* nc = notcurses_init(&nopts, NULL);
    if(nc == NULL){
        client_network_cleanup();
        return EXIT_FAILURE;
    }

    gallium_ui_t* ui = ui_init(nc);
    if (!ui) {
        notcurses_stop(nc);
        client_network_cleanup();
        return EXIT_FAILURE;
    }
    client_network_set_ui(ui);

    // Send a test message
    client_network_send(GALLIUM_MSG_INIT, "{\"client\": \"tui\", \"action\": \"handshake\"}");

    // Main loop
    int running = 1;
    while (running) {
        client_network_service();

        struct ncinput ni;
        struct timespec zero_ts = {0, 0};
        uint32_t val = notcurses_get(nc, &zero_ts, &ni);
        if (val != 0) {
            if (val == 'q' || val == NCKEY_ESC) {
                running = 0;
            } else if (val == NCKEY_RESIZE) {
                ui_resize(ui);
            } else {
                ui_handle_input(ui, val);
            }
        }

        ui_render(ui);
        
        // Don't burn CPU
        struct timespec ts = {0, 10000000}; // 10ms
        nanosleep(&ts, NULL);
    }

    ui_deinit(ui);
    notcurses_stop(nc);
    client_network_cleanup();
    return EXIT_SUCCESS;
}
