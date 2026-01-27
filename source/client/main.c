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
    while (running) {
        client_network_service();

        struct ncinput ni;
        struct timespec zero_ts = {0, 0};
        uint32_t val = notcurses_get(nc, &zero_ts, &ni);
        if (val != 0) {
            if (val == 'q' || val == NCKEY_ESC) {
                running = 0;
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
        
        notcurses_render(nc);
        
        // Don't burn CPU
        struct timespec ts = {0, 10000000}; // 10ms
        nanosleep(&ts, NULL);
    }

    notcurses_stop(nc);
    client_network_cleanup();
    return EXIT_SUCCESS;
}
