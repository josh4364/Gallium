# Task: TUI Layout Engine

## 1. Goal
Build the core layout and visual structure of the Gallium TUI using `notcurses`.

## 2. Requirements

### 2.1 4-Column Main View
- **Action**: Implement the layout in `source/client/ui.c`.
- **Columns**:
    - **C1 (Icons)**: Fixed width, representing projects.
    - **C2 (Tasks)**: List of top-level goals.
    - **C3 (Sub-Tasks)**: Nested tasks for the selection.
    - **C4 (Events)**: Real-time log stream for the selection.

### 2.2 Top Menu Bar
- **Action**: Render a plane at the top.
- **Elements**: Project name, "STOP" (Panic) button status, and "Settings" toggle.

### 2.3 Focused Section Highlighting
- **Action**: Implement a "Focus Manager".
- **Logic**: Use arrow keys or Tab to cycle focus. The active plane should have a distinct border color or thickness.

### 2.4 Waterfall View Toggle
- **Action**: Implement a "Waterfall" plane that overlays the right side of the screen.
- **Requirement**: Toggle visibility with a hotkey (e.g., `W`).

## 3. Verification Steps
1. **Visual Inspection**: Run `gallium-tui` and verify all 4 columns are aligned correctly in the terminal.
2. **Resize Test**: Resize the terminal and ensure the `notcurses` planes adapt without crashing.
