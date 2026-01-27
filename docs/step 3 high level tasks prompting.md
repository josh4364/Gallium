## User

@project.md 
@specs 
Take a look at the features of the project, and develop a short order of development that should keep dependices in order for what needs to be built first.
Create a high level task multi step plan in the document `specs/high-level-tasks.md`
Only create the markdown file and make it as detailed as you can.


## GEMINI

I have analyzed the project specifications and developed a detailed order of development for Gallium. The plan follows a dependency-first approach, starting with the shared protocol and server infrastructure before moving into the TUI client and complex AI orchestration.

I've created the high-level task plan in 
specs/high-level-tasks.md
.

Summary of Development Phases:
Phase 1: Foundation & Bootstrapping: Sets up the build environment and defines the custom binary protocol that both the server and client will share.
Phase 2: Server Core & Persistence: Implements the SQLite3 database for full audit trails and the libwebsockets communication hub.
Phase 3: Client TUI Development: Focuses on the notcurses layout engine, including the multi-column view and the unique "Waterfall" event log.
Phase 4: System Integration & Execution: Develops the security sandbox, the tasks.json runner, and the Git-backed task tracking system.
Phase 5: AI Orchestration (The "Brains"): The most complex phase, implementing the thread-per-agent model, LLM integrations (Gemini, llama.cpp), and state machine logic.
Phase 6: Specialist Workflows & Polish: Finalizes high-level features like the Project Initialization interview, system notifications, and "Big Panic" button recovery.
You can view the full detailed breakdown in 
specs/high-level-tasks.md
.

## USER
Split each of the tasks into their own granular `task-#-name.md`
In `specs/tasks/`
Leave the high level tasks document.


## GEMINI

I have split the high-level development plan into granular task documents in the specs/tasks/ directory, while keeping the bootstrap task and the high-level overview intact.

New Granular Tasks
The following task files have been created, each containing detailed goals, requirements, and verification steps:

task-0-protocol.md
: Binary header format and JSON serialization.
task-1-db-layer.md
: SQLite3 schema and persistence manager.
task-2-comm-hub.md
: libwebsockets integration for real-time streaming.
task-3-tui-layout.md
: notcurses multi-column UI and Waterfall view.
task-4-sandbox-runner.md
: Security sandbox and tasks.json shell command execution.
task-5-git-workflow.md
: Automated branching and completion commits.
task-6-agent-orchestration.md
: Thread-per-agent model and hierarchical logic.
task-7-llm-integration.md
: API clients (Gemini) and MCP tools.
task-8-project-init.md
: The user interview and interactive requirements gathering.
The high-level roadmap remains available in 
specs/high-level-tasks.md
 for tracking overall progress.




