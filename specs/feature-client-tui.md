# Feature Specification: Client TUI Layout and Interaction

## 1. Overview
The Gallium client is a high-performance Terminal User Interface (TUI) built with `notcurses`. It provides a real-time, multi-column view of the AI's progress and allows for granular navigation of tasks, logs, and server settings.

## 2. Declarative Requirements

### 2.1 Workspace and Project Navigation
- **Client should be able to** view top-level projects in a menu bar displayed at the top of the terminal at all times.
- **Client should be able to** identify which project is currently open via a persistent indicator in the top menu bar.
- **Client should be able to** navigate the local workspace file tree using a TUI file browser with arrow key support.
- **Client should be able to** highlight the currently focused TUI section with a colored outline.

### 2.2 Task and Event Monitoring
- **Client should be able to** display a multi-column layout in the main view:
    - **Column 1**: Top-level projects (represented as small icons).
    - **Column 2**: Top-level tasks for the active project.
    - **Column 3**: Sub-task list for the currently selected task.
    - **Column 4**: Event stream for the currently selected sub-task.
- **Client should be able to** click on any UI element (project, task, sub-task, event) to select it or trigger an action.
- **Client should be able to** visualize task urgency by lighting up a task entry in red when the task manager requires user input or validation.
- **Client should be able to** toggle a "Waterfall" view on the right-hand side via a menu bar action.
- **Client should be able to** display event logs in the Waterfall view without showing raw LLM messages (to reduce noise), while allowing the user to "peek" at details on demand.
- **Client should be able to** display a "Big Panic" pause button at the top to stop all active server operations immediately.

### 2.3 Status and Feedback
- **Client should be able to** display the current top-level goal as a short single-line string at the top of the status view.
- **Client should be able to** display the context window usage percentage for the Task Manager.
- **Client should be able to** display live-updating context window usage percentages for each active sub-task list box.
- **Client should be able to** flash the screen green three times to signify the successful completion of a top-level project goal.

### 2.4 Server Settings and Configuration
- **Client should be able to** access a settings view to modify the server's `settings.json`.
- **Client should be able to** manage API keys through the settings UI.
- **Client should be able to** toggle the `git push` behaviors:
    - Default OFF: Push sub-tasks/tasks when done.
    - Default OFF: Push the final merged PR of all tasks.

## 3. Visual Layout Reference
```text
[ Projects | Current: Project-X | (STOP/PANIC) | Settings ]
-----------------------------------------------------------
Goal: Implement Vulkan SSR pass with edge fading.
-----------------------------------------------------------
[Icons] | [Tasks]         | [Sub-Tasks]    | [Event Stream]
  (P1)  | > Task 1        | - Sub 1 (10%)  | 12:00:01 Init
  (P2)  |   Task 2 (RED)  | - Sub 2 (45%)  | 12:00:05 Edit
        |                 |                | 12:00:10 Lint
-----------------------------------------------------------
[ File Browser: src/vulkan/render_pass_ssr.c             ]
```
