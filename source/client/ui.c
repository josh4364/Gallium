#define _DEFAULT_SOURCE
#define _XOPEN_SOURCE 600
#include "ui.h"
#include <stdlib.h>
#include <string.h>
#include "network.h"
#include "common/protocol.h"
#include <dirent.h>
#include <unistd.h>
#include <limits.h>

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

static void refresh_file_list(gallium_ui_t* ui);

static void update_plane_borders(gallium_ui_t* ui) {
    struct ncplane* planes[] = {ui->col_icons, ui->col_tasks, ui->col_subtasks, ui->col_events, ui->file_browser};
    const char* titles[] = {" Projects ", " Tasks ", " Sub-Tasks ", " Events ", " File Browser "};
    
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
        
        ncplane_putstr_yx(planes[i], 0, 2, titles[i]);
    }
}

gallium_ui_t* ui_init(struct notcurses* nc) {
    gallium_ui_t* ui = calloc(1, sizeof(gallium_ui_t));
    ui->nc = nc;
    ui->stdplane = notcurses_stdplane(nc);
    ui->focus = FOCUS_TASKS;
    ui->waterfall_visible = false;
    
    // Init Defaults
    if (getcwd(ui->current_dir, sizeof(ui->current_dir)) == NULL) {
        strcpy(ui->current_dir, ".");
    }
    strcpy(ui->api_key, "sk-.......");
    ui->push_on_subtask = false;
    ui->push_on_final = true;

    refresh_file_list(ui);
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
    if (ui->file_browser) ncplane_destroy(ui->file_browser);
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
    int bar_h = 1;
    int files_h = (dimy - bar_h) / 4;
    if (files_h < 5) files_h = 5;
    if (files_h > 15) files_h = 15;
    if (dimy < 20) files_h = 0; // Hide if too small

    int main_y = bar_h;
    int main_h = dimy - bar_h - files_h;
    
    int icons_w = 10;
    int remaining_w = dimx - icons_w;
    int tasks_w = remaining_w * 0.25;
    int subtasks_w = remaining_w * 0.25;
    int events_w = dimx - icons_w - tasks_w - subtasks_w;

    ui->col_icons = create_bordered_plane(ui->stdplane, main_y, 0, main_h, icons_w, " Projects ");
    ui->col_tasks = create_bordered_plane(ui->stdplane, main_y, icons_w, main_h, tasks_w, " Tasks ");
    ui->col_subtasks = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w, main_h, subtasks_w, " Sub-Tasks ");
    ui->col_events = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w + subtasks_w, main_h, events_w, " Events ");

    if (files_h > 0) {
        ui->file_browser = create_bordered_plane(ui->stdplane, main_y + main_h, 0, files_h, dimx, " File Browser ");
    } else {
        ui->file_browser = NULL;
    }

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

static void refresh_file_list(gallium_ui_t* ui) {
    if (ui->file_list) {
        for (int i = 0; i < ui->file_count; i++) {
            free(ui->file_list[i]);
        }
        free(ui->file_list);
        ui->file_list = NULL;
    }
    ui->file_count = scandir(ui->current_dir, &ui->file_list, NULL, alphasort);
    if (ui->file_count < 0) ui->file_count = 0;
}

