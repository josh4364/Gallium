# Project Gallium Overview
Gallium is a prototype of a visual agent editor and runtime. It consists of a Python backend that handles execution and a web frontend for editing and interaction.
The core idea is that agents and llm development in general seem to be borrowing/following the development path that video game AI followed. With early logic being static / hardcoded all in the LLM training and now we're seeing a push towards simple logic loops and state tracking external to the core evaluation. 
My thinking is that applying some more modern game AI logic like GOAP, Utility AI, and Behavior Trees to the LLM space could lead to more robust and predictable agents. This would be a harness layer on top of the LLM evaluations.
So this tool is my quick prototype to test out the idea, starting simple with behaviour state machines built somewhat how one might make a video game AI state machine.
For the spirit of the hackathon I've done all of the development using google gemini 3 flash and pro. With very minor human intervention at the source code level. If you dig through the git history, you can find where I restarted the project twice as I wasn't sure what I wanted to build when I started last week.

Disclamer: This isn't intended on being a fully finished and polished project. This is simply to express a fully working idea, to get it into the hands of people and let them experiment and figure out what works for them. Its all open sourced and free so have fun.

## Why "gallium"
For all of my projects privately and with my friends we pick a placeholder name as soon as possible for a project that doesn't have to mean anything as far as the project goes. This allows easily discussing it as a object without having to describe it fully to make sure we're on the same page. We pick plant species, elements, or any name really. For this paticular one I took a quick look at the periodic table and looked for a metal we haven't used.

## Project Summary

Gallium allows users to:
1.  **Define Agents**: Create AI agents with specific roles and state machines.
2.  **Build Workflows**: Connect multiple agents to work together on tasks.
3.  **Visual Programming**: Use a node-based editor to define logic, function calls, and LLM interactions.
4.  **Simulate & Chat**: Chat with running workflows in real-time.

## Architecture

The project has two main parts:
-   **Backend**: A Python engine that manages state, runs graphs, and talks to LLMs.
-   **Frontend**: A web application for the visual editors and chat interface.
-   **Communication**: They talk to each other via WebSockets.

### High-Level Data Flow

1.  **User Interaction**: The user does something in the web app (like sending a message).
2.  **WebSocket Event**: The frontend sends a JSON message to `web_server.py`.
3.  **Message Handling**: `message_handler.py` sends the command to `SimulationState`.
4.  **State Update**: `SimulationState` processes the request and might tell `GraphInterpreter` to run a graph.
5.  **Graph Execution**: `GraphInterpreter` goes through the nodes and executes logic (like calling an LLM).
6.  **Event Stream**: Updates are sent back to the frontend so the user can see what's happening.

## Core Concepts

### 1. Agents & State Machines
Agents are defined as state machines. Each agent has:
-   **States**: Different modes they can be in (e.g., "Planning", "Executing") all user driven.
-   **Transitions**: Evaluated condition expressions for moving between states.
-   **Functions**: Logic that runs "ticks" when in a specific state.

### 2. Functions (Node Graphs)
Logic is defined using visual "Functions". These are graphs where:
-   **Nodes**: Represent actions (e.g., "Send LLM Message", "Set Variable", "Greater Than").
-   **Connections**: Show the order of execution.
-   The `GraphInterpreter` runs these graphs step-by-step.

### 3. Workflows & Threads
-   **Workflow**: High level which agent state machine to use when starting a thread, and what "roles" should go to which model or provider.
-   **Thread**: A running instance of a workflow. It has its own memory and message history.

### 4. Simulation State
The `SimulationState` class tracks everything. It manages:
-   Active threads and their memory.
-   Global variables ("Blackboard").
-   The event log.
-   The execution tick counter.

## Source Code Structure

### Backend (`source/`)

| File | Description |
| :--- | :--- |
| `main.py` | Starts the `SimulationState` and the web server. |
| `simulation_state.py` | The main engine. Manages ticks, threads, and events. |
| `graph_interpreter.py` | Runs the node graphs. Handles variables and flow control. |
| `web_server.py` | Web server that handles WebSocket connections and serves files. |
| `function_manager.py` | Saves and loads agent and function files. |
| `message_handler.py` | Routes messages from the frontend to the backend. |
| `local_llm.py` | Client for local LLMs (like llama.cpp). |
| `gemini_llm.py` | Client for the Gemini API. |
| `blackboard.py` | Shared key-value store for global variables. |
| `struct_manager.py` | Manages custom data structures. |

