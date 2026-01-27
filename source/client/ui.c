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
#include <libnotify/notify.h>
#include <time.h>
#include <json-c/json.h>

#define COLOR_FOCUS_BORDER 0x00FF00 // Green
#define COLOR_NORMAL_BORDER 0x444444 // Gray
#define COLOR_URGENT_BORDER 0xFF0000 // Red
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
    struct ncplane* planes[] = {ui->col_icons, ui->col_tasks, ui->col_subtasks, ui->col_events, ui->file_browser, ui->col_audit, ui->waterfall};
    const char* titles[] = {" Projects ", " Tasks ", " Sub-Tasks ", " Events ", " File Browser ", " Audit Log ", " Waterfall Logs "};
    
    for (int i = 0; i < FOCUS_COUNT; i++) {
        if (!planes[i]) continue;
        uint64_t channels = 0;
        
        bool urgent = false;
        // Logic for urgency cues: Tasks requiring input are Red
        if (i == FOCUS_TASKS && ui->pending_approval) urgent = true;
        if (i == FOCUS_SUBTASKS && ui->waiting_for_input) urgent = true;

        if (urgent) {
            ncchannels_set_fg_rgb(&channels, COLOR_URGENT_BORDER);
        } else if (ui->focus == (ui_focus_t)i) {
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
    ui->waterfall_filter_noise = true; // Default to filtering
    
    notify_init("Gallium");

    // Init Defaults
    if (getcwd(ui->current_dir, sizeof(ui->current_dir)) == NULL) {
        strcpy(ui->current_dir, ".");
    }
    strcpy(ui->api_key, "sk-.......");
    ui->push_on_subtask = false;
    ui->push_on_final = true;

    gallium_queue_init(&ui->network_queue);
    pthread_mutex_init(&ui->state_mutex, NULL);

    refresh_file_list(ui);
    ui_resize(ui);
    return ui;
}

void ui_resize(gallium_ui_t* ui) {
    int dimy, dimx;
    notcurses_stddim_yx(ui->nc, &dimy, &dimx);
    fprintf(stderr, "ui_resize: new dimensions %dx%d\n", dimx, dimy);

    // Destroy existing planes if they exist
    if (ui->top_bar) ncplane_destroy(ui->top_bar);
    if (ui->col_icons) ncplane_destroy(ui->col_icons);
    if (ui->col_tasks) ncplane_destroy(ui->col_tasks);
    if (ui->col_subtasks) ncplane_destroy(ui->col_subtasks);
    if (ui->col_events) ncplane_destroy(ui->col_events);
    if (ui->col_audit) ncplane_destroy(ui->col_audit);
    if (ui->file_browser) ncplane_destroy(ui->file_browser);
    if (ui->waterfall) ncplane_destroy(ui->waterfall);

    // Top Bar
    struct ncplane_options top_opts = {
        .y = 0, .x = 0, .rows = 1, .cols = dimx,
    };
    ui->top_bar = ncplane_create(ui->stdplane, &top_opts);
    
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
    int tasks_w = remaining_w * 0.20;
    int subtasks_w = remaining_w * 0.20;
    int events_w = remaining_w * 0.30;
    int audit_w = remaining_w - tasks_w - subtasks_w - events_w;

    ui->col_icons = create_bordered_plane(ui->stdplane, main_y, 0, main_h, icons_w, " Projects ");
    ui->col_tasks = create_bordered_plane(ui->stdplane, main_y, icons_w, main_h, tasks_w, " Tasks ");
    ui->col_subtasks = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w, main_h, subtasks_w, " Sub-Tasks ");
    ui->col_events = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w + subtasks_w, main_h, events_w, " Events ");
    ui->col_audit = create_bordered_plane(ui->stdplane, main_y, icons_w + tasks_w + subtasks_w + events_w, main_h, audit_w, " Audit Log ");

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
        
        // Highlight full bar width
        if (idx == ui->file_selected_idx) {
             ncplane_cursor_move_yx(ui->file_browser, i+1, 1);
             ncplane_set_channels(ui->file_browser, channels);
             ncplane_putstr_yx(ui->file_browser, i + 1, 1, ent->d_name);
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
    notcurses_stddim_yx(ui->nc, &dimy, &dimx);
    
    int w = 60;
    int h = 10;
    int y = (dimy - h) / 2;
    int x = (dimx - w) / 2;
    
    struct ncplane_options opts = {
        .y = y, .x = x, .rows = h, .cols = w,
    };
    struct ncplane* modal = ncplane_create(ui->stdplane, &opts);
    if (!modal) return NULL;

    uint64_t channels = 0;
    ncchannels_set_bg_rgb(&channels, 0x880000); // Red background
    ncchannels_set_fg_rgb(&channels, 0xFFFFFF);
    ncplane_set_base(modal, " ", 0, channels);
    ncplane_perimeter_rounded(modal, 0, channels, 0);
    
    ncplane_putstr_yx(modal, h-2, 2, "Press [Y] to Approve, [N] to Reject");

    return modal;
}

