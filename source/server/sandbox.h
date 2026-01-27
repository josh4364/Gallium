#ifndef GALLIUM_SANDBOX_H
#define GALLIUM_SANDBOX_H

#include <stdbool.h>

/**
 * @brief Initialize the sandbox with a workspace root.
 * 
 * @param workspace_root The absolute path to the workspace root.
 */
void sandbox_init(const char* workspace_root);

/**
 * @brief Validate if a path is within the sandbox.
 * 
 * @param path The path to validate.
 * @param resolved_path Buffer to store the resolved absolute path (must be PATH_MAX).
 * @return int 0 on success, -1 if outside sandbox or invalid.
 */
int sandbox_validate_path(const char* path, char* resolved_path);

/**
 * @brief Execute a task by name from tasks.json.
 * 
 * @param task_name The name of the task to execute.
 * @return int 0 on success, -1 on failure.
 */
int sandbox_execute_task(const char* task_name);

/**
 * @brief Execute a raw shell command with security checks and optional approval.
 * 
 * @param command The command to execute.
 * @param requires_approval Whether the command should wait for user approval.
 * @return int 0 on success, -1 on failure.
 */
int sandbox_execute_command(const char* command, bool requires_approval);

/**
 * @brief Kill all tracked child processes.
 */
void sandbox_kill_all();

#endif // GALLIUM_SANDBOX_H
