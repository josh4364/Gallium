# Task: Agent Orchestration (The Brains)

## 1. Goal
Implement the hierarchical agent model (Top Manager, Task Manager, Sub-Task Agents) using a multi-threaded architecture.

## 2. Requirements

### 2.1 Thread-per-Agent Model
- **Action**: Implement the `gallium_agent_spawn()` function.
- **Requirement**: Each agent runs in its own thread with its own message queue for communication.

### 2.2 Task Decomposition
- **Action**: Implement the **Task Manager** logic.
- **Logic**: Take the primary goal and prompt an LLM to return a JSON array of sub-tasks.

### 2.3 Specialized Agents
- **Action**: Create agent profiles (Coder, Researcher, Reviewer).
- **Implementation**: These are LLM system prompts statically compiled into the server as Opaque pointers to strings.

### 2.4 Loop Detection
- **Action**: Implement a history buffer for each agent.
- **Logic**: If the last 3 tool calls are identical (or very similar), trigger a "Bottleneck Detected" event and notify the Task Manager to pivot.

### 2.5 Code Generation Loop (Automation)
- **Action**: Implement the iterative "Coding & Fix" cycle for Sub-task agents.
- **LSP Integration**:
    - Trigger `clangd` or `pylsp` (depending on language) on modified files.
    - Feed validation errors back to the agent as immediate feedback.
- **Diff Summarization**:
    - Compress large file edits into diff summaries for the context window.
    - Track "Before/After" checkpoints for every edit.

## 3. Verification Steps
1. **Concurrency Test**: Spawn two agents simultaneously and verify they both log to the `events` table without deadlocking.
2. **Decomposition Check**: Pass a complex goal and confirm the Task Manager generates at least 3 logical sub-tasks.
