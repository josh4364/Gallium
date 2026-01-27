# Task: Protocol Definition

## 1. Goal
Define and implement the shared communication protocol between the Gallium server and clients in the `gallium_common` library.

## 2. Requirements

### 2.1 Binary Header Format
- **Action**: Implement `gallium_msg_header` in `source/common/protocol.h`.
- **Fields**:
    - `uint16_t msg_id`: Unique identifier for the message type.
    - `uint32_t payload_len`: Length of the following JSON payload.
- **Byte Order**: Ensure network byte order (big-endian) for cross-platform compatibility.

### 2.2 JSON Payload Serialization
- **Action**: Integrate `json-c` in the common library.
- **Utility Functions**:
    - `gallium_json_parse()`: Safely parse incoming buffers.
    - `gallium_json_serialize()`: Convert structured data to UTF-8 strings for transmission.

### 2.3 Message ID Definitions
- **Action**: Define an enum for `GALLIUM_MSG_ID`.
- **Initial IDs**:
    - `MSG_INIT`: Handshake and workspace context.
    - `MSG_TASK_UPDATE`: Status changes for tasks.
    - `MSG_EVENT_LOG`: Granular agent logs.
    - `MSG_USER_INPUT`: Request for user validation/input.

### 2.4 Shared Message Queue
- **Action**: Implement a mutex-protected circular buffer or queue in `source/common/`.
- **Purpose**: Facilitate the thread-per-agent model's communication with the main networking loop.

## 3. Verification Steps
1. **Unit Test**: Create a small `test_protocol.c` that serializes a header and JSON payload, then deserializes it to verify integrity.
2. **Build**: Ensure `gallium_common` builds as a static library.
