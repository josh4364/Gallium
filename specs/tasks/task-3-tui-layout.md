# Task: TUI Layout Engine

## 1. Goal
Build the core layout and visual structure of the Gallium TUI using `notcurses`.

## 2. Requirements

### 2.1 4-Column Main View
- [x] **Action**: Implement the layout in `source/client/ui.c`.
- [x] **Columns**:
    - **C1 (Icons)**: Fixed width, representing projects.
    - **C2 (Tasks)**: List of top-level goals.
    - **C3 (Sub-Tasks)**: Nested tasks for the selection.
    - **C4 (Events)**: Real-time log stream for the selection.

### 2.2 Top Menu Bar
- [x] **Action**: Render a plane at the top.
- [x] **Elements**: Project name, "STOP" (Panic) button status, and "Settings" toggle.

### 2.3 Focused Section Highlighting
- [x] **Action**: Implement a "Focus Manager".
- [x] **Logic**: Use arrow keys or Tab to cycle focus. The active plane should have a distinct border color or thickness.

### 2.4 Waterfall View Toggle
- [x] **Action**: Implement a "Waterfall" plane that overlay the right side of the screen.
- [x] **Requirement**: Toggle visibility with a hotkey (e.g., `W`).

### 2.5 File Browser Plane
- [x] **Action**: Implement a horizontal plane at the bottom of the layout (spanning the width).
- [x] **Functionality**:
    - Display the current workspace directory structure.
    - Navigation: Arrow keys to move, Enter to expand/select, Backspace to go up.
    - Context: Show the currently "active" file relevant to the selected task/sub-task.

### 2.6 Settings & Configuration Modal
- [x] **Action**: Implement a modal or overlay view for System Settings.
- [x] **Features**:
    - **API Key Management**: Input/Update keys for LLM providers.
    - **Git Push Toggles**:
        - Push on Sub-task completion (On/Off).
        - Push on Final Task completion (On/Off).

## 3. Verification Steps
1. [x] **Visual Inspection**: Run `gallium-tui` and verify all columns and the bottom File Browser are aligned correctly.
2. [x] **Resize Test**: Resize the terminal and ensure the `notcurses` planes adapt.
3. [x] **Navigation Test**: Verify arrow keys navigate the File Browser and settings can be toggled.

## 4. Summary of Changes (Future Self Reflection)
- **Modular UI Architecture**: Created `ui.h` and `ui.c` to separate rendering logic from the main event loop. The `gallium_ui_t` struct tracks all active planes and state.
- **Dynamic Resizing**: Implemented `ui_resize` which is called on `NCKEY_RESIZE`. It handles the destruction and recreation of planes to match new terminal dimensions, ensuring the layout remains relative (percentages for columns).
- **Focus Management**: The `ui_focus_t` enum and `update_plane_borders` function provide a robust way to guide user attention. Active panes use `ncplane_perimeter_rounded` with a green highlight.
- **State Feedback**: The top bar now uses `ncplane_printf` to show live status for "Panic" (`S`) and "Settings" (`P`) toggles, which were added as lightweight state variables in the UI context.
- **Performance**: Used `nanosleep` in the main loop to maintain ~100FPS responsiveness without 100% CPU usage.
- **File Browser Integration**: Implemented a responsive file browser rendering local workspace contents. State is managed via `scandir` and refreshed on navigation (Enter/Backspace).
- **Settings Modal**: Created a transient overlay system for Settings, allowing configuration of API keys and push behaviors without leaving the main view.
- **Improved Focus Logic**: Updated `ui_handle_input` to manage focus transitions between the main columns and the bottom file browser, using a cohesive directional flow.
- **Refined Render Loop**: Refactored `ui_render` to use a clean "Create-Render-Destroy" pattern for transient modals (Settings, Approval), ensuring correct z-ordering and resource management.
