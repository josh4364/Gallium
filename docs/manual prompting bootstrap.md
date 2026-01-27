## Bootstrap prompt

Lets begin building a top level archetcture document. Produce only the file `specs/project.md`
The following is a top level interview with the user, assess their responses and draft the first verison of the document.

* top level what do you want?
    * I want to create a new AI workflow system with a server and client archetecture.
    * the server manages connections to various llms and also has lots of state machine logic within to keep the llms on track working towards a common high level prompt
    * the server has a top level manager, a task manager and indivdual sub task agents with different profiles depending on their sub task goal, chosen by the task manager
    * I know that I want a server that does the ai logic and operates on local files, similar to gemini cli allowing for MCP tool use and directly talking to gemini api and other models. also local model talking to local llama.cpp for local smaller model logic
    * I know that I want both a text ui client to start out with and also a web UI client later on communicating with websockets. so web sockets for the client to server communication and later on the server should serve that web app UI.

* what OSes should be supported?
    * cross platform, linux, windows

* what language is the server written in?
    * perfer C for everything, fallback to encapsulated cpp when needed to wrap a cpp library

* what language is the text client written in?
    * perfer C for everything, fallback to encapsulated cpp when needed to wrap a cpp library


* what third party dependices do I know of right now that I want to use?
    * notcurses for the clients TUI
    * any good simple C dependency for the websockets
    * sqllite3 for the local server database per project

* how should the network messages be decoded and encoded?
    * simple binary serialization with length prefixed strings
    other examples:
    * json strings
    * yaml
    * bson blobs
    * protobuff

* what testing framework should be used?
    * none
    * unity
    * gtest
    * create a manual local one that does simple standard out assets, fail or pass.

* how should the api access to various apis like gemini, llama work?
    * user local config file to store their api keys in called keys.json at the program/workspace root
    * system config for the project should allow choosing what each agent role and senario should use for the ai model. example: "role: task-manager model: gemini-3-flash"

Create the first draft, then continue interviewing me here with other clarifying questions.


## gemini3 flash response

I have created the first draft of the architecture document in 
specs/project.md
. This covers the core server-client structure, the agent hierarchy, and the technical stack we discussed.

To further refine this document and move towards implementation, I have a few clarifying questions:

Concurrency Model: For the server, do you prefer a thread-per-agent/connection model, or should we go with an event-driven (e.g., poll, epoll on Linux, IOCP on Windows) architecture to handle WebSockets and LLM stream processing?
Binary Protocol Specifics: For the "length-prefixed string" serialization, should we include a message header (e.g., a uint16 MessageID) to dispatch events, or will the protocol be strictly state-driven?
Encapsulated C++ Patterns: When we wrap libraries like llama.cpp, do you prefer using C-style opaque pointers (handles) to maintain a pure C API for the rest of the application?
SQLite Depth: Should the SQLite database store just the persistent state and final outputs, or are you looking to log the entire history of agent "thoughts" and state transitions for debugging and audit purposes?
MCP Role: Will the Gallium server act as an MCP Host (allowing it to connect to and orchestrate various external MCP servers) or will it primarily implement its own internal toolset?
Build Infrastructure: For a cross-platform C project, would you prefer CMake, Meson, or a more manual approach with specialized Makefiles/Batch scripts?
How would you like to proceed with these details?

## user response

1. Thread per agent
2. uint16 prefix for all packets to designate what message to **try** and deserialize
3. Yes, use opaque pointers to keep a pure C API
4. Yes store everything for debugging and auditing
5. Yes it will also act as a MCP host and provide all of the tool calling for gemini to use, including specialized `build-program` calls to simplifiy project building and running similar to vscode tasks and project runners
6. CMake
Additional note: this developement environement is a modern nixos based system and most if not all dependices should be accessed through a nix development flake. Place it at `nix/flake.nix` and note that `nix develop command ` should be used for running the program within the repo and for getting dependices setup during development.

