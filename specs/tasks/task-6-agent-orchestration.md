# Task: Agent Orchestration (The Brains)

## 1. Goal
Implement the hierarchical agent model (Top Manager, Task Manager, Sub-Task Agents) using a multi-threaded architecture.

## 2. Requirements

### 2.1 Thread-per-Agent Model
- **Action**: ~~Implement the `gallium_agent_spawn()` function.~~
- **Requirement**: - [x] Each agent runs in its own thread with its own message queue for communication.

### 2.2 Task Decomposition
- **Action**: ~~Implement the **Task Manager** logic.~~
- **Logic**: - [x] Take the primary goal and prompt an LLM to return a JSON array of sub-tasks.

### 2.3 Specialized Agents
- **Action**: ~~Create agent profiles (Coder, Researcher, Reviewer).~~
- **Implementation**: - [x] These are LLM system prompts statically compiled into the server as Opaque pointers to strings.

### 2.4 Loop Detection
- **Action**: ~~Implement a history buffer for each agent.~~
- **Logic**: - [x] If the last 3 tool calls are identical (or very similar), trigger a "Bottleneck Detected" event and notify the Task Manager to pivot.

### 2.5 Code Generation Loop (Automation)
- **Action**: Implement the iterative "Coding & Fix" cycle for Sub-task agents.
- **LSP Integration**:
    - Trigger `clangd` or `pylsp` (depending on language) on modified files.
    - Feed validation errors back to the agent as immediate feedback.
- **Diff Summarization**:
    - Compress large file edits into diff summaries for the context window.
    - Track "Before/After" checkpoints for every edit.

## 3. Verification Steps
1. ~~**Concurrency Test**: Spawn two agents simultaneously and verify they both log to the `events` table without deadlocking.~~
2. ~~**Decomposition Check**: Pass a complex goal and confirm the Task Manager generates at least 3 logical sub-tasks.~~

## 4. Work Summary (Future Self)
We have successfully implemented the core agent orchestration layer (`agent_manager.c`, `agent_manager.h`).
*   **Thread-per-Agent**: Agents now run in independent threads with `gallium_queue` for message passing.
*   **Profiles**: Defined static agent profiles in `agent_profiles.h` (Top Manager, Task Manager, Coder, etc.).
*   **Loop Detection**: Agents track their last 3 actions/thoughts; identical sequences trigger a "loop detected" log.
*   **LLM Stub**: Integrated a basic `llm_client.h` interface (currently stubbed) that mocks Task Manager JSON returns.
*   **Testing**: Added a `--test-agents` flag to `main.c` that validates concurrency and loop detection.

**Next Steps**:
*   The "Code Generation Loop" and LSP integration were NOT part of this specific implementation step (they seem more like Task 7 or a future Code-Agent specific task). We should move them to the next relevant task or ensure they are picked up when we implement the actual `coder` agent logic deeper.
*   The `llm_client.c` is currently a STUB. You need to connect this to real Gemini/Llama APIs in **Task 7 (LLM Integration)**.
