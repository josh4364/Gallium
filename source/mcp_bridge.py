import os
import sys
import json
import logging
import argparse
import mcp.server.fastmcp
from typing import List, Dict, Any, Optional

# Setup logging to stderr because stdout is used for MCP protocol
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("mcp_bridge")

# Add parent directory to sys.path to allow imports if needed
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from source import tools
    from source.graph_interpreter import GraphInterpreter
    from source.function_manager import FunctionManager
    from source.struct_manager import StructManager
except ImportError:
    import tools
    from graph_interpreter import GraphInterpreter
    from function_manager import FunctionManager
    from struct_manager import StructManager

class DynamicBridge:
    def __init__(self, root_dir: str = None):
        self.root_dir = os.path.abspath(root_dir) if root_dir else os.getcwd()
        os.chdir(self.root_dir)
        
        self.function_manager = FunctionManager(system_root=self.root_dir)
        self.struct_manager = StructManager(system_root=self.root_dir)
        self.interpreter = GraphInterpreter(
            function_manager=self.function_manager,
            struct_manager=self.struct_manager
        )
        
        self.server = mcp.server.fastmcp.FastMCP("Gallium Bridge")
        self.allowed_tools = None

    def register_builtin_tools(self):
        """Registers the standard filesystem and utility tools."""
        
        def check_allowed(name):
            if self.allowed_tools and name not in self.allowed_tools:
                return False
            return True

        if check_allowed("list_dir"):
            @self.server.tool()
            def list_dir(directory_path: str) -> str:
                """List the contents of a directory."""
                try:
                    # Resolve relative paths relative to current bridge root
                    results = tools.list_dir(directory_path)
                    return str(results)
                except Exception as e:
                    return f"Error: {e}"

        if check_allowed("find_by_name"):
            @self.server.tool()
            def find_by_name(search_directory: str, pattern: str) -> str:
                """Search for files and subdirectories."""
                try:
                    results = tools.find_by_name(search_directory, pattern)
                    return str(results)
                except Exception as e:
                    return f"Error: {e}"

        if check_allowed("grep_search"):
            @self.server.tool()
            def grep_search(search_path: str, query: str) -> str:
                """Use ripgrep to find matches."""
                try:
                    results = tools.grep_search(search_path, query)
                    return str(results)
                except Exception as e:
                    return f"Error: {e}"

        if check_allowed("view_file"):
            @self.server.tool()
            def view_file(absolute_path: str) -> str:
                """View the contents of a file."""
                try:
                    return tools.view_file(absolute_path)
                except Exception as e:
                    return f"Error: {e}"

        if check_allowed("replace_file_content"):
            @self.server.tool()
            def replace_file_content(target_file: str, start_line: int, end_line: int, 
                                     target_content: str, replacement_content: str) -> str:
                """Replace a contiguous block of text in a file."""
                try:
                    return tools.replace_file_content(target_file, start_line, end_line, target_content, replacement_content)
                except Exception as e:
                    return f"Error: {e}"

        if check_allowed("calculate"):
            @self.server.tool()
            def calculate(expression: str) -> str:
                """Calculate a mathematical expression."""
                return tools.calculate(expression)

        if check_allowed("run_command"):
            @self.server.tool()
            def run_command(command_line: str, cwd: str) -> str:
                """Run a shell command."""
                try:
                    return tools.run_command(command_line, cwd)
                except Exception as e:
                    return f"Error: {e}"

        # Goal management tools
        def check_allowed(name):
            if self.allowed_tools and name not in self.allowed_tools:
                return False
            return True

        if check_allowed("add_high_level_goal"):
            @self.server.tool()
            def add_high_level_goal(name: str) -> str:
                """Adds a new high-level conceptual chunk to the project plan."""
                return tools.add_high_level_goal(name)

        if check_allowed("list_high_level_goals"):
            @self.server.tool()
            def list_high_level_goals() -> str:
                """Returns the current list of high-level goals."""
                return tools.list_high_level_goals()

        if check_allowed("remove_high_level_goal"):
            @self.server.tool()
            def remove_high_level_goal(goal_id: int) -> str:
                """Removes a high-level goal by its ID number."""
                return tools.remove_high_level_goal(goal_id)

        if check_allowed("finished_editing_goals"):
            @self.server.tool()
            def finished_editing_goals() -> str:
                """Indicates that you have completed organizing the high-level chunks."""
                return tools.finished_editing_goals()

        if check_allowed("add_task"):
            @self.server.tool()
            def add_task(name: str) -> str:
                """Adds a new functional task to the current conceptual chunk."""
                return tools.add_task(name)

        if check_allowed("list_tasks"):
            @self.server.tool()
            def list_tasks() -> str:
                """Returns the current list of functional tasks for the active chunk."""
                return tools.list_tasks()

        if check_allowed("remove_task"):
            @self.server.tool()
            def remove_task(task_id: int) -> str:
                """Removes a functional task by its ID number."""
                return tools.remove_task(task_id)

        if check_allowed("finished_sequencing"):
            @self.server.tool()
            def finished_sequencing() -> str:
                """Indicates that you have finished breaking the conceptual chunk into tasks."""
                return tools.finished_sequencing()

        if check_allowed("add_subtask"):
            @self.server.tool()
            def add_subtask(name: str) -> str:
                """Adds a new atomic '5-minute' subtask to the current functional task."""
                return tools.add_subtask(name)

        if check_allowed("list_subtasks"):
            @self.server.tool()
            def list_subtasks() -> str:
                """Returns the current list of atomic subtasks for the active task."""
                return tools.list_subtasks()

        if check_allowed("remove_subtask"):
            @self.server.tool()
            def remove_subtask(subtask_id: int) -> str:
                """Removes an atomic subtask by its ID number."""
                return tools.remove_subtask(subtask_id)

        if check_allowed("finished_decoding"):
            @self.server.tool()
            def finished_decoding() -> str:
                """Indicates that you have finished breaking the task into atomic actions."""
                return tools.finished_decoding()

    def register_dynamic_tools(self, json_path: str):
        """Loads and registers graph-based tools from a JSON definition file."""
        if not os.path.exists(json_path):
            logger.warning(f"Dynamic tools file not found: {json_path}")
            return

        try:
            with open(json_path, 'r') as f:
                dynamic_tools = json.load(f)
            
            if not isinstance(dynamic_tools, list):
                logger.error("Dynamic tools JSON must be a list.")
                return

            for tool_def in dynamic_tools:
                self._register_single_dynamic_tool(tool_def)
                
        except Exception as e:
            logger.error(f"Failed to load dynamic tools: {e}")

    def _register_single_dynamic_tool(self, tool_def: Dict[str, Any]):
        """Creates a wrapper function for a single dynamic tool and registers it."""
        func_id = tool_def['id']
        name = tool_def['name']
        description = tool_def.get('description', '')
        args_deflist = tool_def.get('args', [])

        # Sanitized name for Python function (though FastMCP uses the provided 'name' usually)
        # FastMCP's @server.tool(name=...) or add_tool(name=...) can be used.
        
        # We need to construct a function with appropriate signature for FastMCP introspection
        # FastMCP uses TypeHints.
        
        arg_names = [a['name'] for a in args_deflist]
        
        def tool_wrapper(**kwargs):
            # Capture arguments from kwargs (FastMCP will pass them based on signature)
            logger.info(f"Dynamic Tool Called: {name} ({func_id}) with {kwargs}")
            try:
                return self.interpreter._tool_runner(func_id, kwargs)
            except Exception as e:
                logger.error(f"Error in dynamic tool {name}: {e}")
                return f"Error executing graph tool: {e}"

        # To give it a proper signature for FastMCP, we can use a trick:
        # Construct a dynamic function using exec or modify __annotations__
        
        # Mapping types
        py_annotations = {}
        for arg in args_deflist:
            graph_type = arg.get('type', 'string')
            py_annotations[arg['name']] = self._map_type(graph_type)
        
        tool_wrapper.__annotations__ = py_annotations
        tool_wrapper.__doc__ = description
        
        # Consistent sanitization with graph_interpreter
        py_name = name.replace(" ", "_").replace("-", "_")
        py_name = "".join(c for c in py_name if c.isalnum() or c == '_')
        tool_wrapper.__name__ = py_name

        # Register with FastMCP
        # Whitelist check (flexible)
        if self.allowed_tools:
            # Check original name, underscores name, and name with spaces removed
            slug = name.replace(" ", "").replace("-", "").lower()
            whitelist_slugs = {t.replace(" ", "").replace("_", "").replace("-", "").lower() for t in self.allowed_tools}
            
            if name not in self.allowed_tools and py_name not in self.allowed_tools and slug not in whitelist_slugs:
                logger.info(f"Skipping whitelisted tool: {name}")
                return

        # Use the sanitized python-safe name for the tool registration to ensure compatibility
        self.server.add_tool(tool_wrapper, name=py_name, description=description)
        logger.info(f"Registered Dynamic Tool: {py_name} (original='{name}')")

    def _map_type(self, graph_type: str):
        gt = graph_type.lower()
        if 'number' in gt: return float
        if 'boolean' in gt or 'bool' in gt: return bool
        if 'list' in gt: return list
        if 'map' in gt or 'dict' in gt: return dict
        return str

    def filter_tools(self, tools_list: List[str]):
        """Sets a whitelist for tools."""
        self.allowed_tools = set(tools_list)
        # FastMCP doesn't have a clean way to remove tools after they are added via decorators
        # So we should ideally filter BEFORE adding.
        # But for simplicity in this bridge, we'll just check allowed_tools in register logic.

    def run(self):
        self.server.run()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gallium MCP Bridge")
    parser.add_argument("--root", help="Set the workspace root directory")
    parser.add_argument("--tools", help="Comma-separated list of tools to expose (default: all)")
    parser.add_argument("--dynamic-tools", help="Path to JSON file with dynamic tool definitions")
    
    args = parser.parse_args()
    
    bridge = DynamicBridge(root_dir=args.root)
    
    if args.tools:
        bridge.filter_tools(args.tools.split(","))
        
    bridge.register_builtin_tools()
    
    if args.dynamic_tools:
        bridge.register_dynamic_tools(args.dynamic_tools)
        
    bridge.run()
