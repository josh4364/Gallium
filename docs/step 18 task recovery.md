# Step 18: Task Recovery State Machine

## Goal
Implement a state machine for tasks and a recovery mechanism to handle tasks that were interrupted (e.g., server crash or restart).

## Implementation Details

1.  **Task States**: Defined `TaskStatus` enum in `db_manager.h`:
    *   `PENDING`
    *   `IN_PROGRESS`
    *   `COMPLETED`
    *   `FAILED`
    *   `PAUSED`

2.  **Database Functions**:
    *   `db_create_task`: Creates a task with `PENDING` status.
    *   `db_update_task_status`: Updates a task's status.
    *   `db_recover_tasks`: Identifies tasks stuck in `IN_PROGRESS` on startup and transitions them to `PAUSED`.

3.  **Server Integration**:
    *   Updated `main.c` to call `db_recover_tasks()` immediately after database initialization.

4.  **Testing**:
    *   Added `--test-recovery` flag to `gallium-server`.
    *   Simulates a crash by creating a DB with `IN_PROGRESS` tasks, closing it, re-opening it, and running recovery.
    *   Verified that tasks are correctly marked as `PAUSED`.

## Verification
Run the recovery test:
```bash
build/bin/server/gallium-server --test-recovery
```
Expected output:
```
Running Recovery Test...
Simulating restart...
[DB] {"event": "recovery", "count": 2}
Recovered: 2
Recovery Test PASSED.
```