## gemini3 flash response
I have updated 
specs/project.md
 with the specific details regarding the threading model, binary protocol, and MCP host capabilities. I've also created the 
nix/flake.nix
 file to manage our development dependencies.

With the high-level architecture documented, let's drill down into a few more implementation details:

1. Agent State Machine
Since we are using a thread-per-agent model, how should the agents communicate state changes back to the Task Manager?

Should we use a shared message queue (mutex-protected) where agents push updates?
Should the Task Manager block on a join or an event_wait, or should it periodically poll the agent states in the SQLite database?
2. Binary Serialization Library
For the "length-prefixed" protocol, do you want to write a custom minimal header-only serializer in C to avoid a large dependency, or should we use something like a lightweight JSON library (e.g., json-c or jsmn) and just wrap it in our binary frame?

3. Build-Program Tool
The build-program tool sounds like it will need to parse a local configuration (like a tasks.json or a gallium.yaml). How do you want this configuration structured? Example:

yaml
tasks:
  - name: build-web
    command: npm run build
  - name: compile-server
    command: make all
4. Workspace Operations
Since the server will be talking to Gemini and operating on local files, should we implement a sandbox or virtual filesystem layer, or should the agents have direct posix_open / fopen access to the workspace?

5. Client Protocol Dispatch
For the uint16 MessageID, would you like me to start drafting a protocol.h that defines the core command set (e.g., GALLIUM_CMD_SUBMIT_PROMPT, GALLIUM_EV_AGENT_STATUS)?

What should we tackle next?

## User response

1. Shared message queue keep it simple with mutexes
2. A lightweight json c library is fine
3. tasks.json, each task is exposed to the subtask agent as a tool, that example is fine, just translate it to json and each command is a shell string to perform on the task call
4. a lightweight sandbox is fine, we just mainly want to restrict them to the workspace folder, if they ruin things within the workspace that is fine as long as it doesn't leak.
5. No, only update the project.md

## gemini3 flash response

I've updated 
specs/project.md
 to reflect the refined architecture, including the mutex-protected shared message queue, json-c serialization, the tasks.json tool integration, and the workspace sandboxing.

We have a solid foundation now. To proceed with the actual implementation, I have a final set of architectural questions:

Logging & Debugging: Since we're storing everything in SQLite, do you want a live tail of agent logs to appear in the TUI client, or should the client only show high-level status updates?
Plugin System: For the "Specialized profiles" of agents, should these be statically compiled into the server, or are you looking for a more dynamic "plugin" or "scripting" (e.g., Lua/Python) system for defining agent behavior?
Bootstrap Path: Are you comfortable starting with the Server first (networking + SQLite state machine) and using simple curl or a basic client to test, or would you like to start with the TUI Client and the protocol definition?
WebSocket Library: I've included libwebsockets in the Nix flake. It's the industry standard for C, but it can be quite verbose. Are you okay with its complexity, or would you prefer a wrapper around it to keep the server code cleaner?
Once we decide the bootstrap path, I can start generating the directory structure (e.g., src/server, src/common, src/client) and the initial CMakeLists.txt.

## User response 

1. ability to toggle into a 'waterfall' view of all agent event logs
2. for now staticly compiled into the project with embeded strings in the c code for now
3. skip thinking about the building order, we only want to define what we're building not the how.
4. thats fine. 
Finish updating the document and lets call this done


## gemini3 flash response

I have finalized the 
specs/project.md
 document. It now includes:

The thread-per-agent model with mutex-protected message queues.
Statically compiled agent profiles with embedded instruction strings.
The TUI Client requirements, specifically the waterfall view for debugging concurrent agent logs.
The use of libwebsockets for networking and json-c for message serialization.
The tasks.json schema for external tool integration.
The lightweight sandbox approach for workspace security.
The 
nix/flake.nix
 is also ready to provide the necessary environment. The top-level architecture is set!













