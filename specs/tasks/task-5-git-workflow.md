# Task: Git-Backed Workflow
*Status: Completed*

## 1. Goal
Integrate Git into the task lifecycle to provide versioned history for every AI action.

## 2. Requirements

### 2.1 Automated Branching
- **Action**: When a new top-level task starts, the server should run `git checkout -b task-<task-id>`.

### 2.2 Sub-Task Commits
- **Action**: After every sub-task completion (or "checkpoint"), the server should automatically:
    1. `git add .`
    2. `git commit -m "Gallium: <sub-task-name> completed"`

### 2.3 Alternative Implementations
- **Action**: Implement logic to spawn branches like `task-alt-N`.
- **Purpose**: Allow the agent to branch off and try a different approach if a bottleneck is detected.

### 2.4 Final Merge/Flatten
- **Action**: Implement a "Goal Complete" finalize step that merges the task branch into the main project branch.

### 2.5 Push Configuration
- **Action**: Implement configurable `git push` behaviors.
- **Logic**:
    - **Sub-Task Push**: If enabled, run `git push origin task-<id>` after every sub-task checkpoint.
    - **Final Push**: If enabled, run `git push origin <main-branch>` after flattening.
    - Default both to OFF for safety.

## 3. Verification Steps
1. **Git Log Check**: After running a test task, run `git log` to verify automatic commits were created with proper messages.
2. **Branch Cleanup**: Verify that task branches are correctly created and not left in a "detached HEAD" state.

## 4. Implementation Summary (Future Self)
*Date: 2026-01-27*

The Git-Backed Workflow is fully implemented in `source/server/git_workflow.c`.

**Key Features:**
*   **Module**: `git_workflow` handles all git operations directly via `system()` calls using `git -C`.
*   **Branching Strategy**:
    *   Top-level tasks create `task-<id>`.
    *   Alternative attempts create `task-<id>-alt-<attempt>`.
*   **Checkpoints**: Sub-task completion triggers `git add .` and `git commit`.
*   **Push Control**: Granular control via `git_workflow_set_push_checkpoint(bool)` and `git_workflow_set_push_finalize(bool)`. Defaults to `false` (no push).
*   **Testing**: A built-in test harness is available in `main.c` via the `--test-git` flag. This creates a temporary repo in `build/test_git_workspace` to verify the full flow (Branch -> Commit -> Merge).

**Usage:**
```c
// Init
git_workflow_init("/path/to/workspace");

// Start Task
git_workflow_start_task("101");

// Checkpoint (after sub-task)
git_workflow_checkpoint("subtask-name");

// Try Alt
git_workflow_start_alt_task("101", 1);

// Finish
git_workflow_finalize_task("101", "main");
```
