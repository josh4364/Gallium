import os
import sys
import mcp.server.fastmcp
try:
    from source import tools
except ImportError:
    import tools

# Initialize FastMCP server
server = mcp.server.fastmcp.FastMCP("Gallium Bridge")

# Register tools from source.tools
# We manually wrap them to ensure signatures are correctly introspected by FastMCP

@server.tool()
def list_dir(directory_path: str) -> str:
    """List the contents of a directory."""
    try:
        abs_path = os.path.abspath(directory_path)
        results = tools.list_dir(abs_path)
        return str(results)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
def find_by_name(search_directory: str, pattern: str) -> str:
    """Search for files and subdirectories using fd."""
    try:
        abs_path = os.path.abspath(search_directory)
        results = tools.find_by_name(abs_path, pattern)
        return str(results)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
def grep_search(search_path: str, query: str) -> str:
    """Use ripgrep to find matches."""
    try:
        abs_path = os.path.abspath(search_path)
        results = tools.grep_search(abs_path, query)
        return str(results)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
def view_file(absolute_path: str) -> str:
    """View the contents of a file."""
    try:
        abs_path = os.path.abspath(absolute_path)
        return tools.view_file(abs_path)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
def replace_file_content(target_file: str, start_line: int, end_line: int, 
                         target_content: str, replacement_content: str) -> str:
    """Replace a contiguous block of text in a file."""
    try:
        abs_path = os.path.abspath(target_file)
        return tools.replace_file_content(abs_path, start_line, end_line, target_content, replacement_content)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
def calculate(expression: str) -> str:
    """Calculate a mathematical expression."""
    return tools.calculate(expression)

@server.tool()
def run_command(command_line: str, cwd: str) -> str:
    """Run a shell command."""
    try:
        return tools.run_command(command_line, cwd)
    except Exception as e:
        return f"Error: {e}"

# Add other tools as needed

# Add other tools as needed

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Gallium MCP Bridge")
    parser.add_argument("--root", help="Set the workspace root directory")
    parser.add_argument("--tools", help="Comma-separated list of tools to expose (default: all)")
    
    args = parser.parse_args()
    
    if args.root:
        try:
            os.chdir(args.root)
            # tools.py uses os.getcwd() for sandboxing, so this is sufficient.
        except Exception as e:
            print(f"Error changing directory to {args.root}: {e}", file=sys.stderr)
            sys.exit(1)
            
    # Filter tools if requested
    # Note: FastMCP decorators register at definition time.
    # To filter, we might need to remove them from `server` object if possible,
    # or creates a new server instance.
    # FastMCP stores tools in `server._tool_manager._tools`.
    # Let's inspect capabilities.
    # Actually, simpler: if args.tools is present, we only keep those matching.
    
    if args.tools:
        allowed_tools = args.tools.split(",")
        try:
            # Access internal registry (implementation detail of FastMCP, but typical)
            # Or just rely on the fact we registered all, and unregister others?
            # FastMCP doesn't seem to have valid remove_tool public API easily documented here.
            # But we can check `server_tools`.
            # Let's use a workaround: construct a new server if needed, or modify private dicts.
            # Assuming `server._tool_manager._tools` exists (based on likely library structure).
            # If not, we might not be able to filter easily without changing how we register.
            # Re-registering only allowed tools would require not using decorators initially.
            # Given we used decorators, we can try to filter.
            
            # Check if internal list is accessible
            if hasattr(server, '_tool_manager') and hasattr(server._tool_manager, '_tools'):
                 all_tools = list(server._tool_manager._tools.keys())
                 for t in all_tools:
                     if t not in allowed_tools:
                         del server._tool_manager._tools[t]
            # Fallback for different mcp versions: `server.tools` might be a dict
            elif hasattr(server, 'tools') and isinstance(server.tools, dict): 
                 all_tools = list(server.tools.keys())
                 for t in all_tools:
                     if t not in allowed_tools:
                         del server.tools[t]
                         
        except Exception as e:
            print(f"Warning: Could not filter tools: {e}", file=sys.stderr)
            
    server.run()