static void render_file_browser(gallium_ui_t* ui) {
    if (!ui->file_browser) return;
    
    // Clear content
    ncplane_erase(ui->file_browser);
    update_plane_borders(ui); // Redraw border (erase clears it?) No, erase clears content. But let's be safe.
    // Actually ncplane_erase might clear borders if they are on the plane. 
    // update_plane_borders redraws perimeter.
    
    // Title with path
    ncplane_printf_yx(ui->file_browser, 0, 2, " File Browser: %s ", ui->current_dir);

    if (!ui->file_list) return;

    int dimy, dimx;
    ncplane_dim_yx(ui->file_browser, &dimy, &dimx);
    int content_h = dimy - 2;
    int content_w = dimx - 2;
    
    int start_idx = 0;
    if (ui->file_selected_idx > content_h - 1) {
        start_idx = ui->file_selected_idx - (content_h - 1);
    }

    for (int i = 0; i < content_h; i++) {
        int idx = start_idx + i;
        if (idx >= ui->file_count) break;
        
        struct dirent* ent = ui->file_list[idx];
        uint64_t channels = 0;
        
        if (idx == ui->file_selected_idx) {
            ncchannels_set_fg_rgb(&channels, 0x000000);
            ncchannels_set_bg_rgb(&channels, 0x00FF00); // Green Highlight
        } else {
            if (ent->d_type == DT_DIR) {
                ncchannels_set_fg_rgb(&channels, 0x5555FF); // Blue for dirs
            } else {
                ncchannels_set_fg_rgb(&channels, 0xCCCCCC);
            }
        }
        
        ncplane_set_base(ui->file_browser, " ", 0, 0); // Reset
        ncplane_putstr_yx(ui->file_browser, i + 1, 1, " "); // Padding
        ncplane_putstr_yx(ui->file_browser, i + 1, 2, ent->d_name);
        
        // Highlight full bar width
        if (idx == ui->file_selected_idx) {
             ncplane_cursor_move_yx(ui->file_browser, i+1, 1);
             ncplane_set_channels(ui->file_browser, channels);
             for(int k=0; k<content_w; k++) {
                 // Print spaces to fill background, overwriting text color effectively?
                 // Notcurses is tricky. 
                 // Simpler: Just set channels before printing name.
             }
             // Let's rely on standard printing.
             ncplane_putstr_yx(ui->file_browser, i + 1, 1, ent->d_name);
             // Fill rest with spaces for selection bar?
             int len = strlen(ent->d_name);
             for(int s=len; s<content_w-2; s++) ncplane_putchar(ui->file_browser, ' ');
        } else {
             ncplane_cursor_move_yx(ui->file_browser, i+1, 1);
             ncplane_set_channels(ui->file_browser, channels);
             ncplane_putstr(ui->file_browser, ent->d_name);
        }
    }
}

static struct ncplane* create_settings_modal(gallium_ui_t* ui) {
    int dimy, dimx;
    ncplane_dim_yx(ui->stdplane, &dimy, &dimx);
    
    int h = 12;
    int w = 50;
    int y = (dimy - h) / 2;
    int x = (dimx - w) / 2;
    
    struct ncplane_options opts = {
        .y = y, .x = x, .rows = h, .cols = w,
    };
    struct ncplane* modal = ncplane_create(ui->stdplane, &opts);
    if (!modal) return NULL;
    
    uint64_t bg = 0;
    ncchannels_set_bg_rgb(&bg, 0x222222);
    ncchannels_set_fg_rgb(&bg, 0xFFFFFF);
    ncplane_set_base(modal, " ", 0, bg);
    ncplane_perimeter_rounded(modal, 0, bg, 0);
    ncplane_putstr_yx(modal, 0, 2, " Settings ");
    
    const char* labels[] = {
        "API Key",
        "Push on Sub-task",
        "Push on Final Task"
    };
    
    char values[3][64];
    snprintf(values[0], 64, "%s", ui->api_key);
    snprintf(values[1], 64, "[%s]", ui->push_on_subtask ? "ON" : "OFF");
    snprintf(values[2], 64, "[%s]", ui->push_on_final ? "ON" : "OFF");
    
    for (int i = 0; i < 3; i++) {
        if (i == ui->settings_idx) {
            ncplane_putstr_yx(modal, 2 + i*2, 2, "> ");
        } else {
            ncplane_putstr_yx(modal, 2 + i*2, 2, "  ");
        }
        ncplane_printf(modal, "%s: %s", labels[i], values[i]);
    }
    
