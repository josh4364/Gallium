# Task: LLM Integration Layer

## 1. Goal
Integrate external and local LLM backends to provide the intelligence for Gallium agents.

## 2. Requirements

### 2.1 Gemini API Client
- **Action**: Implement HTTP requests to the Gemini API in `source/server/llm_gemini.c`.
- **Backoff**: Implement exponential backoff for `429 Too Many Requests` errors.

### 2.2 Local Llama.cpp Support (Optional/Planned)
- **Action**: Create an Opaque pointer interface for `llama.cpp`.
- **Interface**: `llm_local_init()`, `llm_local_generate()`.

### 2.3 MCP Host Implementation
- **Action**: Implement the MCP (Model Context Protocol) host logic in the server.
- **Functionality**: Allow agents to discover and call tools provided by external MCP servers.

### 2.4 Context Monitoring
- **Action**: Track token usage for every prompt/response.
- **Requirement**: Stream "Context Usage %" to the TUI periodically.

## 3. Verification Steps
1. **API Key Test**: Load a key from `keys.json` and successfully perform a "Hello" prompt to Gemini.
2. **Token tracking**: Verify the "UsageTokens" are correctly logged in the `llm_logs` table.
