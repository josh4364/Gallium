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