### Frontend (`web_source/`)

| Directory/File | Description |
| :--- | :--- |
| `index.html` | The main HTML file. |
| `js/app.js` | Main frontend logic. Handles connection and UI updates. |
| `node_editor/` | Code for the visual graph editor. |
| `agent_editor/` | Code for the agent state machine editor. |
| `css/` | Styles for the application. |

## Key Features

-   **Visual Graph Editor**: Build logic flows visually.
-   **LLM Support**: Connect to OpenAI, Anthropic, Gemini, or local models.
-   **Real-time Debugging**: See events and logs as they happen.
-   **Workflow Management**: Save and load different agent setups.
-   **Memory**: Agents remember context during a thread.

## Building
This project was primarly built on NixOS using a development flake for the dependices.
Its just a python project, I'm sure if you pointed your favorite LLM at the repo it could get a venv or uv setup for you to run it.
Use `nix develop --command` to enter the shell
Or run `run.sh project_path_to_work_in` to start the server and open the localhost url in your browser. Make sure you start from within the gallium folder, so the graphs folder can be found with all of the default graphs I've made.
Defaults to port 8081

## LLM Backends
At the moment all of the providers are implemented, but only Local and Google are tested.
The keys are saved as plaintext in the `gallium/connections.json` file.

## Walkthrough

First off here is the landing when you load up the server
<img src="./docs/images/threads.png" alt="Gallium screenshot of the threads view">

The very last tab at the top middle you can see is the LLM Connections tab.
Setup whatever llm connections you want to use.
<img src="./docs/images/providers.png" alt="Gallium screenshot of the LLM connections tab">

Here on the second tab, workflows, we can see that its got simple descriptions of workflow names, the primary "router" agent which you can think of as the entry point, and a bunch of Workflow Roles with names, provider and optional model tags.
<img src="./docs/images/workflows.png" alt="Gallium screenshot of the workflows tab, showing a discuss-ralph-loop workflow with the same named router agent and a workflow role of plan and implement, with plan set to gemini 3 flash and implement set to Local provider">

Next up is the actual implementation of the router agent which is the Agent Editor tab.
You can see that its a simple finite state machine with a green Start node and several other nodes branching off of it to form a loop.
<img src="./docs/images/simple state machine.png" alt="Gallium screenshot of the agent editor tab, showing a simple finite state machine with a green Start node and several other nodes branching off of it to form a loop.">
Heres a slightly more complex one as an idea of what I'm envisioning in the future as workflows get more complex:
<img src="./docs/images/complex state machine.png" alt="Gallium screenshot of the agent editor tab, showing a complex finite state machine with a green Start node and several other nodes branching off of it to form a loop, with some branching into error paths and back into discuss loops to go back to the begining.">

Heres the logic that backs the implement stage of the agent. Its basically a ralph loop tick, injest the plan, look for work, do it, then close. It always starts with a fresh empty context.
<img src="./docs/images/implement graph.png">

Heres the type database window open to the struct editor. 
User structs with fields set to whatever type you need to store
<img src="./docs/images/struct editor.png">

Same as before, but this is the enum editor so you can set string enum constants.
<img src="./docs/images/enum editor.png">

In the context menu when you hover over a function it gives a tooltip for what the function is, description, inputs outputs. Here we're looking at the llm eval node which is the single shot send and one response mode (with tools supported, including tools created as graph functions)
<img src="./docs/images/llm eval.png">

When you open the context menu the search box is focused and typing will search for whatever function name, or tag is close to what your looking for, hitting enter spawns the top one.
<img src="./docs/images/context menu search for string.png">

Another useful node, lets you run sub processes. can be useful for hooking up some subprocess you have as a single shot tool for the llm to tool call.
<img src="./docs/images/run process.png">

This node was a late addition, usage idea would be to shoot out a web request to some other service you have to injest into the tool call, or maybe just to send a email to yourself notifying the work as done.
<img src="./docs/images/web request.png">

