# Task: Tool Sandbox & Task Runner

## 1. Goal
Securely execute shell commands and file operations within the workspace workspace.

## 2. Requirements

### 2.1 File System Sandbox
- [x] **Action**: Implement path validation in `source/server/sandbox.c`.
- [x] **Logic**: Ensure all file paths passed to read/write tools are prefixed with the workspace root and do not contain `..` escapes.

### 2.2 `tasks.json` Parser
- [x] **Action**: Parse the project's `tasks.json`.
- [x] **Execution**: Implement a function that takes a task name and executes the associated command using `popen()` or `posix_spawn()`.

### 2.3 User Approval Gate
- [x] **Action**: Implement a "Pending Approval" state for high-risk commands (e.g., `rm -rf`, network access).
- [x] **Communication**: Send a `MSG_USER_INPUT` to the client and wait for a signed approval message before proceeding.

## 3. Verification Steps
1. [x] **Sandbox Escape Test**: Attempt to have an agent read `/etc/passwd`. The server should block it.
2. [x] **Task Execution**: Trigger a "build" task via the client and verify the server executes `cmake --build` in the correct directory.

## 4. Implementation Summary
Hello Future Self,

We have successfully implemented the security sandbox and task runner system. The `sandbox.c` module now aggressively validates paths to prevent directory traversal and outside-workspace access. We've integrated this with the task runner that parses `tasks.json`. 

Crucially, we implemented a "human-in-the-loop" approval system. If a task is deemed "dangerous" (currently simple heuristic checks for `rm`, `curl`, etc.), the server pauses execution and sends a `GALLIUM_MSG_USER_INPUT` request to the client. The TUI has been updated with a terrifyingly red modal dialog that demands `Y`/`N` confirmation from the user before the server proceeds.

Verification was largely automated with a temporary `test_sandbox.c` harness that validated all edge cases, including path traversals and execution flows.
