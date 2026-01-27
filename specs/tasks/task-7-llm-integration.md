# Task: LLM Integration Layer

## 1. Goal
Integrate external and local LLM backends to provide the intelligence for Gallium agents.

## 2. Requirements

### 2.1 Gemini API Client
- **Action**: ~~Implement HTTP requests to the Gemini API in `source/server/llm_gemini.c`. (Completed)~~
- **Backoff**: ~~Implement exponential backoff for `429 Too Many Requests` errors. (Completed)~~

### 2.2 Local Llama.cpp Support (Optional/Planned)
- **Action**: ~~Create an Opaque pointer interface for `llama.cpp`. (Stub Implemented)~~
- **Interface**: ~~`llm_local_init()`, `llm_local_generate()`. (Stub Implemented)~~

### 2.3 MCP Host Implementation
- **Action**: ~~Implement the MCP (Model Context Protocol) host logic in the server. (Stub Implemented)~~
- **Functionality**: ~~Allow agents to discover and call tools provided by external MCP servers. (Stub Implemented)~~

### 2.4 Context Monitoring
- **Action**: ~~Track token usage for every prompt/response. (Implemented)~~
- **Requirement**: Stream "Context Usage %" to the TUI periodically.

## 3. Verification Steps
1. **API Key Test**: ~~Load a key from `keys.json` and successfully perform a "Hello" prompt to Gemini. (Verified)~~
2. **Token tracking**: ~~Verify the "UsageTokens" are correctly logged in the `llm_logs` table. (Verified)~~

## 4. Implementation Summary
**To Future Self:**
This task successfully laid the groundwork for Gallium's intelligence layer. I've implemented a robust `llm_gemini` client using `libcurl` and `json-c` that handles HTTPS requests to Google's Gemini API. It includes automatic exponential backoff for rate limiting, ensuring we don't crash on `429` errors.

To keep things flexible, I avoided hardcoding the system prompt structure, opting to prepend "System: ..." to the user prompt, ensuring broad compatibility with different Gemini model versions (tested with `gemini-1.5-flash`). I've also hooked this into `db_manager`, so every single prompt and response token usage is logged to the `llm_logs` table for future auditing or cost analysis.

For `llama.cpp` and MCP support, I've created clean opaque-pointer interfaces and stubs (`llm_local.c`, `mcp_host.c`) so the server builds and runs, but the heavy lifting there is deferred. The system is now ready for the agents to start actually "thinking".

