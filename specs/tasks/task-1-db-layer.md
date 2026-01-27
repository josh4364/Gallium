# Task: Database Layer

## 1. Goal
Implement the persistence layer using SQLite3 to store project state, agent logs, and event history.

## 2. Requirements

### 2.1 Database Manager
- **Action**: Implement `source/server/db_manager.c`.
- **Functionality**:
    - `db_init()`: Create or open the database file (e.g., `db/project.db`).
    - `db_execute()`: Wrapper for running SQL queries with error logging.
    - `db_close()`: Safe shutdown.

### 2.2 Schema Implementation
- **Action**: Define and execute `CREATE TABLE` statements for:
    - `events`: `id` (int), `timestamp` (text), `source` (text), `payload` (json).
    - `llm_logs`: `id`, `agent_id`, `prompt`, `response`, `tokens`.
    - `tasks`: `id`, `name`, `status`, `git_branch`.
    - `sub_tasks`: `id`, `parent_task_id`, `name`, `status`.

### 2.3 Audit Logging Utility
- **Action**: Create a global `gallium_log()` function in the server.
- **Requirement**: Every call to this function must write to both `stdout` (for dev) and the `events` table in SQLite.

## 3. Verification Steps
1. **Database Check**: Run the server and use `sqlite3 db/project.db ".tables"` to verify schema creation.
2. **Data Integrity**: Manually insert a log entry via the server and verify it persists after a restart.
