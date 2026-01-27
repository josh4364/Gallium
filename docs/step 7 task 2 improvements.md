## USER

* We are working on @specs/project.md
* Implement @specs/tasks/task-2-improvements.md
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

I have implemented the improvements for the Communication Hub as specified in 
specs/tasks/task-2-improvements.md
.

Key Accomplishments:
1. Developer Experience (DX) & Lifecycle
Process Reaper: Updated 
build.sh
 to automatically find and kill any existing gallium-server or gallium-tui processes before starting a build, preventing "address already in use" errors during development.
Address Reuse: Enabled LWS_SERVER_OPTION_ALLOW_LISTEN_SHARE in the server's network initialization to ensure the listening port is released immediately upon restart.
2. Abstraction & Common Message API
Network Wrapper: Created 
source/common/network_internal.h
 to abstract libwebsockets specific details like LWS_PRE padding and manual header packing.
Unified Send API: Implemented 
gallium_net_send(wsi, msg_id, payload)
 in 
source/common/net_utils.c
, providing a single-call interface for sending messages that handles network byte order and buffer management.
3. Dispatch System
Message Registry: Replaced the monolithic switch statement in network callbacks with a modular function pointer dispatch table (
dispatch.c
).
Modular Handlers: Modules can now register their own handlers for specific message IDs using 
gallium_dispatch_register
, allowing the network layer to remain clean and agnostic of business logic.
4. Visibility & Debugging
Protocol Spy: Developed gallium-spy, a minimal CLI tool that connects to the server and prints all incoming traffic in a human-readable format for real-time protocol analysis.
TUI Network Debug: Added a toggleable "Network Debug" pane in the TUI (accessible via the 'd' key) which displays the current connection status and the last five network events/errors.
5. Reliability
Exponential Backoff: Replaced the static reconnection timer with an exponential backoff strategy (1s, 2s, 4s, 8s, up to 30s) to reduce server load during outages.
Payload Validation: Integrated json-c parsing directly into the dispatch entry point. Incoming messages with malformed JSON are now rejected before reaching the handler logic.
Verification:
Confirmed that both the server and client build successfully using the Nix development environment.
Verified the process reaper kills stale instances before new builds.
Verified the spy tool correctly captures and displays handshake messages.
Verified the TUI debug pane correctly reflects online/offline transitions and logs.

## USER

Create a short sumamry of the changes and new things available addressed to your future self as a new section at the bottom of @task-2-improvements.md 

## GEMINI

I've appended the Future Self Summary to the bottom of 
specs/tasks/task-2-improvements.md
. This section highlights the new modular dispatcher, the unified sending API, the gallium-spy tool, and the improved development experience features like the process reaper and TUI debug pane.

The project is in a stable, building state with all requested refactors and visibility tools implemented. You can now toggle the network debug panel in the TUI using the 'd' key and use the spy tool to monitor protocol traffic.


