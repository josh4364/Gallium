#define _XOPEN_SOURCE 600
#include <notcurses/notcurses.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include "common/protocol.h"

int main(int argc, char **argv) {
    struct notcurses_options nopts = {
        .flags = 0,
    };
    struct notcurses* nc = notcurses_init(&nopts, NULL);
    if(nc == NULL){
        return EXIT_FAILURE;
    }

    struct ncplane* ncp = notcurses_stdplane(nc);
    ncplane_set_fg_rgb(ncp, 0x00FF00); // Green
    
    int dimy, dimx;
    ncplane_dim_yx(ncp, &dimy, &dimx);

    const char* msg = "Gallium TUI v0.1";
    ncplane_putstr_yx(ncp, dimy / 2, (dimx - strlen(msg)) / 2, msg);

    notcurses_render(nc);

    // Wait for keypress
    uint32_t ni;
    struct ncinput ni_struct;
    notcurses_get_blocking(nc, &ni_struct);

    notcurses_stop(nc);
    return EXIT_SUCCESS;
}
