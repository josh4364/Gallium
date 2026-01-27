# feature prompting

## User response

Using this top level overview and these user interview questsions, generate several feature spec documents for each described feature. 
do not omit anything included in the interview.
@project.md 


* describe a feature the project should have, use simple declaritive language like <module> should be able to <blank>. 
    * client should be able to view the top level projects, displayed on the top menu bar at all time which project is open
    * client should be able to click between top level tasks to view their constantly updating sub tasks
    * when a task manager notices it needs user input or validation the task should light up red
    * the server should maintain a database history of all events and llm generated strings, with accurate timestamps and associated task / sub task
    * everything the tool does, every action, is logged to the local database.
    * the server feeds realtime data to the client as the client requests different streams of data.    
    * client can subscribe to event streams from the server, such as "task events" "sub task events for task ###" "sub task ### event log"
    * client displays events in a waterfall view on the right hand side that can be toggled with the menu bar
    * overall waterfall event log is displayed but not the raw llm messages as they are noisy, allowing user to take a peek at a glance.
    * client has a tui file browser that can be navigated with arrow keys to navigate the file tree rooted at the workspace root
    * server maintains a folder isolation to the workspace root so no llm tool calls can excape that without user approval
    * server can trigger system notifcations 
    * whatever section is highlighted in the TUI should have a colored outline
    * big panic pause button is at the top to stop anything going on, which also backs up the bots to their last checkpoint, and shuts down any built project testing.
    * proper exponentional backoff for all api usage so free tiers of gemini can be used
    * each task attempt is stored as a local git branch, and each sub task is stored as a local git commit.
    * the code generation sub tasks may generate alternative implementations of work, to do so the server will create a new branch "task-alt-0" where the number increments for each alt workflow.
    * code generation sub tasks when making code edits will automatically trigger a checkpoint, then LSP Linting and errors to be fed back into the LLM to fix, then compressed back into a "Fixed errors + updated code" in the context window.
    * the client TUI should have several server settings that change the server's settings.json
    * the server settings ui should contain all api keys and allow adding them
    * the server settings ui should have the option to toggle on (default off) the completion of tasks to `git push` so the remote (github) gets the changes when a task is done.
    * the server settings UI should have the option to toggle `git push` for the final top level PR of all merged tasks
    * at the end of each task, the task manager does an assement of bottlenecks such as the following, and then places those feedback events into the database for the client to view later.
        * "got stuck in a loop due to a mcp connection error"
        * "spent lots of sub task time on developing x"
        * "spent lots of time fixing vulkan validation errors related to resource transition"
    * client should have a view to browse all bottleneck messages, and in general filter for events they want to inspect
    * the top level task manager view should display the last run of the task manager's context window percentage, just as a simple status text
    * each sub task should keep a status percentage of their context window size with live updating displayed on their sub task list box
    * client main view should be multiple columns. top status text displays a short single line goal string for the current big task, bellow that is the colums left to right: the top level projects as small icons, the top level tasks, selected task sub task list, then the event stream for the currently selected sub task.
        * each element is a button that can be clicked, with outline highlights for whats selected and what needs attention
    * when begining a new project (user selects new project workflow)
        * the user is interviewed in the following order:
            * Top level what is the project?
            * What OSes should be supported?
            * What language is X writen in?
                * (where X is one or more of the parts of the program described)
            * For X what third party dependices do you know you want to use?
                * Do you want direct coupling or an abstraction wrapper around it?
                * git submodule or manual vendoring?
            * At this point the plan now switches into generated interview mode
                * the llm generates a question to clarify what the user wants more accurately, to itterate on the top level project requirements doc
                * user responds to questions and eventually can tell the LLM "finished" to move on
            * top level project requirements doc is sythsized and the user is displayed it
                * feedback loop from user updating it until they again say "finished"
        * a branch is created and the first commit is made to place the project requirements doc into it
        * top level manager now switches to archetcture mode
            * spawn a task manager and give them the goal for one feature
                * task manager then generates a todo list of subtasks and parses that into concrete task objects in memory
                * task manager then takes the first task, the top level feature, top level simplified goal, then generates the sub task prompt, and which sub task type to spawn (example code generator, debugger, researcher).
                    * the sub task agent is then spawned with a concrete backing object for the sub task, the type, the prompt from the task manager, keeping track of everything.
                    * the sub task is then evaluated and ran until the llm reaches a checkpoint.
                    * at each event (end, tool request, program run) the the task manager evaluates the simplified history log of this sub task to decide if its stuck in a loop (calling build over and over without editing code is an example)
                        * if it decides to continue, the request is completed and the sub task continues
                        * if the event is the finish signal, then a commit is made with the sub tasks as a git commit friendly name
                    * task manager then restarts the loop with the knowledge of this sub task done
                * when the final sub task is done, the task manager does an evaluation of the simplified history of all of its sub tasks leading up to the completion of the task, and generates a bottleneck report of things that slowed things down or caused excessive retrys.
                * with this task complete the task manager hands off the signal to the top level manager object to signal completeion
            * top level manager restarts the task manager with the new task, and knowledge of the previously completed task list. 
                * the new task is spawned within a new branch forked from the previously completed task branch
        * when all tasks are complete the final task branch is flattened into a single top level goal named branch with all the sub task commits kept, then discards the intermediate task branches.
            * a completion event is produced which the client flashes green 3 times to signfiy completion


Generate several feature spec documents to `specs/feature-*.md`


## gemini3 flash

I have generated several feature specification documents in the specs/ directory, categorizing the requirements from the project overview and user interview questions into logical functional modules.

Generated Specification Documents
feature-client-tui.md
Focus: User interface layout and interactivity.
Highlights: Multi-column navigation (Projects, Tasks, Sub-tasks, Events), Waterfall view logic, File Browser integration, Status indicators (context window usage, red/green visual alerts), and the Server Settings UI.
feature-server-orchestration.md
Focus: Backend infrastructure and data handling.
Highlights: SQLite3 database persistence for audits and history, WebSocket event streaming subscriptions, Workspace sandboxing (folder isolation), and API management (exponential backoff).
feature-task-workflow.md
Focus: Agent logic, automation loops, and Git integration.
Highlights: Branch-per-task and commit-per-subtask strategy, "Architecture Mode" logic, specialized agent types (Coder, Researcher, Debugger), loop/stuck detection, and the automated code editing/linting loop.
feature-project-init.md
Focus: Start-of-project user experience.
Highlights: The structured 6-step user interview, transitioning into LLM-generated clarification, synthesis of the requirements document, and the initial project setup in Git.
Each document uses declarative language (e.g., "client should be able to...") and preserves all specific details from your request, including bottleneck reporting, task-alt branch naming, and the "Big Panic" button functionality.



