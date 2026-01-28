# Feature: Web Client Interface

## 1. Overview
The Gallium Web Client is a modern, responsive web application served directly from the Gallium Server. It provides a rich, visual interface for managing AI agents, viewing task progress, and interacting with the system. While the TUI offers speed and low-level control, the Web UI offers distinct advantages in visualization, rich text rendering (Markdown/Code), and user experience.

## 2. Architecture

### 2.1 Serving Strategy
- **Static Assets**: The Gallium Server (`source/server`) acts as an HTTP server to serve the compiled static assets (HTML, CSS, JS, WASM) of the web application.
- **Connection**: Upon loading, the client establishes a **WebSocket** connection to the server using the existing binary/JSON protocol.
- **State Sync**: The client maintains a local state store synced with the server's state via event handling, mirroring the TUI's logic.

### 2.2 Technology Stack
- **Framework**: **Vanilla JavaScript (ES6+)** and **HTML Web Components**. NO NodeJS, NO React/Vue/Svelte, and NO UI builder frameworks.
- **Styling**: Modern CSS with CSS Variables for theming (Dark Mode default).
- **Protocol**: `libwebsockets` (server-side) <-> Native WebSocket API (client-side) with `json-c` equivalent parsing.

## 3. Core Requirements

### 3.1 Design Aesthetics
- **Theme**: "Gallium Dark" - A premium dark mode featuring deep grays (`#0a0a0a`), vibrant accent colors (Neon Blue/Purple), and glassmorphism effects for panels.
- **Typography**: Modern sans-serif fonts (Inter or JetBrains Mono for code).
- **Motion**: Subtle micro-animations for state changes (e.g., task completion, new log entries, agent "thinking" pulses).
- **Layout**: Responsive grid/flexbox layout that adapts to desktop and tablet sizes.

### 3.2 Key Features

#### A. The Dashboard (Command Center)
- **Status Bar**: Server status, active agent count, token usage, and global "STOP" button.
- **Task Hierarchy Visualization**: A tree or kanban view of the Goal -> Tasks -> Sub-tasks hierarchy.
- **Agent Status**: Visual indicators for what each agent is currently doing (e.g., "Researching", "Coding", "Waiting").

#### B. The Waterfall (Live Event Stream)
- A vertically scrolling log of all system events.
- **Rich Rendering**: Markdown support for "Thought" blocks, syntax highlighting for code snippets.
- **Filtering**: Toggles to show/hide debug logs, specific agent threads, or error messages.

#### C. Interactive File Browser
- A visual representation of the project workspace.
- **Diff Viewer**: Visual "Before vs After" diffs when agents propose changes, with "Approve/Reject" buttons.

#### D. Input & Dialogue
- **Chat Interface**: A chat-like input for providing instructions, answering agent questions, or clarifying requirements (Interview Mode).
- **Notification Center**: Non-intrusive toasts for system alerts.

## 4. User Experience Workflow

1. **Launch**: User runs `gallium-server --web`.
2. **Access**: User opens `http://localhost:8080` (or configured port).
3. **Connect**: App auto-connects via WebSocket.
4. **Monitor**: User watches the "Waterfall" and "Task Tree" update in real-time.
5. **Interact**: User clicks on a "blocked" task to see the agent's query, types a response, and hits send.

## 5. Technical Constraints
- The web client must handle high-frequency updates (log streams) without freezing the UI. Use virtual scrolling for the Waterfall view.
- Strict error handling for WebSocket disconnections with auto-reconnect logic.