static struct ncplane* create_input_modal(gallium_ui_t* ui) {
    int dimy, dimx;
    notcurses_stddim_yx(ui->nc, &dimy, &dimx);
    
    int w = 70;
    int h = 8;
    int y = (dimy - h) / 2;
    int x = (dimx - w) / 2;
    
    struct ncplane_options opts = {
        .y = y, .x = x, .rows = h, .cols = w,
    };
    struct ncplane* modal = ncplane_create(ui->stdplane, &opts);
    if (!modal) return NULL;

    uint64_t channels = 0;
    ncchannels_set_bg_rgb(&channels, 0x000088); // Blue background
    ncchannels_set_fg_rgb(&channels, 0xFFFFFF);
    ncplane_set_base(modal, " ", 0, channels);
    ncplane_perimeter_rounded(modal, 0, channels, 0);
    
    ncplane_putstr_yx(modal, 1, 2, ui->input_prompt);
    
    // Draw input field
    ncplane_cursor_move_yx(modal, 3, 2);
    ncplane_printf(modal, "> %s_", ui->input_buffer); // _ as cursor

    ncplane_putstr_yx(modal, h-2, 2, "Type your answer and press [Enter]");

    return modal;
}

void ui_show_notification(gallium_ui_t* ui, const char* title, const char* body, bool is_success) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    ui->show_notification = true;
    ui->needs_render = true;
    strncpy(ui->notify_title, title, sizeof(ui->notify_title) - 1);
    strncpy(ui->notify_body, body, sizeof(ui->notify_body) - 1);
    ui->notify_is_success = is_success;
    ui->notify_expiry = time(NULL) + 5; // Show for 5 seconds
    pthread_mutex_unlock(&ui->state_mutex);
}

void ui_flash_success(gallium_ui_t* ui) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    ui->success_flash_count = 6; // 3 flashes = 6 state changes (on/off)
    ui->last_flash_time = 0;
    ui->flash_on = false;
    pthread_mutex_unlock(&ui->state_mutex);
}

void ui_trigger_panic(gallium_ui_t* ui) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    ui->panic_active = !ui->panic_active;
    bool active = ui->panic_active;
    pthread_mutex_unlock(&ui->state_mutex);

    if (active) {
        client_network_send(GALLIUM_MSG_PANIC, "{\"active\": true}");
        ui_show_notification(ui, "PANIC", "Panic mode activated! All agents suspended.", false);
    } else {
        client_network_send(GALLIUM_MSG_PANIC, "{\"active\": false}");
        ui_show_notification(ui, "PANIC", "Panic mode deactivated.", true);
    }
}

void ui_update_event_log(gallium_ui_t* ui, struct json_object* events_array) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    if (ui->event_logs_array) {
        json_object_put(ui->event_logs_array);
    }
    ui->event_logs_array = json_object_get(events_array);
    ui->needs_render = true;
    pthread_mutex_unlock(&ui->state_mutex);
}

