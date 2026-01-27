## USER

* We are working on @specs/project.md
* Implement @specs/tasks/task-2-comm-hub.md
* When needed view the documentation in @specs to clarify anything.
* Declare the task done only when the builds of the server and clients both run. 
* Do not leave the project in a broken state.
* This development platform is hosted on NixOS and a development flake is used for all dependicy gathering.
* The flake is located at `./flake.nix`
* Enter the nix develop shell with `nix develop --command`
* You can build the project with `nix develop --command ./build.sh`
* To run the client: `nix develop --command ./build/bin/client/gallium-tui`
* To run the server: `nix develop --command ./build/bin/server/gallium-server`

## GEMINI

I have successfully implemented Task 2: Communication Hub for the Gallium project.

Accomplishments:
Server-side WebSocket Listener:
Implemented a robust WebSocket server in 
source/server/network.c
 using libwebsockets.
Configured the server to listen on port 7681 with a custom protocol (gallium-protocol).
Implemented header parsing for the 6-byte binary header (2-byte msg_id, 4-byte payload_len).
Integrated with the database layer to log connection events and incoming messages.
Added an echo-back mechanism for the GALLIUM_MSG_INIT message to verify bidirectional communication.
Client-side WebSocket Connector:
Implemented a WebSocket client in 
source/client/network.c
 that connects to the server.
Added reconnection logic with a periodic retry mechanism if the connection is lost or the server is unavailable.
Integrated the network loop into the TUI client in 
source/client/main.c
, ensuring it runs concurrently with the notcurses event loop.
Implemented a message queue to handle outgoing messages asynchronously.
Frame Dispatcher & Protocol:
Verified the binary protocol (Host/Network byte order conversion) for interoperability.
Verified that JSON payloads are correctly transmitted and received.
Heartbeat & Status:
Added a periodic heartbeat (every 10 seconds) from the client to the server to maintain connection health.
Implemented a real-time Online/Offline status indicator in the TUI client based on the connection state.
Verification:
Builds: Both gallium-server and gallium-tui build successfully using the provided Nix environment.
Connectivity: Verified using a test sequence where the client automatically reconnects once the server starts, performs a handshake, and receives an acknowledgment.
Data Persistence: Connection events and message metadata are successfully logged into the events table in 
db/project.db
.
The project is now in a stable state with real-time bidirectional communication established between the server and the TUI client.


## USER
Generate a list of bottlenecks that slowed down development and debugging.
What would make things easier and less error prone in the future?


## GEMINI

During the implementation of the Communication Hub, several technical and workflow bottlenecks emerged. Below is a breakdown of what slowed us down and how we can make the development of future modules (like the TUI Layout or Sandbox Runner) more efficient.

1. Bottlenecks in Development & Debugging
libwebsockets Boilerplate & Nuances:
The callback-based architecture is powerful but verbose. Managing the lifecycle of wsi (websocket instances), manual buffer padding (LWS_PRE), and protocol selection strings led to several "silent failure" moments.
Loop Synchronization:
Integrating the libwebsockets service loop with the notcurses TUI loop required fine-tuning. Initial attempts either blocked the TUI or burned 100% CPU. Finding the right nanosleep and non-blocking input balance was a trial-and-error process.
Zombie Processes (Port Binding):
When the server crashed or was terminated improperly, the port (7681) often remained "in use" by a ghost process. This required manual ps and kill commands, which interrupted the "code-build-test" flow.
Asynchronous Debugging Visibility:
Tracing a message from Client Send -> Server Receive -> Database Log -> Server Echo -> Client Receive is difficult when logs are split across two terminals and a database file. We spent time adding/removing debug prints to confirm which side was failing.
Protocol Header Sensitivity:
The custom 6-byte binary header is fragile. Even a 1-byte offset in either the client or server code resulted in corrupted payloads or the server disconnecting the client for "protocol violations."
2. Future Improvements for Ease & Reliability
A. Unified "Gallium Link" Wrapper
Instead of calling libwebsockets directly in every module, we should create a higher-level internal API.

Goal: Hide LWS_PRE, header serialization, and byte-order conversion.
Benefit: If we decide to switch from WebSockets to ZMQ or raw Unix Sockets later, we only change it in one place.
B. Developer Tooling: Protocol Inspector
A simple CLI tool (e.g., gallium-spy) that connects to the server and prints a human-readable stream of all packets.

Goal: Ability to see JSON payloads and msg_ids in real-time without having the TUI running.
Benefit: Decouples network debugging from TUI debugging.
C. Build-System Lifecycle Management
Our build.sh is a good start, but we could benefit from a "Dev Mode" script.

Improvement: A script that automatically finds and kills any gallium-server or gallium-tui instances before rebuilding and relaunching.
Benefit: Eliminates the "Address already in use" bottleneck.
D. Centralized "Event Log" Component in TUI
Currently, the client only shows a status indicator.

Improvement: Dedicate a small portion of the TUI (or a togglable window) to a raw "system log" that displays the last 5-10 network events/errors.
Benefit: Allows the programmer to see why a connection dropped without switching back to the terminal output.
E. Structured Handlers (Dispatch Tables)
As the number of GALLIUM_MSG_IDs grows, the switch statements in 
network.c
 will become unmanageable.

Improvement: Implement a registry where other parts of the system can "subscribe" to certain message IDs with a callback function.
Benefit: Keeps the network code focused on transport, while move the logic (e.g., updating a task) into the appropriate manager files.


## USER
generate **only** a `task-2-improvements.md` in `specs/tasks/` to document these changes in a task list form that we can implement in the future

## GEMINI
I've created the 
task-2-improvements.md
 file in specs/tasks/. This document outlines the refactoring and hardening steps needed to address the bottlenecks we encountered during the initial implementation of the Communication Hub.

You can find the new task list at: specs/tasks/task-2-improvements.md






