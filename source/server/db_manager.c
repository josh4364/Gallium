#include "db_manager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static sqlite3 *g_db = NULL;

int db_init(const char *db_path) {
    int rc = sqlite3_open(db_path, &g_db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Cannot open database: %s\n", sqlite3_errmsg(g_db));
        return rc;
    }

    const char *schema = 
        "CREATE TABLE IF NOT EXISTS events ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,"
        "  source TEXT,"
        "  payload TEXT"
        ");"
        "CREATE TABLE IF NOT EXISTS llm_logs ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  agent_id TEXT,"
        "  prompt TEXT,"
        "  response TEXT,"
        "  tokens INTEGER"
        ");"
        "CREATE TABLE IF NOT EXISTS tasks ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  name TEXT,"
        "  status TEXT,"
        "  git_branch TEXT"
        ");"
        "CREATE TABLE IF NOT EXISTS sub_tasks ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  parent_task_id INTEGER,"
        "  name TEXT,"
        "  status TEXT,"
        "  FOREIGN KEY(parent_task_id) REFERENCES tasks(id)"
        ");";

    rc = db_execute(schema);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to create schema: %s\n", sqlite3_errmsg(g_db));
        return rc;
    }

    return SQLITE_OK;
}

int db_execute(const char *sql) {
    if (!g_db) return SQLITE_ERROR;

    char *err_msg = NULL;
    int rc = sqlite3_exec(g_db, sql, 0, 0, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "SQL error: %s\n", err_msg);
        sqlite3_free(err_msg);
        return rc;
    }

    return SQLITE_OK;
}

void db_close(void) {
    if (g_db) {
        sqlite3_close(g_db);
        g_db = NULL;
    }
}

void gallium_log(const char *source, const char *payload_json) {
    // Print to stdout
    printf("[%s] %s\n", source, payload_json);

    // Insert into events table
    // We should use prepared statements to avoid SQL injection, 
    // but the spec asks for db_execute wrapper usage.
    // However, db_execute as defined is a simple wrapper for sqlite3_exec.
    // To be safe and handle quotes, I'll use a prepared statement here instead of formatting a string for db_execute.
    // BUT the spec says: db_execute(): Wrapper for running SQL queries with error logging.
    
    sqlite3_stmt *stmt;
    const char *sql = "INSERT INTO events (source, payload) VALUES (?, ?);";
    
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare log statement: %s\n", sqlite3_errmsg(g_db));
        return;
    }

    sqlite3_bind_text(stmt, 1, source, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, payload_json, -1, SQLITE_STATIC);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Failed to execute log statement: %s\n", sqlite3_errmsg(g_db));
    }

    sqlite3_finalize(stmt);
}

void gallium_log_llm(const char *agent_id, const char *prompt, const char *response, int tokens) {
    if (!g_db) return;

    sqlite3_stmt *stmt;
    const char *sql = "INSERT INTO llm_logs (agent_id, prompt, response, tokens) VALUES (?, ?, ?, ?);";
    
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare log llm statement: %s\n", sqlite3_errmsg(g_db));
        return;
    }

    sqlite3_bind_text(stmt, 1, agent_id, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, prompt, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, response, -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 4, tokens);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Failed to execute log llm statement: %s\n", sqlite3_errmsg(g_db));
    }

    sqlite3_finalize(stmt);
}

char* db_get_events(int limit) {
    if (!g_db) return NULL;
    
    char sql[128];
    snprintf(sql, sizeof(sql), "SELECT source, payload, timestamp FROM events ORDER BY id DESC LIMIT %d", limit);
    
    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return NULL;
    }

    struct json_object *jarray = json_object_new_array();
    
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        const char *source = (const char*)sqlite3_column_text(stmt, 0);
        const char *payload = (const char*)sqlite3_column_text(stmt, 1);
        const char *timestamp = (const char*)sqlite3_column_text(stmt, 2);

        struct json_object *jobj = json_object_new_object();
        json_object_object_add(jobj, "source", json_object_new_string(source ? source : ""));
        
        struct json_object *payload_obj = json_tokener_parse(payload);
        if (payload_obj) {
            json_object_object_add(jobj, "payload", payload_obj);
        } else {
             json_object_object_add(jobj, "payload", json_object_new_string(payload ? payload : ""));
        }
        
        json_object_object_add(jobj, "timestamp", json_object_new_string(timestamp ? timestamp : ""));
        
        json_object_array_add(jarray, jobj);
    }
    
    sqlite3_finalize(stmt);
    
    const char* json_str = json_object_to_json_string(jarray);
    char* result = strdup(json_str);
    json_object_put(jarray); // Free
    return result;
}