static void render_audit_log(gallium_ui_t* ui) {
    if (!ui->col_audit) return;
    ncplane_erase(ui->col_audit);
    update_plane_borders(ui);
    
    ncplane_putstr_yx(ui->col_audit, 1, 2, "Historical Events:");
    
    if (!ui->event_logs_array) {
         ncplane_putstr_yx(ui->col_audit, 3, 2, "(No events fetched)");
         return;
    }

    int len = json_object_array_length(ui->event_logs_array);
    int y = 3;
    int dimy, dimx;
    ncplane_dim_yx(ui->col_audit, &dimy, &dimx);
    
    for (int i = 0; i < len; i++) {
        if (y >= dimy - 1) break;
        
        struct json_object* val = json_object_array_get_idx(ui->event_logs_array, i);
        struct json_object* source_obj;
        struct json_object* timestamp_obj;
        struct json_object* payload_obj;
        
        const char* source = "";
        const char* ts = "";
        const char* payload = "";
        
        if (json_object_object_get_ex(val, "source", &source_obj)) source = json_object_get_string(source_obj);
        if (json_object_object_get_ex(val, "timestamp", &timestamp_obj)) ts = json_object_get_string(timestamp_obj);
        
        if (json_object_object_get_ex(val, "payload", &payload_obj)) {
            if (json_object_is_type(payload_obj, json_type_string)) {
                payload = json_object_get_string(payload_obj);
            } else {
                payload = "(JSON)";
            }
        }
        
        ncplane_printf_yx(ui->col_audit, y++, 2, "[%s] %s: %.30s...", ts, source, payload);
    }
}

static bool is_noisy_event(struct json_object* event_obj) {
    struct json_object* source_obj;
    if (json_object_object_get_ex(event_obj, "source", &source_obj)) {
        const char* src = json_object_get_string(source_obj);
        if (strcmp(src, "LLM_MONITOR") == 0) return true;
        if (strcmp(src, "LLM_RAW") == 0) return true;
    }
    struct json_object* payload_obj;
    if (json_object_object_get_ex(event_obj, "payload", &payload_obj)) {
        if (json_object_is_type(payload_obj, json_type_object)) {
             struct json_object* event_type;
             if (json_object_object_get_ex(payload_obj, "event", &event_type)) {
                 const char* type_str = json_object_get_string(event_type);
                 if (strcmp(type_str, "context_report") == 0) return true;
             }
        } else if (json_object_is_type(payload_obj, json_type_string)) {
            const char* s = json_object_get_string(payload_obj);
            if (strstr(s, "context_report")) return true;
        }
    }
    return false;
}

static void render_waterfall(gallium_ui_t* ui) {
    if (!ui->waterfall || !ui->waterfall_visible) return;
    ncplane_erase(ui->waterfall);
    update_plane_borders(ui);
    
    ncplane_printf_yx(ui->waterfall, 1, 2, "Waterfall (Filter: %s) [N] to toggle", ui->waterfall_filter_noise ? "ON" : "OFF");
    
    if (!ui->event_logs_array) {
         ncplane_putstr_yx(ui->waterfall, 3, 2, "(No events)");
         return;
    }

    int len = json_object_array_length(ui->event_logs_array);
    int dimy, dimx;
    ncplane_dim_yx(ui->waterfall, &dimy, &dimx);
    int y = 3;
    
    int visual_idx = 0;
    
    // Simple render (top down)
    for (int i = 0; i < len; i++) {
        struct json_object* val = json_object_array_get_idx(ui->event_logs_array, i);
        
        if (ui->waterfall_filter_noise && is_noisy_event(val)) {
            continue;
        }

        if (y < dimy - 1) {
            struct json_object* source_obj;
            struct json_object* timestamp_obj;
            struct json_object* payload_obj;
            
            const char* source = "";
            const char* ts = "";
            const char* payload = "";
            
            if (json_object_object_get_ex(val, "source", &source_obj)) source = json_object_get_string(source_obj);
            if (json_object_object_get_ex(val, "timestamp", &timestamp_obj)) ts = json_object_get_string(timestamp_obj);
            
            if (json_object_object_get_ex(val, "payload", &payload_obj)) {
                if (json_object_is_type(payload_obj, json_type_string)) {
                    payload = json_object_get_string(payload_obj);
                } else {
                    payload = json_object_to_json_string(payload_obj);
                }
            }
            
            uint64_t channels = 0;
            if (ui->focus == FOCUS_WATERFALL && visual_idx == ui->waterfall_selected_idx) {
                 ncchannels_set_fg_rgb(&channels, 0x000000);
                 ncchannels_set_bg_rgb(&channels, 0x00FF00);
            }
            
            ncplane_set_channels(ui->waterfall, channels);
            ncplane_printf_yx(ui->waterfall, y++, 2, "[%s] %s: %.40s...", ts, source, payload);
            ncplane_set_base(ui->waterfall, " ", 0, 0); // Reset
        }
        visual_idx++;
    }
    ui->waterfall_visible_count = visual_idx;
}

