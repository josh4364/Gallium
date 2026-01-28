# Gallium Architecture Specification

## 1. Overview
Gallium is a cross-platform AI workflow system designed with a high-performance server-client architecture. It enables complex, state-driven AI workflows by managing multiple LLM agents that operate on local files and external APIs.

## 2. Core Components

### 2.1 Gallium Server
The central orchestrator responsible for:
- **MCP Host**: Act as a host for MCP servers, orchestrating external tools.
- **Agent Orchestration**: Managing the hierarchy of Manager, Task Manager, and Sub-task Agents using a **thread-per-agent/connection** model. Communication is handled via a **shared message queue** protected by mutexes. Profiles are **statically compiled** into the server with embedded instructions.
- **Local File Operations**: Operating within a **lightweight sandbox** that restricts file access to the workspace folder. Includes specialized `build-program` tools that execute shell commands defined in `tasks.json`.
- **LLM Integration**: Interfacing with Gemini (API), local models (via `llama.cpp`).
- **Project Database**: Managing state, history, and full audit logs via a local SQLite3 database per project.

### 2.2 Gallium Clients
- **TUI Client (Primary)**: A high-performance terminal user interface built with `notcurses`.
    - **Waterfall View**: Support for toggling into a live "waterfall" view of all concurrent agent event logs and thoughts.
- **Web UI**: A rich, browser-based interface served by the Gallium server, built with **Vanilla JS and Web Components** (Zero-dependency). Offers advanced visualization and diff viewing (See `specs/feature-client-web.md`).
- **Communication**: All clients communicate with the server via WebSockets using a custom binary protocol.

## 3. Agent Hierarchy & Logic

### 3.1 Orchestration Layers
1. **Top-Level Manager**: Interprets the user's primary goal and maintains overall context.
2. **Task Manager**: Breaks down the primary goal into actionable sub-tasks.
3. **Sub-Task Agents**: Specialized agents with specific profiles (e.g., coder, researcher, reviewer) chosen by the Task Manager for specific duties.

### 3.2 State Management
The server maintains a state machine to track the progress of tasks. This ensures that LLMs do not drift from the original prompt and can recover or pivot based on sub-task outcomes.

## 4. Technical Stack

| Component | Technology |
| :--- | :--- |
| **Language** | C (99/11) using **Opaque Pointers** for C++ library encapsulation |
| **OS Support** | Linux, Windows |
| **Build System** | **CMake** |
| **Environment** | **Nix (Flake)** for dependencies and dev shell |
| **TUI Library** | `notcurses` |
| **Database** | SQLite3 (Full audit/state history) |
| **Networking** | **libwebsockets** (C library) |
| **LLM Backends** | Gemini API, `llama.cpp` (local), MCP Host |
| **Serialization** | Binary frame + **json-c** for structured payloads |

## 5. Protocol & Networking

### 5.1 Protocol
The communication layer uses a custom binary serialization format:
- **Header**: `[MessageID (uint16)]`
- **Payload**: `[Length (uint32)] [JSON Data (UTF-8)]`
- **Logic**: Dispatch based on ID, then parse JSON payload using `json-c`.

### 5.2 Task Management (`tasks.json`)
Project-specific tasks are defined in a `tasks.json` file at the workspace root. These are exposed to sub-task agents as executable tools.
```json
{
  "tasks": [
    {
      "name": "build",
      "command": "cmake --build build"
    },
    {
      "name": "test",
      "command": "./build/tests"
    }
  ]
}
```
Each task command is executed as a shell string within the workspace sandbox.

### 5.2 Connectivity
- **WebSockets**: Provides real-time bidirectional communication between server and client.
- **Server Responsibilities**: The server listens for client connections and also serves the Web UI assets in the future.

## 6. Configuration & Security

### 6.1 API Key Management
- API keys are stored in a `keys.json` file located at the project or workspace root.
- **Warning**: This file should be excluded from version control.

### 6.2 Agent Configuration
System configuration allows mapping roles to specific models:
- Example: `"role: task-manager", "model: gemini-1.5-flash"`
- Config defined via a central system configuration file.

## 7. Development & Infrastructure

### 7.1 Environment
- **NixOS**: Development environment managed via `nix/flake.nix`.
- **Usage**: Use `nix develop` to enter the environment with all dependencies.
- **Build**: `cmake` handles the build process inside the nix-shell.

### 7.2 Testing
- **Framework**: Manual local testing framework using standard output assertions (Pass/Fail).
- **Audit**: All agent transitions and thoughts are stored in SQLite for post-run analysis.
