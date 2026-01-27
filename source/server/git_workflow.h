#ifndef GIT_WORKFLOW_H
#define GIT_WORKFLOW_H

#include <stdbool.h>

/**
 * @brief Initialize the git workflow module.
 * @param workspace_root The root directory of the workspace where git commands will run.
 */
void git_workflow_init(const char* workspace_root);

/**
 * @brief Creates a new branch for a top-level task.
 * Command: git checkout -b task-<task_id>
 * 
 * @param task_id The ID of the task.
 * @return 0 on success, -1 on failure.
 */
int git_workflow_start_task(const char* task_id);

/**
 * @brief Commits changes after a sub-task completion.
 * Commands:
 *  1. git add .
 *  2. git commit -m "Gallium: <subtask_name> completed"
 * 
 * @param subtask_name Name of the completed sub-task.
 * @return 0 on success, -1 on failure.
 */
int git_workflow_checkpoint(const char* subtask_name);

/**
 * @brief Merges the task branch back into the main branch.
 * This assumes we want to merge into 'main' or 'master'.
 * 
 * @param task_id The ID of the task (to verify we are on the right branch, or to reference it).
 * @param main_branch The name of the main branch (e.g., "main").
 * @return 0 on success, -1 on failure.
 */
int git_workflow_finalize_task(const char* task_id, const char* main_branch);

/**
 * @brief Creates a new branch for an alternative implementation attempt.
 * Command: git checkout -b task-<task_id>-alt-<attempt>
 * 
 * @param task_id The ID of the task.
 * @param attempt The attempt number (1, 2, ...).
 * @return 0 on success, -1 on failure.
 */
int git_workflow_start_alt_task(const char* task_id, int attempt);

// Configuration setters
void git_workflow_set_push_checkpoint(bool enabled);
void git_workflow_set_push_finalize(bool enabled);

#endif // GIT_WORKFLOW_H
