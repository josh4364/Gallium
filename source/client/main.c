#define _XOPEN_SOURCE 600
#include <notcurses/notcurses.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <time.h>
#include "common/protocol.h"
#include "network.h"

int main(int argc, char **argv) {
    // Initialize Network
    if (client_network_init("localhost", 7681) != 0) {
        fprintf(stderr, "Failed to initialize client network\n");
        return EXIT_FAILURE;
    }

    struct notcurses_options nopts = {
        .flags = 0,
    };
    struct notcurses* nc = notcurses_init(&nopts, NULL);
    if(nc == NULL){
        client_network_cleanup();
        return EXIT_FAILURE;
    }

    struct ncplane* ncp = notcurses_stdplane(nc);
    ncplane_set_fg_rgb(ncp, 0x00FF00); // Green
    
    int dimy, dimx;
    ncplane_dim_yx(ncp, &dimy, &dimx);

    const char* msg = "Gallium TUI v0.1";
    ncplane_putstr_yx(ncp, dimy / 2, (dimx - strlen(msg)) / 2, msg);
    
    const char* status = "Connecting...";
    ncplane_putstr_yx(ncp, dimy / 2 + 1, (dimx - strlen(status)) / 2, status);

    notcurses_render(nc);

    // Send a test message
    client_network_send(GALLIUM_MSG_INIT, "{\"client\": \"tui\", \"action\": \"handshake\"}");

    // Main loop
    int running = 1;
    int show_debug = 0;
    while (running) {
        client_network_service();

        struct ncinput ni;
        struct timespec zero_ts = {0, 0};
        uint32_t val = notcurses_get(nc, &zero_ts, &ni);
        if (val != 0) {
            if (val == 'q' || val == NCKEY_ESC) {
                running = 0;
            } else if (val == 'd') {
                show_debug = !show_debug;
            }
        }

        // Update status if connected
        if (client_network_is_connected()) {
            const char* online = "Status: Online ";
            ncplane_putstr_yx(ncp, dimy / 2 + 1, (dimx - strlen(online)) / 2, online);
        } else {
            const char* offline = "Status: Offline";
            ncplane_putstr_yx(ncp, dimy / 2 + 1, (dimx - strlen(offline)) / 2, offline);
        }

        if (show_debug) {
            char** logs;
            int count = client_network_get_debug_logs(&logs);
            ncplane_set_fg_rgb(ncp, 0xFFFF00); // Yellow
            ncplane_putstr_yx(ncp, 2, 2, "--- Network Debug ---");
            for (int i = 0; i < count; i++) {
                if (logs[i]) {
                    ncplane_putstr_yx(ncp, 3 + i, 2, logs[i]);
                }
            }
            ncplane_set_fg_rgb(ncp, 0x00FF00); // Reset to green
        } else {
            // Clear debug area (simple way: overwrite with spaces)
            for (int i = 0; i < 7; i++) {
                ncplane_putstr_yx(ncp, 2 + i, 2, "                                        ");
            }
        }
        
        notcurses_render(nc);
        
        // Don't burn CPU
        struct timespec ts = {0, 10000000}; // 10ms
        nanosleep(&ts, NULL);
    }

    notcurses_stop(nc);
    client_network_cleanup();
    return EXIT_SUCCESS;
}
