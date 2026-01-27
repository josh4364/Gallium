#define _XOPEN_SOURCE 600
#include <notcurses/notcurses.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <time.h>
#include <errno.h>
#include <unistd.h>
#include <poll.h>
#include <sys/time.h>
#include "network.h"
#include "ui.h"

double get_ms() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (double)tv.tv_sec * 1000.0 + (double)tv.tv_usec / 1000.0;
}

int main(int argc, char **argv) {
    if (freopen("client_debug.log", "w", stdout) == NULL) return EXIT_FAILURE;
    if (freopen("client_debug.log", "w", stderr) == NULL) return EXIT_FAILURE;

    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IOLBF, 0);

    fprintf(stderr, "Starting Gallium Client (Full Mode)...\n");

    struct notcurses_options nopts = {
        .flags = NCOPTION_SUPPRESS_BANNERS | NCOPTION_DRAIN_INPUT | NCOPTION_NO_WINCH_SIGHANDLER,
    };
    
    FILE* ttyfp = fopen("/dev/tty", "r+");
    if (!ttyfp) {
        fprintf(stderr, "Failed to open /dev/tty: %s\n", strerror(errno));
        return EXIT_FAILURE;
    }
    setvbuf(ttyfp, NULL, _IONBF, 0);

    struct notcurses* nc = notcurses_init(&nopts, ttyfp);
    if(nc == NULL){
        fprintf(stderr, "Failed to initialize notcurses\n");
        fclose(ttyfp);
        return EXIT_FAILURE;
    }

    notcurses_mice_enable(nc, NCMICE_BUTTON_EVENT);

    gallium_ui_t* ui = ui_init(nc);
    if (!ui) {
        fprintf(stderr, "Failed to initialize UI\n");
        notcurses_stop(nc);
        fclose(ttyfp);
        return EXIT_FAILURE;
    }

    client_network_set_ui(ui);
    if (client_network_init("127.0.0.1", 7681) != 0) {
        fprintf(stderr, "Network init failed\n");
    }

    client_network_send(GALLIUM_MSG_INIT, "{\"client\": \"tui\", \"action\": \"handshake\"}");

    int input_fd = notcurses_inputready_fd(nc);

    int running = 1;
    double last_render_time = 0;

    while (running) {
        double now = get_ms();
        
        ui_process_network_messages(ui);

        if (ui->needs_render || (now - last_render_time > 500.0)) {
            if (now - last_render_time > 33.33) {
                pthread_mutex_lock(&ui->state_mutex);
                ui_render(ui);
                ui->needs_render = false;
                pthread_mutex_unlock(&ui->state_mutex);
                last_render_time = now;
            }
        }

        struct pollfd fds[1];
        fds[0].fd = input_fd;
        fds[0].events = POLLIN;

        int ret = poll(fds, 1, 10);

        if (ret > 0 && (fds[0].revents & POLLIN)) {
            struct ncinput ni;
            uint32_t val;
            struct timespec ts_zero = {0, 0};
            while ((val = notcurses_get(nc, &ts_zero, &ni)) != 0) {
                if (val == (uint32_t)-1) break;
                if (val == 'q' || (val == NCKEY_ESC && !ni.alt && !ni.ctrl)) {
                    running = 0;
                    break;
                } else if (val == NCKEY_RESIZE) {
                    pthread_mutex_lock(&ui->state_mutex);
                    ui_resize(ui);
                    ui->needs_render = true;
                    pthread_mutex_unlock(&ui->state_mutex);
                } else {
                    pthread_mutex_lock(&ui->state_mutex);
                    ui_handle_input(ui, &ni);
                    ui->needs_render = true;
                    pthread_mutex_unlock(&ui->state_mutex);
                }
            }
        } else if (ret < 0 && errno != EINTR) {
            break;
        }
    }

    ui_deinit(ui);
    notcurses_stop(nc);
    if (ttyfp) fclose(ttyfp);
    client_network_cleanup();
    return EXIT_SUCCESS;
}