    ncplane_putstr_yx(modal, h-2, 2, "Use Arrow Keys to Navigate, Enter to Toggle");
    return modal;
}

static struct ncplane* create_approval_modal(gallium_ui_t* ui) {
    int dimy, dimx;
    ncplane_dim_yx(ui->stdplane, &dimy, &dimx);
    
    int w = 60;
    int h = 10;
    int y = (dimy - h) / 2;
    int x = (dimx - w) / 2;
    
    struct ncplane_options opts = {
        .y = y, .x = x, .rows = h, .cols = w,
        .flags = NCPLANE_OPTION_HORALIGNED
    };
    struct ncplane* modal = ncplane_create(ui->stdplane, &opts);
    if (!modal) return NULL;

    uint64_t channels = 0;
    ncchannels_set_bg_rgb(&channels, 0x880000); // Red background
    ncchannels_set_fg_rgb(&channels, 0xFFFFFF);
    ncplane_set_base(modal, " ", 0, channels);
    ncplane_perimeter_rounded(modal, 0, channels, 0);
    
    ncplane_putstr_yx(modal, 1, 2, "APPROVAL REQUIRED");
    ncplane_putstr_yx(modal, 3, 2, ui->approval_prompt);
    ncplane_putstr_yx(modal, h-2, 2, "Press [Y] to Approve, [N] to Reject");

    return modal;
}

void ui_render(gallium_ui_t* ui) {
    // Update top bar with state
    ncplane_cursor_move_yx(ui->top_bar, 0, 0);
    ncplane_printf(ui->top_bar, " GALLIUM | Project: Alpha | [S]top: %s | [P]refs: %s ", 
                   ui->panic_pressed ? "!!! PANIC !!!" : "Running",
                   ui->settings_open ? "Open" : "Closed");

    update_plane_borders(ui);
    render_file_browser(ui);

    // Transients
    struct ncplane* settings_modal = NULL;
    if (ui->settings_open) {
        settings_modal = create_settings_modal(ui);
    }
    
    struct ncplane* approval_modal = NULL;
    if (ui->pending_approval) {
        approval_modal = create_approval_modal(ui);
    }

    notcurses_render(ui->nc);

    if (settings_modal) ncplane_destroy(settings_modal);
    if (approval_modal) ncplane_destroy(approval_modal);
}

void ui_deinit(gallium_ui_t* ui) {
    if (!ui) return;
    if (ui->file_list) {
        for(int i=0; i<ui->file_count; i++) free(ui->file_list[i]);
        free(ui->file_list);
    }
    free(ui);
}

void ui_show_approval(gallium_ui_t* ui, const char* prompt) {
    if (!ui) return;
    ui->pending_approval = true;
    strncpy(ui->approval_prompt, prompt, sizeof(ui->approval_prompt) - 1);
}

