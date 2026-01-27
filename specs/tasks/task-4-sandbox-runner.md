# Task: Tool Sandbox & Task Runner

## 1. Goal
Securely execute shell commands and file operations within the workspace workspace.

## 2. Requirements

### 2.1 File System Sandbox
- **Action**: Implement path validation in `source/server/sandbox.c`.
- **Logic**: Ensure all file paths passed to read/write tools are prefixed with the workspace root and do not contain `..` escapes.

### 2.2 `tasks.json` Parser
- **Action**: Parse the project's `tasks.json`.
- **Execution**: Implement a function that takes a task name and executes the associated command using `popen()` or `posix_spawn()`.

### 2.3 User Approval Gate
- **Action**: Implement a "Pending Approval" state for high-risk commands (e.g., `rm -rf`, network access).
- **Communication**: Send a `MSG_USER_INPUT` to the client and wait for a signed approval message before proceeding.

## 3. Verification Steps
1. **Sandbox Escape Test**: Attempt to have an agent read `/etc/passwd`. The server should block it.
2. **Task Execution**: Trigger a "build" task via the client and verify the server executes `cmake --build` in the correct directory.
