# High-Level Development Plan: Gallium

This document outlines the phased development of the Gallium AI workflow system, ordered by dependency and priority.

## Phase 1: Foundation & Bootstrapping
*Status: Initialized*

1. **Project Skeleton & Build System**
    - [x] Configure Nix Flake with `notcurses`, `sqlite3`, `libwebsockets`, `json-c`, and `cmake`.
    - [x] Establish directory structure (`source/server`, `source/client`, `source/common`).
    - [x] Setup root and sub-directory `CMakeLists.txt`.
    - [x] Implementation of placeholder applications.
2. **Protocol Definition (`gallium_common`)**
    - [x] Define binary header format (`MessageID`, `Length`).
    - [x] Implement `json-c` wrappers for structured payload serialization.
    - [x] Create shared message queue structures for agent communication.

## Phase 2: Server Core & Persistence
1. **Database Layer**
    - [x] Implement SQLite3 manager for per-project databases.
    - [x] Define initial schema: `events`, `llm_logs`, `tasks`, `sub_tasks`.
    - [x] Implement "Log-every-action" utility for full audit trails.
2. **Communication Hub (`libwebsockets`)**
    - [x] Implement Server WebSocket listener.
    - [x] Implement Client WebSocket connector.
    - [x] Develop the custom binary frame dispatcher (ID-based routing).
    - [x] Implement heartbeat/reconnection logic.

## Phase 3: Client TUI Development
1. **Layout Engine (`notcurses`)**
    - [x] Implement the 4-column main layout (Icons, Tasks, Sub-Tasks, Events).
    - [x] Develop the top menu bar (Projects, Project Name, Panic Button, Settings).
    - [x] Create the focused-section highlighting system.
2. **Navigation & Interaction**
    - [x] Implement a TUI file browser for the local workspace.
    - [x] Map keyboard/mouse events to UI selection and server requests.
3. **Waterfall View**
    - [x] Implement the toggleable "Waterfall" event log overlay.
    - [ ] Filter out raw LLM noise; allow "peek" functionality for details.

## Phase 4: System Integration & Execution
1. **Tool Sandbox & Task Runner**
    - [x] Implement file system isolation (sandbox) for the workspace root.
    - [x] Parse and execute `tasks.json` shell commands.
    - [x] Implement user-approval gate for out-of-sandbox actions.
2. **Git-Backed Workflow**
    - [x] Implement automatic branch creation for top-level tasks.
    - [x] Implement automatic commit logic for sub-task completion.
    - [x] Develop branch flattening and alternative implementation logic.

## Phase 5: AI Orchestration (The "Brains")
1. **Agent Logic Manager**
    - [ ] Implement the "Thread-per-Agent" orchestration model.
    - [ ] Develop the **Top-Level Manager** (Goal interpretation).
    - [ ] Develop the **Task Manager** (Breakdown to sub-tasks).
2. **LLM Integration Layer**
    - [ ] Implement Gemini API client with exponential backoff.
    - [ ] Implement optional `llama.cpp` local model support.
    - [ ] Implement MCP Host functionality to orchestrate external MCP tools.
3. **Advanced Flow Control**
    - [ ] Implement state machine for tracking task progress/recovery.
    - [ ] Implement loop detection (redundancy analysis).
    - [ ] Implement bottleneck assessment logs at task completion.

## Phase 6: Specialist Workflows & Polish
1. **Project Initialization**
    - [ ] Implement "Interview Mode" for requirements gathering.
    - [ ] Implement "Requirements Synthesis" to generate project specs.
2. **Feedback & Notifications**
    - [ ] Integrate system-level notifications (`libnotify`).
    - [ ] Implement screen-flash signals for goal completion.
    - [ ] Visual urgency cues (Red tasks for input required).
3. **Final Hardening**
    - [ ] Audit-log viewer and historical state playback.
    - [ ] Context window usage monitoring and reporting.
    - [ ] Pause/Panic "Big Button" backup and checkpointing.
