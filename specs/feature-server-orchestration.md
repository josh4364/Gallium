# Feature Specification: Server Orchestration and Data Management

## 1. Overview
The Gallium Server acts as the source of truth for all project data and agent actions. It manages persistent storage, real-time data streaming to clients, and ensures safe execution of LLM-driven tools.

## 2. Declarative Requirements

### 2.1 Persistence and Logging
- **Server should be able to** maintain a local SQLite3 database for each project containing a full history of all events and LLM-generated strings.
- **Server should be able to** log every single action taken by the tool to the local database.
- **Server should be able to** associate every log entry with accurate timestamps, task IDs, and sub-task IDs.
- **Server should be able to** store bottleneck assessment reports (e.g., "stuck in loop", "excessive time on dependency X") at the end of each task.

### 2.2 Data Streaming and Connectivity
- **Server should be able to** feed real-time data streams to clients via WebSockets.
- **Server should be able to** allow clients to subscribe to specific event streams, such as:
    - "task events" (global task updates).
    - "sub task events for task ###" (updates for all subtasks under a task).
    - "sub task ### event log" (granular logs for a specific sub-task).
- **Server should be able to** handle client requests for historical data from the database.

### 2.3 Resource and API Management
- **Server should be able to** implement proper exponential backoff for all LLM API usage to accommodate free tiers (e.g., Gemini).
- **Server should be able to** monitor context window sizes for all active agents and report percentages to the client.
- **Server should be able to** backup all active "bots" (agents) to their last known checkpoint when a Pause/Panic signal is received.

### 2.4 Security and System Integration
- **Server should be able to** maintain folder isolation, restricting all LLM tool calls (read/write/execute) to the workspace root.
- **Server should be able to** require explicit user approval if an LLM attempts to escape the sandbox.
- **Server should be able to** trigger system-level notifications (e.g., via `libnotify` or OS equivalents) when tasks require attention.

## 3. Database Schema Concept
- **Events Table**: `id`, `timestamp`, `level` (INFO/WARN/ERROR), `task_id`, `sub_task_id`, `payload` (JSON).
- **LLM Logs Table**: `id`, `timestamp`, `agent_role`, `task_id`, `prompt`, `response`, `usage_tokens`.
- **Bottlenecks Table**: `id`, `task_id`, `report_string`, `timestamp`.
