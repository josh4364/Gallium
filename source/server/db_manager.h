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

#endif // DB_MANAGER_H
