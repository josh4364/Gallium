#define _XOPEN_SOURCE 600
#include "ui.h"
#include <stdlib.h>
#include <string.h>

#define COLOR_FOCUS_BORDER 0x00FF00 // Green
#define COLOR_NORMAL_BORDER 0x444444 // Gray
#define COLOR_TOP_BAR_BG 0x222222
#define COLOR_WATERFALL_BG 0x111111

static struct ncplane* create_bordered_plane(struct ncplane* parent, int y, int x, int rows, int cols, const char* title) {
    struct ncplane_options opts = {
        .y = y,
        .x = x,
        .rows = rows,
        .cols = cols,
    };
    struct ncplane* ncp = ncplane_create(parent, &opts);
    if (!ncp) return NULL;

    ncplane_cursor_move_yx(ncp, 0, 0);
    ncplane_perimeter_rounded(ncp, 0, 0, 0);
    if (title) {
        ncplane_putstr_yx(ncp, 0, 2, title);
    }
    return ncp;
}

static void update_plane_borders(gallium_ui_t* ui) {
    struct ncplane* planes[] = {ui->col_icons, ui->col_tasks, ui->col_subtasks, ui->col_events};
    for (int i = 0; i < FOCUS_COUNT; i++) {
        if (!planes[i]) continue;
        uint64_t channels = 0;
        if (ui->focus == (ui_focus_t)i) {
            ncchannels_set_fg_rgb(&channels, COLOR_FOCUS_BORDER);
        } else {
            ncchannels_set_fg_rgb(&channels, COLOR_NORMAL_BORDER);
        }
        ncplane_cursor_move_yx(planes[i], 0, 0);
        ncplane_perimeter_rounded(planes[i], 0, channels, 0);
        
        const char* titles[] = {" Projects ", " Tasks ", " Sub-Tasks ", " Events "};
        ncplane_putstr_yx(planes[i], 0, 2, titles[i]);
    }
}

gallium_ui_t* ui_init(struct notcurses* nc) {
    gallium_ui_t* ui = calloc(1, sizeof(gallium_ui_t));
    ui->nc = nc;
    ui->stdplane = notcurses_stdplane(nc);
    ui->focus = FOCUS_TASKS;
    ui->waterfall_visible = false;

    ui_resize(ui);
    return ui;
}

void ui_resize(gallium_ui_t* ui) {
    int dimy, dimx;
    ncplane_dim_yx(ui->stdplane, &dimy, &dimx);

    // Destroy existing planes if they exist
    if (ui->top_bar) ncplane_destroy(ui->top_bar);
    if (ui->col_icons) ncplane_destroy(ui->col_icons);
    if (ui->col_tasks) ncplane_destroy(ui->col_tasks);
    if (ui->col_subtasks) ncplane_destroy(ui->col_subtasks);
    if (ui->col_events) ncplane_destroy(ui->col_events);
    if (ui->waterfall) ncplane_destroy(ui->waterfall);

    // Top Bar
    struct ncplane_options top_opts = {
        .y = 0, .x = 0, .rows = 1, .cols = dimx,
    };
    ui->top_bar = ncplane_create(ui->stdplane, &top_opts);
    uint64_t top_channels = 0;
    ncchannels_set_bg_rgb(&top_channels, COLOR_TOP_BAR_BG);
    ncchannels_set_fg_rgb(&top_channels, 0xFFFFFF);
    ncplane_set_base(ui->top_bar, " ", 0, top_channels);
    ncplane_putstr_yx(ui->top_bar, 0, 2, "GALLIUM | Project: Alpha | [S]top | [Set]tings");

    // Layout math
    int main_y = 1;
    int main_h = dimy - 1;
    int icons_w = 10;
    int remaining_w = dimx - icons_w;
    int tasks_w = remaining_w * 0.25;
    int subtasks_w = remaining_w * 0.25;
    int events_w = dimx - icons_w - tasks_w - subtasks_w;

    ui->col_icons = create_bordered_plane(ui->stdplane, main_y, 0, main_h, icons_w, " Projects ");
    ui->col_tasks = create_bordered_plane(ui->stdplane, main_y, icons_w, main_h, tasks_w, " Tasks ");
    ui->col_subtasks = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w, main_h, subtasks_w, " Sub-Tasks ");
    ui->col_events = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w + subtasks_w, main_h, events_w, " Events ");

    // Waterfall (hidden by default)
    if (ui->waterfall_visible) {
        struct ncplane_options wf_opts = {
            .y = main_y, .x = dimx / 2, .rows = main_h, .cols = dimx / 2,
        };
        ui->waterfall = ncplane_create(ui->stdplane, &wf_opts);
        uint64_t wf_channels = 0;
        ncchannels_set_bg_rgb(&wf_channels, COLOR_WATERFALL_BG);
        ncplane_set_base(ui->waterfall, " ", 0, wf_channels);
        ncplane_cursor_move_yx(ui->waterfall, 0, 0);
        ncplane_perimeter_rounded(ui->waterfall, 0, 0, 0);
        ncplane_putstr_yx(ui->waterfall, 0, 2, " Waterfall Logs ");
    }

    update_plane_borders(ui);
}

void ui_deinit(gallium_ui_t* ui) {
    if (!ui) return;
    // Planes are children of stdplane and will be cleaned up by notcurses_stop,
    // but we should be clean if we want to re-init.
    free(ui);
}

void ui_render(gallium_ui_t* ui) {
    // Update top bar with state
    ncplane_cursor_move_yx(ui->top_bar, 0, 0);
    ncplane_printf(ui->top_bar, " GALLIUM | Project: Alpha | [S]top: %s | [P]refs: %s ", 
                   ui->panic_pressed ? "!!! PANIC !!!" : "Running",
                   ui->settings_open ? "Open" : "Closed");

    notcurses_render(ui->nc);
}

void ui_handle_input(gallium_ui_t* ui, uint32_t key) {
    switch (key) {
        case NCKEY_TAB:
            ui->focus = (ui->focus + 1) % FOCUS_COUNT;
            update_plane_borders(ui);
            break;
        case NCKEY_RIGHT:
            if (ui->focus < FOCUS_COUNT - 1) {
                ui->focus++;
                update_plane_borders(ui);
            }
            break;
        case NCKEY_LEFT:
            if (ui->focus > 0) {
                ui->focus--;
                update_plane_borders(ui);
            }
            break;
        case 'w':
        case 'W':
            ui->waterfall_visible = !ui->waterfall_visible;
            ui_resize(ui);
            break;
        case 's':
        case 'S':
            ui->panic_pressed = !ui->panic_pressed;
            break;
        case 'p':
        case 'P':
            ui->settings_open = !ui->settings_open;
            break;
    }
}
