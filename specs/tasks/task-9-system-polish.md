# Task: System Polish & Feedback

## 1. Goal
Implement the final polish features for the Gallium system, focusing on user feedback, system notifications, and robustness/safety mechanisms.

## 2. Requirements

### 2.1 System Notifications
- **Action**: Implement a notification system using `libnotify` (or OS equivalent).
- **Triggers**:
    - Task Completion (Success/Failure).
    - User Input Required (e.g., Dangerous tool approval).
    - "Panic" state activation.

### 2.2 Visual Feedback (TUI)
- **Action**: Implement visual cues for major state changes.
- **Success Flash**: Flash the screen green three times upon top-level project goal completion.
- **Urgency Cues**: Render tasks in Red if they are blocked or require user input.
- **Panic State**: Visual indicator when the "STOP" button is active.

### 2.3 Audit Log & Playback
- **Action**: Implement a "History/Audit" view in the TUI (or a separate CLI mode).
- **Functionality**:
    - View historical events from the `events` table.
    - "Playback" mode to step through the state changes of a past task.

### 2.4 Safety & Panic Mechanisms
- **Action**: Implement the "Big Button" Panic logic.
- **Logic**:
    - Immediately suspend all active agents.
    - Kill all child processes (compilers, servers).
    - **Checkpointing**: In the event of a crash or panic, ensure the state is saved to `gallium.db` so it can be resumed or analyzed.

## 3. Verification Steps
1. **Notify Test**: Trigger a notification via the server and verify it appears on the OS desktop.
2. **Visual Check**: Force a "Success" state and verify the TUI flashes green.
3. **Panic Test**: Run a long-running dummy process, hit the Panic button, and verify the process is killed and the state is saved.