static struct ncplane* create_peek_modal(gallium_ui_t* ui) {
    if (!ui->event_logs_array) return NULL;
    
    int len = json_object_array_length(ui->event_logs_array);
    struct json_object* target = NULL;
    int visual_idx = 0;
    
    for (int i = 0; i < len; i++) {
         struct json_object* val = json_object_array_get_idx(ui->event_logs_array, i);
         if (ui->waterfall_filter_noise && is_noisy_event(val)) continue;
         
         if (visual_idx == ui->waterfall_selected_idx) {
             target = val;
             break;
         }
         visual_idx++;
    }
    
    if (!target) return NULL;
    
    int dimy, dimx;
    ncplane_dim_yx(ui->stdplane, &dimy, &dimx);
    
    int w = dimx - 10;
    int h = dimy - 6;
    int y = 3;
    int x = 5;
    
    struct ncplane_options opts = {
        .y = y, .x = x, .rows = h, .cols = w,
    };
    struct ncplane* modal = ncplane_create(ui->stdplane, &opts);
    if (!modal) return NULL;

    uint64_t channels = 0;
    ncchannels_set_bg_rgb(&channels, 0x000044); // Dark Blue
    ncchannels_set_fg_rgb(&channels, 0xFFFFFF);
    ncplane_set_base(modal, " ", 0, channels);
    ncplane_perimeter_rounded(modal, 0, channels, 0);
    
    ncplane_putstr_yx(modal, 0, 2, " Event Details (Press Esc/Enter to Close) ");
    
    const char* json_str = json_object_to_json_string_ext(target, JSON_C_TO_STRING_PRETTY);
    
    // Very simple wrapping printer or just print as much as fits
    int line = 2;
    int col = 2;
    const char* p = json_str;
    while (*p && line < h - 1) {
        if (*p == '\n') {
            line++;
            col = 2;
            p++;
            continue;
        }
        if (col < w - 2) {
            ncplane_putchar_yx(modal, line, col++, *p);
        }
        p++;
    }
    
    return modal;
}

void ui_render(gallium_ui_t* ui) {
    time_t now = time(NULL);

    // Handle Success Flash
    if (ui->success_flash_count > 0) {
        if (now > ui->last_flash_time) {
            ui->flash_on = !ui->flash_on;
            ui->success_flash_count--;
            ui->last_flash_time = now;
        }
    } else {
        ui->flash_on = false;
    }

    if (ui->flash_on) {
        uint64_t flash_channels = 0;
        ncchannels_set_bg_rgb(&flash_channels, 0x00AA00);
        ncplane_set_base(ui->stdplane, " ", 0, flash_channels);
    } else {
        ncplane_set_base(ui->stdplane, " ", 0, 0);
    }

    // Update top bar with state
    ncplane_erase(ui->top_bar);
    uint64_t top_channels = 0;
    ncchannels_set_bg_rgb(&top_channels, COLOR_TOP_BAR_BG);
    ncchannels_set_fg_rgb(&top_channels, 0xFFFFFF);
    ncplane_set_base(ui->top_bar, " ", 0, top_channels);
    ncplane_putstr_yx(ui->top_bar, 0, 2, "GALLIUM | Project: Alpha | ");
    
    if (ui->panic_active) {
        ncplane_set_fg_rgb(ui->top_bar, 0xFF0000);
        ncplane_putstr(ui->top_bar, "[S]top: !!! PANIC !!!");
    } else {
        ncplane_putstr(ui->top_bar, "[S]top: Running");
    }
    
    ncplane_set_fg_rgb(ui->top_bar, 0xFFFFFF);
    ncplane_printf(ui->top_bar, " | [P]refs: %s ", ui->settings_open ? "Open" : "Closed");

    update_plane_borders(ui);
    render_file_browser(ui);
    render_audit_log(ui);
    render_waterfall(ui);

    struct ncplane* n_plane = NULL;
    // Notification Overlay
    if (ui->show_notification) {
        if (now > ui->notify_expiry) {
            ui->show_notification = false;
        } else {
            int dy, dx;
            ncplane_dim_yx(ui->stdplane, &dy, &dx);
            struct ncplane_options n_opts = {
                .y = 2, .x = dx - 35, .rows = 4, .cols = 30,
            };
            n_plane = ncplane_create(ui->stdplane, &n_opts);
            if (n_plane) {
                uint64_t n_chan = 0;
                ncchannels_set_bg_rgb(&n_chan, ui->notify_is_success ? 0x004400 : 0x440000);
                ncchannels_set_fg_rgb(&n_chan, 0xFFFFFF);
                ncplane_set_base(n_plane, " ", 0, n_chan);
                ncplane_perimeter_rounded(n_plane, 0, n_chan, 0);
                ncplane_putstr_yx(n_plane, 1, 2, ui->notify_title);
                ncplane_putstr_yx(n_plane, 2, 2, ui->notify_body);
            }
        }
    }

    struct ncplane* m_plane = NULL;
    // Modal Overlays - Created only when needed
    if (ui->settings_open) {
        m_plane = create_settings_modal(ui);
    } else if (ui->waterfall_peeking) {
        m_plane = create_peek_modal(ui);
    } else if (ui->pending_approval) {
        m_plane = create_approval_modal(ui);
    } else if (ui->waiting_for_input) {
        m_plane = create_input_modal(ui);
    }

    notcurses_render(ui->nc);

    if (n_plane) ncplane_destroy(n_plane);
    if (m_plane) ncplane_destroy(m_plane);
}

