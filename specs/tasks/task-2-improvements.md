# Task: Communication Hub Improvements

## 1. Goal
Refactor and harden the network layer to reduce boilerplate, improve debugging visibility, and ensure robust lifecycle management.

## 2. Requirements

### 2.1 Developer Experience (DX) & Lifecycle
- [ ] **Process Reaper**: Update `build.sh` or create a `dev.sh` to automatically find and kill any existing `gallium-server` or `gallium-tui` processes before starting a build.
- [ ] **Address Reuse**: Set `LWS_SERVER_OPTION_ALLOW_LISTEN_SHARE` or similar socket options to ensure the port is released immediately on crash/restart.

### 2.2 Abstraction Layer
- [ ] **Network Wrapper API**: Move `libwebsockets` specific logic (like `LWS_PRE` and manual header packing) into a private header.
- [ ] **Common Message API**: Create a unified `gallium_net_send(wsi, msg_id, payload)` function that handles `HTON`, buffer allocation, and error logging in one call.

### 2.3 Dispatch System
- [ ] **Message Registry**: Replace the large `switch` statement in `LWS_CALLBACK_RECEIVE` with a function pointer table (dispatch table) mapped to `GALLIUM_MSG_ID`.
- [ ] **Handler Modularization**: Allow different server modules (DB, Task Manager) to register handlers for specific message types without modification of `network.c`.

### 2.4 Visibility & Debugging
- [ ] **Protocol Spy**: Implement a minimal CLI client (`gallium-spy`) that connects and prints all incoming/outgoing traffic in a human-readable format.
- [ ] **TUI System Log**: Add a hidden or togglable "Network Debug" pane in the TUI to show real-time connection status and last 5 error messages.

### 2.5 Reliability
- [ ] **Backoff Reconnection**: Replace the static 2-second reconnect timer with an exponential backoff (e.g., 1s, 2s, 4s, 8s... up to 30s).
- [ ] **Payload Validation**: Integrate `json-c` schema validation or basic key-checking at the network entry point to prevent malformed JSON from reaching business logic.

## 3. Verification Steps
1. **Stress Test**: Kill and restart the server repeatedly; verify the client reconnects reliably without manual intervention.
2. **Modular Dispatch**: Add a new dummy `MSG_ID` and handler in a separate file; verify it triggers without touching `network.c`.
3. **Spy Tool**: Run `gallium-spy` alongside a TUI session and verify all packets are captured and displayed.

## 4. Future Self Summary

I have refactored the network layer into a modular, robust subsystem. Here is what you need to know for future development:

### New Components
- **The Dispatcher (`dispatch.c/h`)**: Centralized message handling. Instead of editing `network.c`, use `gallium_dispatch_register(msg_id, handler_func)` to add new features. Handlers now receive a pre-parsed `json_object*` for immediate use.
- **Network Utilities (`net_utils.c/h`)**: Use `gallium_net_send(wsi, msg_id, json_str)` to send data. Metadata, byte-ordering, and LWS padding are handled automatically.
- **Gallium Spy**: A standalone tool located in `source/tools/spy`. Run it to see exactly what is flying over the wire. It's the primary way to debug protocol drifts.

### Key UX Improvements
- **Build & Kill**: `build.sh` now aggressively kills old server/client instances. No more port conflicts when iterating.
- **TUI Debug**: Press **'d'** in the TUI to toggle the network debug panel. It shows the connection state and the last 5 events, which is great for seeing if the exponential backoff (1s -> 30s) is working.
- **Fail-Fast JSON**: The dispatcher now validates JSON at the entry point. If a remote sends malformed data, it never reaches the business logic handlers.
