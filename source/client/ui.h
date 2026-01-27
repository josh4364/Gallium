#ifndef GALLIUM_UI_H
#define GALLIUM_UI_H

#include <notcurses/notcurses.h>
#include <stdbool.h>

typedef enum {
    FOCUS_ICONS = 0,
    FOCUS_TASKS,
    FOCUS_SUBTASKS,
    FOCUS_EVENTS,
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
    struct ncplane* waterfall;
    
    // State
    ui_focus_t focus;
    bool waterfall_visible;
    bool settings_open;
    bool panic_pressed;
    
    // Approval
    bool pending_approval;
    char approval_prompt[256];
} gallium_ui_t;

gallium_ui_t* ui_init(struct notcurses* nc);
void ui_deinit(gallium_ui_t* ui);
void ui_render(gallium_ui_t* ui);
void ui_handle_input(gallium_ui_t* ui, uint32_t key);
void ui_resize(gallium_ui_t* ui);
void ui_show_approval(gallium_ui_t* ui, const char* prompt);

#endif // GALLIUM_UI_H
