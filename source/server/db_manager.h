#ifndef DB_MANAGER_H
#define DB_MANAGER_H

#include <sqlite3.h>
#include <json-c/json.h>

/**
 * @brief Initialize the database connection and create schema if it doesn't exist.
 * @return 0 on success, non-zero on failure.
 */
int db_init(const char *db_path);

/**
 * @brief Execute a SQL statement.
 * @param sql The SQL statement to execute.
 * @return 0 on success, non-zero on failure.
 */
int db_execute(const char *sql);

/**
 * @brief Close the database connection.
 */
void db_close(void);

/**
 * @brief Log an event to both stdout and the events table.
 * @param source The source of the event.
 * @param payload_json The JSON payload of the event.
 */
void gallium_log(const char *source, const char *payload_json);

/**
 * @brief Log an LLM interaction to the llm_logs table.
 * @param agent_id The ID of the agent making the request.
 * @param prompt The system+user prompt sent.
 * @param response The response received.
 * @param tokens The number of tokens used.
 */
void gallium_log_llm(const char *agent_id, const char *prompt, const char *response, int tokens);

/**
 * @brief Get the last N events from the database.
 * @param limit The maximum number of events to retrieve.
 * @return A JSON array string (must be freed by caller), or NULL on error.
 */
char* db_get_events(int limit);

char* db_get_tasks(void);

// --- Task State Management ---

typedef enum {
    TASK_STATUS_PENDING,
    TASK_STATUS_IN_PROGRESS,
    TASK_STATUS_COMPLETED,
    TASK_STATUS_FAILED,
    TASK_STATUS_PAUSED
} TaskStatus;

/**
 * @brief Convert TaskStatus enum to string.
 */
const char* db_task_status_to_string(TaskStatus status);

/**
 * @brief Create a new task.
 * @param name Task name.
 * @param git_branch Associated git branch.
 * @return Task ID on success, -1 on failure.
 */
int db_create_task(const char *name, const char *git_branch);

/**
 * @brief Update the status of a task.
 * @param task_id The ID of the task.
 * @param status The new status.
 * @return 0 on success, non-zero on failure.
 */
int db_update_task_status(int task_id, TaskStatus status);

/**
 * @brief Recover tasks that were interrupted (e.g., stuck in IN_PROGRESS).
 * Should be called at server startup.
 * @return Number of recovered tasks.
 */
int db_recover_tasks();

/**
 * @brief Get the total number of tokens used across all LLM interactions.
 * @return Total token count.
 */
long long db_get_total_tokens();

#endif // DB_MANAGER_H
