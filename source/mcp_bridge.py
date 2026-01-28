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

if __name__ == "__main__":
    # fastmcp run method handles stdio by default when no arguments provided? 
    # Or strict stdio required? 
    # mcp.server.fastmcp.FastMCP.run() defaults to stdio if no transport specified?
    # Let's check docs or usage. Usually `server.run(transport='stdio')`.
    server.run()
