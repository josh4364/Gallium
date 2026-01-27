#include "mcp_host.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void mcp_init(void) {
    fprintf(stderr, "[MCP] Initialized MCP Host.\n");
}

char* mcp_list_tools(const char *server_name) {
    // STUB: Return an empty list or mock list
    if (server_name && strcmp(server_name, "mock") == 0) {
        return strdup("[{\"name\": \"mock_tool\", \"description\": \"A mock tool\"}]");
    }
    return strdup("[]");
}

char* mcp_call_tool(const char *server_name, const char *tool_name, const char *args_json) {
    // STUB: Always return success for now
    fprintf(stderr, "[MCP] Calling %s:%s with %s\n", 
            server_name ? server_name : "default", tool_name, args_json);
            
    return strdup("{\"result\": \"success\", \"output\": \"Tool execution mocked.\"}");
}
