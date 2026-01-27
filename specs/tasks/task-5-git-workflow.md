# Task: Git-Backed Workflow

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
