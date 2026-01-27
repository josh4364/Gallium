## USER
We are working on @specs/project.md
Implement @specs/tasks/task-0-protocol.md
When needed view the documentation in @specs to clarify anything.
Declare the task done only when the builds of the server and clients both run. Do not leave the project in a broken state.

## GEMINI

I have implemented the communication protocol as specified in 
specs/tasks/task-0-protocol.md
.

Summary of Changes
Protocol Definition (
source/common/protocol.h
 & 
common.c
):
Defined the binary header structure (gallium_msg_header) with msg_id (16-bit) and payload_len (32-bit).
Implemented byte-order conversion functions (
gallium_header_hton
 and 
gallium_header_ntoh
) to ensure the protocol is cross-platform compatible (using Big-Endian network byte order).
Defined the initial GALLIUM_MSG_ID enum: MSG_INIT, MSG_TASK_UPDATE, MSG_EVENT_LOG, MSG_USER_INPUT, MSG_HEARTBEAT, and MSG_ERROR.
Implemented JSON serialization and parsing wrappers using json-c (
gallium_json_serialize
 and 
gallium_json_parse
).
Thread-Safe Message Queue (
source/common/queue.h
 & 
queue.c
):
Implemented a mutex-protected, condition-variable-driven circular buffer (
gallium_queue
) capable of holding up to 1024 messages.
Added support for both blocking (
push
/
pop
) and non-blocking (
try_push
/
try_pop
) operations, essential for the server's thread-per-agent architecture.
Build System & Verification:
Updated 
source/common/CMakeLists.txt
 to include the new source files and link against json-c and pthread.
Created 
source/common/test_protocol.c
, a comprehensive unit test suite that verifies JSON integrity, byte-order consistency, and queue thread safety.
Verified: All builds (Common, Server, and TUI Client) pass, and the protocol tests executed successfully within the nix develop environment.
Verification Results
bash
Testing JSON parsing and serialization...
Serialized: {"status":"ready","workspace":"\/path\/to\/project"}
JSON test passed!
Testing header byte order conversion...
Header byte order test passed!
Testing message queue...
Queue test passed!
All protocol tests passed!
The high-level task status in 
specs/high-level-tasks.md
 has been updated to reflect these completions.