const char* db_task_status_to_string(TaskStatus status) {
    switch (status) {
        case TASK_STATUS_PENDING: return "PENDING";
        case TASK_STATUS_IN_PROGRESS: return "IN_PROGRESS";
        case TASK_STATUS_COMPLETED: return "COMPLETED";
        case TASK_STATUS_FAILED: return "FAILED";
        case TASK_STATUS_PAUSED: return "PAUSED";
        default: return "UNKNOWN";
    }
}

int db_create_task(const char *name, const char *git_branch) {
    if (!g_db) return -1;

    sqlite3_stmt *stmt;
    const char *sql = "INSERT INTO tasks (name, status, git_branch) VALUES (?, ?, ?);";
    
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare create task statement: %s\n", sqlite3_errmsg(g_db));
        return -1;
    }

    sqlite3_bind_text(stmt, 1, name, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, db_task_status_to_string(TASK_STATUS_PENDING), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, git_branch, -1, SQLITE_STATIC);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Failed to execute create task statement: %s\n", sqlite3_errmsg(g_db));
        sqlite3_finalize(stmt);
        return -1;
    }

    int task_id = (int)sqlite3_last_insert_rowid(g_db);
    sqlite3_finalize(stmt);
    return task_id;
}

int db_update_task_status(int task_id, TaskStatus status) {
    if (!g_db) return -1;

    sqlite3_stmt *stmt;
    const char *sql = "UPDATE tasks SET status = ? WHERE id = ?;";
    
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare update task statement: %s\n", sqlite3_errmsg(g_db));
        return -1;
    }

    sqlite3_bind_text(stmt, 1, db_task_status_to_string(status), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 2, task_id);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Failed to execute update task statement: %s\n", sqlite3_errmsg(g_db));
        sqlite3_finalize(stmt);
        return -1;
    }

    sqlite3_finalize(stmt);
    return 0;
}

int db_recover_tasks() {
    if (!g_db) return 0;

    // Find all tasks that are IN_PROGRESS and mark them as PAUSED
    // This assumes that if the server is starting up, any "IN_PROGRESS" task was interrupted.
    
    const char *sql_select = "SELECT id FROM tasks WHERE status = 'IN_PROGRESS';";
    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql_select, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return 0;
    }

    int recovered_count = 0;
    // We can't update while iterating effectively with a simple loop if we want to be safe,
    // but typically it's fine. To be safer, let's collect IDs or just run a single UPDATE query.
    // Actually, a single UPDATE query is much better.
    
    sqlite3_finalize(stmt); // Close the select statement

    const char *sql_update = "UPDATE tasks SET status = 'PAUSED' WHERE status = 'IN_PROGRESS';";
    char *err_msg = NULL;
    rc = sqlite3_exec(g_db, sql_update, 0, 0, &err_msg);
    
    if (rc != SQLITE_OK) {
         fprintf(stderr, "Failed to recover tasks: %s\n", err_msg);
         sqlite3_free(err_msg);
         return 0;
    }
    
    // We can use sqlite3_changes() to see how many were updated
    recovered_count = sqlite3_changes(g_db);
    
    if (recovered_count > 0) {
        char log_msg[64];
        snprintf(log_msg, sizeof(log_msg), "{\"event\": \"recovery\", \"count\": %d}", recovered_count);
        gallium_log("DB", log_msg);
    }

    return recovered_count;
}
