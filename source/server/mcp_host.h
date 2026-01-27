#ifndef GALLIUM_MCP_HOST_H
#define GALLIUM_MCP_HOST_H

/**
 * @brief Initialize the MCP host subsystem.
 */
void mcp_init(void);

/**
 * @brief List available tools from a specific server (or all if NULL).
 * @param server_name The name of the MCP server, or NULL.
 * @return JSON string of tools.
 */
char* mcp_list_tools(const char *server_name);

/**
 * @brief Execute a tool.
 * @param server_name The MCP server name.
 * @param tool_name The tool name.
 * @param args_json The arguments in JSON format.
 * @return JSON string of the result.
 */
char* mcp_call_tool(const char *server_name, const char *tool_name, const char *args_json);

#endif // GALLIUM_MCP_HOST_H
