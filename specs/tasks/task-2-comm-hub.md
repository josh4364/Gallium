# Task: Communication Hub

## 1. Goal
Establish bidirectional real-time communication between the Gallium server and clients using `libwebsockets`.

## 2. Requirements

### 2.1 Server WebSocket Listener
- **Action**: Implement the `libwebsockets` event loop in `source/server/network.c`.
- **Configuration**: Listen on a configurable port (default 7681).
- **Callback**: Handle `LWS_CALLBACK_ESTABLISHED` and `LWS_CALLBACK_RECEIVE`.

### 2.2 Client WebSocket Connector
- **Action**: Implement the connection logic in `source/client/network.c`.
- **Requirement**: Support reconnection with exponential backoff if the server is down.

### 2.3 Frame Dispatcher
- **Action**: Implement the dispatcher logic.
- **Logic**:
    1. Read 6-byte header.
    2. Extract `payload_len`.
    3. Read `payload_len` bytes.
    4. Dispatch to handler based on `msg_id`.

### 2.4 Heartbeat
- **Action**: Implement a periodic ping/pong to detect stale connections and maintain the TUI's "online" status indicator.

## 3. Verification Steps
1. **Connectivity Test**: Run `gallium-server` and `gallium-tui`. Verify logs show "Client Connected".
2. **Message Round-trip**: Send a "Hello" JSON payload from client to server and have the server echo it back.