void ui_handle_input(gallium_ui_t* ui, uint32_t key) {
    // 1. Modal Interactions
    if (ui->pending_approval) {
        if (key == 'y' || key == 'Y') {
            ui->pending_approval = false;
            client_network_send(GALLIUM_MSG_USER_INPUT, "{\"approved\": true}");
        } else if (key == 'n' || key == 'N' || key == NCKEY_ESC) {
            ui->pending_approval = false;
            client_network_send(GALLIUM_MSG_USER_INPUT, "{\"approved\": false}");
        }
        return;
    }

    if (ui->settings_open) {
        switch (key) {
            case NCKEY_UP:
                if (ui->settings_idx > 0) ui->settings_idx--;
                break;
            case NCKEY_DOWN:
                if (ui->settings_idx < 2) ui->settings_idx++;
                break;
            case NCKEY_ENTER:
                if (ui->settings_idx == 0) {
                    // API Key - mock input
                } else if (ui->settings_idx == 1) {
                    ui->push_on_subtask = !ui->push_on_subtask;
                } else if (ui->settings_idx == 2) {
                    ui->push_on_final = !ui->push_on_final;
                }
                break;
            case 'p':
            case 'P':
            case NCKEY_ESC:
                ui->settings_open = false;
                break;
        }
        return;
    }

    // 2. Global Toggles
    if (key == 'w' || key == 'W') {
        ui->waterfall_visible = !ui->waterfall_visible;
        ui_resize(ui);
        return;
    }
    if (key == 's' || key == 'S') {
        ui->panic_pressed = !ui->panic_pressed;
        return;
    }
    if (key == 'p' || key == 'P') {
        ui->settings_open = true;
        return;
    }

    // 3. Navigation
    if (key == NCKEY_TAB) {
        ui->focus = (ui->focus + 1) % FOCUS_COUNT;
        update_plane_borders(ui);
        return;
    }

    // Directional Navigation between panes
    if (key == NCKEY_DOWN) {
        if (ui->focus != FOCUS_FILES && ui->focus != FOCUS_EVENTS) { // Allow down to file browser
             // From columns to file browser
             if (ui->file_browser) {
                 ui->focus = FOCUS_FILES;
                 update_plane_borders(ui);
                 return;
             }
        } else if (ui->focus == FOCUS_FILES) {
            // Scroll file list
            if (ui->file_selected_idx < ui->file_count - 1) {
                ui->file_selected_idx++;
            }
            return;
        }
    }
    if (key == NCKEY_UP) {
        if (ui->focus == FOCUS_FILES) {
            // If at top of list, move focus up to Tasks?
            /* 
            if (ui->file_selected_idx == 0) {
                ui->focus = FOCUS_TASKS;
                update_plane_borders(ui);
                return; 
            }
            */
            // Better: Strict Pane navigation logic or Scroll logic.
            // Let's implement Scroll only for now, rely on Tab or special keys for Pane switching?
            // Or use Shift+Arrow?
            // "Logic: Use arrow keys or Tab to cycle focus."
            // Simple: Left/Right cycles columns. Up/Down moves inside list.
            // How to get to File Browser? Tab. Or Down from Columns?
            // Let's keep Tab for cycling.
            
            if (ui->file_selected_idx > 0) {
                ui->file_selected_idx--;
            }
            return;
        }
    }

    if (key == NCKEY_RIGHT) {
        if (ui->focus < FOCUS_COUNT - 1) {
            ui->focus++;
            update_plane_borders(ui);
        }
    }
    if (key == NCKEY_LEFT) {
        if (ui->focus > 0) {
            ui->focus--;
            update_plane_borders(ui);
        }
    }

    // 4. Content Interaction
    if (ui->focus == FOCUS_FILES) {
        if (key == NCKEY_ENTER) {
            if (ui->file_selected_idx < ui->file_count) {
                struct dirent* ent = ui->file_list[ui->file_selected_idx];
                bool is_dir = (ent->d_type == DT_DIR);
                // Handle DT_UNKNOWN if needed, but keeping simple for now
                
                if (is_dir) {
                    if (strcmp(ent->d_name, ".") == 0) return;
                    
                    int ret;
                    if (strcmp(ent->d_name, "..") == 0) {
                        ret = chdir("..");
                    } else {
                        ret = chdir(ent->d_name);
                    }
                    
                    if (ret == 0) {
                        if (getcwd(ui->current_dir, sizeof(ui->current_dir)) == NULL) {
                            strcpy(ui->current_dir, "Error getting path");
                        }
                        refresh_file_list(ui);
                        ui->file_selected_idx = 0;
                    }
                }
            }
        } else if (key == NCKEY_BACKSPACE) {
            if (chdir("..") == 0) {
                if (getcwd(ui->current_dir, sizeof(ui->current_dir)) == NULL) {
                    strcpy(ui->current_dir, "Error getting path");
                }
                refresh_file_list(ui);
                ui->file_selected_idx = 0;
            }
        }
    }
}