void ui_deinit(gallium_ui_t* ui) {
    if (!ui) return;
    if (ui->file_list) {
        for(int i=0; i<ui->file_count; i++) free(ui->file_list[i]);
        free(ui->file_list);
    }
    if (ui->event_logs_array) json_object_put(ui->event_logs_array);
    gallium_queue_destroy(&ui->network_queue);
    pthread_mutex_destroy(&ui->state_mutex);
    free(ui);
}

void ui_show_approval(gallium_ui_t* ui, const char* prompt) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    ui->pending_approval = true;
    ui->needs_render = true;
    strncpy(ui->approval_prompt, prompt, sizeof(ui->approval_prompt) - 1);
    pthread_mutex_unlock(&ui->state_mutex);
}

void ui_show_input_prompt(gallium_ui_t* ui, const char* prompt) {
    if (!ui) return;
    pthread_mutex_lock(&ui->state_mutex);
    ui->waiting_for_input = true;
    ui->needs_render = true;
    strncpy(ui->input_prompt, prompt, sizeof(ui->input_prompt) - 1);
    memset(ui->input_buffer, 0, sizeof(ui->input_buffer));
    ui->input_cursor = 0;
    pthread_mutex_unlock(&ui->state_mutex);
}

static bool is_mouse_in_plane(struct ncplane* p, int my, int mx) {
    if (!p) return false;
    int py, px, dy, dx;
    ncplane_abs_yx(p, &py, &px);
    ncplane_dim_yx(p, &dy, &dx);
    return (my >= py && my < py + dy && mx >= px && mx < px + dx);
}

