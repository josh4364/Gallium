# Project Gallium Overview
Gallium is a prototype of a visual agent editor and runtime. It consists of a Python backend that handles execution and a web frontend for editing and interaction.
The core idea is that agents and llm development in general seem to be borrowing/following the development path that video game AI followed. With early logic being all in the LLM, and now we're seeing a push towards simple logic loops and state tracking external to the core evaluation. 
My thinking is that applying some more modern game AI logic like GOAP, Utility AI, and Behavior Trees to the LLM space could lead to more robust and predictable agents.
So this tool is my quick prototype to test out something like behaviour state machines built somewhat how one might make a video game ai state machine, and have logic for each of the node states.
For the spirit of the hackathon I've done all of the development using google anti gravity with very minor human intervention at the source code level. Though I did have to correct a few times when I wasn't sure where or what I was making.
My disclamer is that this isn't intended on being a fully finished and polished project. This is simply to express a fully working idea, to get it into the hands of people and let them experiment and figure out what works for them. Its all open sourced and free so have fun.

## Why "gallium"
For all of my projects privately and with my friends we pick a placeholder name as soon as possible for a projec that doesn't have to mean anything as far as the project goes. This allows easily discussing it as a object without having to describe it fully to make sure we're on the same page. We pick plant species, elements, or any name really. For this paticular one I took a quick look at the periodic table and looked for a metal we haven't used.

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
-   **States**: Different modes they can be in (e.g., "Planning", "Executing").
-   **Transitions**: Evaluated condition expressions for moving between states.
-   **Functions**: Logic that runs when in a specific state.

### 2. Functions (Node Graphs)
Logic is defined using visual "Functions". These are graphs where:
-   **Nodes**: Represent actions (e.g., "Send LLM Message", "Set Variable", "Greater Than").
-   **Connections**: Show the order of execution.
-   The `GraphInterpreter` runs these graphs step-by-step.

### 3. Workflows & Threads
-   **Workflow**: A template showing which agents work together.
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
This project primarly built on NixOS using a development flake for the dependices.
Use `nix develop --command` to enter the shell
Or run `run.sh` to start the server and open localhost in your browser.
Defaults to port 8081

## LLM Backends
Right now I've implemented Loca llms through the openai compatable backend llama.cpp provides.
I've also added support for the Gemini API directly, which you must provide a gemini api key on the LLM Connections tab.
The keys are saved as plaintext in the `gallium/connections.json` file.

The openai and claude UI elements are placeholders, but you could easily one shot prompt an LLM to add support for those APIs.

## Walkthrough

First off here is the landing when you load up the server
<img src="./images/gallium_1.png" alt="Gallium screenshot of the threads view with nothing in the chat yet">

The very last tab at the top middle you can see is the LLM Connections tab.
Setup whatever llm connections you want to use (See above for whats actually implemented).
<img src="./images/gallium_2.png" alt="Gallium screenshot of the LLM connections tab">

Here on the second tab, workflows, we can see that its got simple descriptions of workflow names, the primary "router" agent which you can think of as the entry point, and a bunch of Workflow Roles with names, provider and optional model tags.
<img src="./images/gallium_3.png" alt="Gallium screenshot of the workflows tab, showing a discuss-ralph-loop workflow with the same named router agent and a workflow role of plan and implement both set to Local provider">

Next up is the actualy implementation of the router agent which is the Agent Editor tab.
You can see that its a simple finite state machine with a green Start node and several other nodes branching off of it to form a loop.
<img src="./images/gallium_4.png" alt="Gallium screenshot of the agent editor tab, showing a simple finite state machine with a green Start node and several other nodes branching off of it to form a loop.">

Clicking on the Start node we can see that its asigned to the function logic of discuss plan.
<img src="./images/gallium_5.png" alt="Gallium screenshot of the agent editor tab clicked on the start node showing a sidebar with the function logic of discuss plan selected.">

If we click on the connection from Start to Ralph, we can see a different Transition conditions list.
When all of these conditions are true after a state tick, we would make this jump from the previous state to the state the connection points to.
Think of the simple case where we would want to stay in Planning mode until the user states they want to move onto the Execute state.
These condition expressions are evaluated against a thread state object which can be thought of as a hashmap storing a bunch of keys the user can set to whatever value within the function thats being ticked for that state.

<img src="./images/gallium_6.png" alt="Gallium screenshot of the agent editor tab clicked on the connection from Start to Ralph showing a sidebar with the transition conditions of the connection selected.">

Next up is the node graph opened to display our start function "discuss plan".
<img src="./images/gallium_7.png" alt="Gallium screenshot of the node graph editor showing the discuss plan function logic.">

You can see that is a pretty large graph, maybe even a bit spaghetti but thats really just what node scripting ends up like. Its visually inspired by Unreal Engine's blueprints.
Since this graph is 'Ticked' by being in the start state, we need to actually think what we're going to do every entry into this state:
- What should we do on the first tick?
- How and what should be prompt the LLM to do?
- Should we set some state in teh thread context so we advance to the next top level agent state?

Here we can focus in on some of the node graph areas and you can get a feel for the logic
<img src="./images/gallium_8.png" alt="Gallium screenshot of the node graph the nodes Create LLM Chat, Set Context Key">

A noteworthy thing to point out is that we can create graph tools that can be tool called by LLMs by makeing a list of tools and providing it into the LLM Chat node / Thread.

<img src="./images/gallium_9.png" alt="Gallium screenshot of the create tool node">
<img src="./images/gallium_10.png" alt="Gallium screenshot of the caculate graph which calls the qalc tool as a sub process">

