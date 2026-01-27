#ifndef GALLIUM_UI_H
#define GALLIUM_UI_H

#include <notcurses/notcurses.h>
#include <stdbool.h>
#include <dirent.h>

struct json_object;

#include <pthread.h>
#include "../common/queue.h"

struct json_object;

typedef enum {
    FOCUS_ICONS = 0,
    FOCUS_TASKS,
    FOCUS_SUBTASKS,
    FOCUS_EVENTS,
    FOCUS_FILES,
    FOCUS_AUDIT,
    FOCUS_WATERFALL, // Added
    FOCUS_COUNT
} ui_focus_t;

typedef struct {
    struct notcurses* nc;
    struct ncplane* stdplane;
    
    // UI Elements
    struct ncplane* top_bar;
    struct ncplane* col_icons;
    struct ncplane* col_tasks;
    struct ncplane* col_subtasks;
    struct ncplane* col_events;
    struct ncplane* col_audit;
    struct ncplane* waterfall;
    struct ncplane* file_browser;
    
    // State
    ui_focus_t focus;
    bool waterfall_visible;
    bool waterfall_filter_noise; // Added
    int waterfall_selected_idx;  // Added
    int waterfall_visible_count; // Added
    bool waterfall_peeking;      // Added
    bool settings_open;
    int settings_idx; // Current selection in settings
    bool panic_active;
    
    // File Browser State
    char current_dir[1024];
    int file_selected_idx;
    struct dirent** file_list;
    int file_count;
    
    // Settings State
    char api_key[64];
    bool push_on_subtask;
    bool push_on_final;

    // Approval
    bool pending_approval;
    char approval_prompt[256];

    // Text Input
    bool waiting_for_input;
    char input_prompt[256];
    char input_buffer[1024];
    int input_cursor;

    // Notifications
    bool show_notification;
    char notify_title[64];
    char notify_body[256];
    bool notify_is_success;
    time_t notify_expiry;

    // Success Flash
    int success_flash_count;
    time_t last_flash_time;
    bool flash_on;

    // Audit Log
    struct json_object* event_logs_array;
    bool needs_render;

    // Thread-safe update queue
    gallium_queue network_queue;
    pthread_mutex_t state_mutex;
} gallium_ui_t;

gallium_ui_t* ui_init(struct notcurses* nc);
void ui_deinit(gallium_ui_t* ui);
void ui_render(gallium_ui_t* ui);
void ui_handle_input(gallium_ui_t* ui, const struct ncinput* ni);
void ui_resize(gallium_ui_t* ui);
void ui_show_approval(gallium_ui_t* ui, const char* prompt);
void ui_show_input_prompt(gallium_ui_t* ui, const char* prompt);
void ui_show_notification(gallium_ui_t* ui, const char* title, const char* body, bool is_success);
void ui_flash_success(gallium_ui_t* ui);
void ui_trigger_panic(gallium_ui_t* ui);
void ui_update_event_log(gallium_ui_t* ui, struct json_object* events_array);
void ui_process_network_messages(gallium_ui_t* ui);

#endif // GALLIUM_UI_H