void ui_handle_input(gallium_ui_t* ui, const struct ncinput* ni) {
    uint32_t key = ni->id;
    bool is_mouse = nckey_mouse_p(key);
    int my = ni->y, mx = ni->x;

    // Handle Mouse
    if (is_mouse) {
        if (ni->evtype != NCTYPE_RELEASE && ni->evtype != NCTYPE_PRESS) {
            return; // Ignore motion/drag/scroll to avoid event floods
        }
        
        if (ni->evtype == NCTYPE_PRESS) { // Only process on press for immediate feedback
            // Top Bar Clicks
            if (is_mouse_in_plane(ui->top_bar, my, mx)) {
                // Heuristic based on rendered string:
                // " GALLIUM | Project: Alpha | [S]top: Running | [P]refs: Closed "
                // [S]top is around x=25-45
                // [P]refs is around x=45-65
                if (mx >= 25 && mx < 45) {
                    ui_trigger_panic(ui);
                } else if (mx >= 45 && mx < 65) {
                    ui->settings_open = !ui->settings_open;
                }
                return;
            }

            // Column Focus Clicks
            struct ncplane* columns[] = {ui->col_icons, ui->col_tasks, ui->col_subtasks, ui->col_events, ui->file_browser, ui->col_audit, ui->waterfall};
            for (int i = 0; i < FOCUS_COUNT; i++) {
                if (is_mouse_in_plane(columns[i], my, mx)) {
                    ui->focus = (ui_focus_t)i;
                    if (i == FOCUS_FILES) {
                        int py, px;
                        ncplane_abs_yx(ui->file_browser, &py, &px);
                        int relative_y = my - py - 1;
                        if (relative_y >= 0 && relative_y < ui->file_count) {
                            if (ui->file_selected_idx == relative_y) {
                                struct dirent* ent = ui->file_list[ui->file_selected_idx];
                                if (ent->d_type == DT_DIR) {
                                    if (strcmp(ent->d_name, ".") != 0) {
                                        if (strcmp(ent->d_name, "..") == 0) chdir("..");
                                        else chdir(ent->d_name);
                                        getcwd(ui->current_dir, sizeof(ui->current_dir));
                                        refresh_file_list(ui);
                                        ui->file_selected_idx = 0;
                                    }
                                }
                            } else {
                                ui->file_selected_idx = relative_y;
                            }
                        }
                    }
                    update_plane_borders(ui);
                    return;
                }
            }
        }
        return; // Handled mouse (even if we did nothing)
    }

    // Handle Keyboard
    if (ni->evtype != NCTYPE_PRESS) {
        return; // Only keyboard press events
    }

    // 0. Peek Modal (Highest priority)
    if (ui->waterfall_peeking) {
        if (key == NCKEY_ESC || key == NCKEY_ENTER || key == '\n' || key == '\r') {
            ui->waterfall_peeking = false;
        }
        return;
    }

    // 0. Input Modal
    if (ui->waiting_for_input) {
        if (key == NCKEY_ENTER || key == '\n' || key == '\r') {
            ui->waiting_for_input = false;
            struct json_object* jobj = json_object_new_object();
            json_object_object_add(jobj, "text", json_object_new_string(ui->input_buffer));
            const char* json_str = json_object_to_json_string(jobj);
            client_network_send(GALLIUM_MSG_USER_INPUT, json_str);
            json_object_put(jobj);
        } else if (key == NCKEY_BACKSPACE || key == 127 || key == '\b') {
            if (ui->input_cursor > 0) {
                ui->input_cursor--;
                ui->input_buffer[ui->input_cursor] = '\0';
            }
        } else if (key >= 0x20 && key <= 0x7E) {
            if (ui->input_cursor < (int)sizeof(ui->input_buffer) - 1) {
                ui->input_buffer[ui->input_cursor++] = (char)key;
                ui->input_buffer[ui->input_cursor] = '\0';
            }
        }
        return;
    }

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
            case '\n':
            case '\r':
            case NCKEY_ENTER:
                if (ui->settings_idx == 1) ui->push_on_subtask = !ui->push_on_subtask;
                else if (ui->settings_idx == 2) ui->push_on_final = !ui->push_on_final;
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
        ui_trigger_panic(ui);
        return;
    }
    if (key == 'f' || key == 'F') {
        ui_flash_success(ui);
        return;
    }
    if (key == 'p' || key == 'P') {
        ui->settings_open = true;
        return;
    }

    // 3. Navigation
    if (key == NCKEY_TAB) {
        do {
            ui->focus = (ui->focus + 1) % FOCUS_COUNT;
        } while ((ui->focus == FOCUS_WATERFALL && !ui->waterfall_visible) || 
                 (ui->focus == FOCUS_FILES && !ui->file_browser));
        update_plane_borders(ui);
        return;
    }

    if (key == NCKEY_RIGHT) {
        do {
            ui->focus = (ui->focus + 1) % FOCUS_COUNT;
        } while ((ui->focus == FOCUS_WATERFALL && !ui->waterfall_visible) || 
                 (ui->focus == FOCUS_FILES && !ui->file_browser));
        update_plane_borders(ui);
        return;
    }
    if (key == NCKEY_LEFT) {
        do {
            ui->focus = (ui->focus - 1 + FOCUS_COUNT) % FOCUS_COUNT;
        } while ((ui->focus == FOCUS_WATERFALL && !ui->waterfall_visible) || 
                 (ui->focus == FOCUS_FILES && !ui->file_browser));
        update_plane_borders(ui);
        return;
    }

    // 4. Content Interaction
    if (ui->focus == FOCUS_FILES) {
        if (key == NCKEY_DOWN) {
            if (ui->file_selected_idx < ui->file_count - 1) ui->file_selected_idx++;
        }
        if (key == NCKEY_UP) {
            if (ui->file_selected_idx > 0) ui->file_selected_idx--;
        }
        if (key == NCKEY_ENTER) {
            if (ui->file_selected_idx < ui->file_count) {
                struct dirent* ent = ui->file_list[ui->file_selected_idx];
                if (ent->d_type == DT_DIR) {
                    if (strcmp(ent->d_name, ".") == 0) return;
                    if (strcmp(ent->d_name, "..") == 0) chdir("..");
                    else chdir(ent->d_name);
                    getcwd(ui->current_dir, sizeof(ui->current_dir));
                    refresh_file_list(ui);
                    ui->file_selected_idx = 0;
                }
            }
        } else if (key == NCKEY_BACKSPACE) {
            if (chdir("..") == 0) {
                getcwd(ui->current_dir, sizeof(ui->current_dir));
                refresh_file_list(ui);
                ui->file_selected_idx = 0;
            }
        }
    } else if (ui->focus == FOCUS_WATERFALL) {
        if (key == 'n' || key == 'N') ui->waterfall_filter_noise = !ui->waterfall_filter_noise;
        if (key == NCKEY_UP && ui->waterfall_selected_idx > 0) ui->waterfall_selected_idx--;
        if (key == NCKEY_DOWN && ui->waterfall_selected_idx < ui->waterfall_visible_count - 1) ui->waterfall_selected_idx++;
        if (key == NCKEY_ENTER) ui->waterfall_peeking = true;
    }
}

void ui_process_network_messages(gallium_ui_t* ui) {
    if (!ui) return;
    gallium_msg msg;
    while (gallium_queue_try_pop(&ui->network_queue, &msg)) {
        struct json_object* payload_obj = NULL;
        if (msg.header.payload_len > 0) {
            payload_obj = gallium_json_parse(msg.payload, msg.header.payload_len);
        }

        switch (msg.header.msg_id) {
            case GALLIUM_MSG_EVENT_LIST:
                ui_update_event_log(ui, payload_obj);
                break;
            case GALLIUM_MSG_USER_INPUT: {
                if (payload_obj) {
                    struct json_object* prompt_obj = NULL;
                    struct json_object* input_obj = NULL;
                    if (json_object_object_get_ex(payload_obj, "prompt", &prompt_obj)) {
                        const char* prompt = json_object_get_string(prompt_obj);
                        bool is_input = false;
                        if (json_object_object_get_ex(payload_obj, "input", &input_obj)) {
                            is_input = json_object_get_boolean(input_obj);
                        }
                        if (is_input) ui_show_input_prompt(ui, prompt);
                        else ui_show_approval(ui, prompt);
                    }
                }
                break;
            }
            case GALLIUM_MSG_NOTIFICATION: {
                if (payload_obj) {
                    struct json_object *title_obj, *body_obj, *success_obj;
                    const char *title = "Notification", *body = "";
                    bool success = true;
                    if (json_object_object_get_ex(payload_obj, "title", &title_obj)) title = json_object_get_string(title_obj);
                    if (json_object_object_get_ex(payload_obj, "body", &body_obj)) body = json_object_get_string(body_obj);
                    if (json_object_object_get_ex(payload_obj, "success", &success_obj)) success = json_object_get_boolean(success_obj);
                    ui_show_notification(ui, title, body, success);
                    if (success && strcmp(title, "Project Complete") == 0) ui_flash_success(ui);
                }
                break;
            }
            case GALLIUM_MSG_PANIC: {
                if (payload_obj) {
                    struct json_object* active_obj;
                    if (json_object_object_get_ex(payload_obj, "active", &active_obj)) {
                        bool active = json_object_get_boolean(active_obj);
                        pthread_mutex_lock(&ui->state_mutex);
                        ui->panic_active = active;
                        pthread_mutex_unlock(&ui->state_mutex);
                        if (active) ui_show_notification(ui, "PANIC", "Server entered panic state.", false);
                    }
                }
                break;
            }
            case GALLIUM_MSG_ERROR: {
                if (payload_obj) {
                    struct json_object* msg_obj;
                    if (json_object_object_get_ex(payload_obj, "message", &msg_obj)) {
                        ui_show_notification(ui, "Error", json_object_get_string(msg_obj), false);
                    }
                }
                break;
            }
            default: break;
        }
        if (payload_obj) json_object_put(payload_obj);
        gallium_msg_free(&msg);
    }
}