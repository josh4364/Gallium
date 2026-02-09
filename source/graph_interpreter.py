import logging
import subprocess
from source.blackboard import Blackboard
from source.schemas import Event
import json
from source.local_llm import LocalLlamaClient
from source.gemini_llm import GeminiClient
from source.openai_llm import OpenAIClient
from source.claude_llm import ClaudeClient
import requests
from source import tools

logger = logging.getLogger("GraphInterpreter")

class GraphInterpreter:
    def __init__(self, simulation_state=None, function_manager=None, struct_manager=None):
        self.nodes = {}
        self.connections = []
        self.context = {} 
        self.sim_state = simulation_state
        self.function_manager = function_manager
        self.struct_manager = struct_manager
        self.blackboard = Blackboard()
        self.output_cache = {} # nodeId -> outputId -> value
        self.call_stack = [] # Stack of parent states for recursion
        self.return_stack = [] # Stack of return values from function calls

        self.thread_context = None # ID of the thread currently being evaluated
        
        # Builtin Python Tool Definitions
        self.builtin_python_tool_defs = [
            {"id": "builtin_list_dir", "name": "list_dir", "description": "List the contents of a directory. Returns list of items.", 
             "args": [{"name": "directory_path", "type": "string"}]},
            {"id": "builtin_find_by_name", "name": "find_by_name", "description": "Search for files and subdirectories by name pattern using fd.", 
             "args": [
                 {"name": "search_directory", "type": "string"}, 
                 {"name": "pattern", "type": "string"},
                 {"name": "excludes", "type": "list", "optional": True},
                 {"name": "extensions", "type": "list", "optional": True},
                 {"name": "full_path", "type": "boolean", "optional": True},
                 {"name": "max_depth", "type": "number", "optional": True},
                 {"name": "type_filter", "type": "string", "optional": True}
             ]},
            {"id": "builtin_grep_search", "name": "grep_search", "description": "Search for text within files using ripgrep.", 
             "args": [
                 {"name": "search_path", "type": "string"}, 
                 {"name": "query", "type": "string"},
                 {"name": "case_insensitive", "type": "boolean", "optional": True},
                 {"name": "includes", "type": "list", "optional": True},
                 {"name": "is_regex", "type": "boolean", "optional": True},
                 {"name": "match_per_line", "type": "boolean", "optional": True}
             ]},
            {"id": "builtin_view_file", "name": "view_file", "description": "View the contents of a file with line numbers.", 
             "args": [{"name": "absolute_path", "type": "string"}, {"name": "start_line", "type": "number", "optional": True}, {"name": "end_line", "type": "number", "optional": True}]},
            {"id": "builtin_read_file", "name": "read_file", "description": "Read the raw content of a file.", 
             "args": [{"name": "absolute_path", "type": "string"}]},
            {"id": "builtin_view_file_outline", "name": "view_file_outline", "description": "View classes and functions in a python file.", 
             "args": [{"name": "absolute_path", "type": "string"}, {"name": "item_offset", "type": "number", "optional": True}]},
            {"id": "builtin_view_code_item", "name": "view_code_item", "description": "View specific classes or functions by name in a file.", 
             "args": [{"name": "file_path", "type": "string"}, {"name": "node_paths", "type": "list"}]},
            {"id": "builtin_write_to_file", "name": "write_to_file", "description": "Write content to a file. Use overwrite=true to replace existing files.", 
             "args": [{"name": "target_file", "type": "string"}, {"name": "code_content", "type": "string"}, {"name": "overwrite", "type": "boolean", "optional": True}, {"name": "empty_file", "type": "boolean", "optional": True}]},
            {"id": "builtin_replace_file_content", "name": "replace_file_content", "description": "Replace a block of text in a file.", 
             "args": [
                 {"name": "target_file", "type": "string"}, 
                 {"name": "start_line", "type": "number"}, 
                 {"name": "end_line", "type": "number"}, 
                 {"name": "target_content", "type": "string"}, 
                 {"name": "replacement_content", "type": "string"},
                 {"name": "allow_multiple", "type": "boolean", "optional": True}
             ]},
            {"id": "builtin_multi_replace_file_content", "name": "multi_replace_file_content", "description": "Apply multiple replacements to a file. replacement_chunks is a list of {StartLine, EndLine, TargetContent, ReplacementContent, AllowMultiple}", 
             "args": [{"name": "target_file", "type": "string"}, {"name": "replacement_chunks", "type": "list"}]},
            {"id": "builtin_calculate", "name": "calculate", "description": "Execute a mathematical expression.", 
             "args": [{"name": "expression", "type": "string"}]},
            {"id": "builtin_run_command", "name": "run_command", "description": "Execute a shell command in the background.", 
             "args": [{"name": "command_line", "type": "string"}, {"name": "cwd", "type": "string"}, {"name": "safe_to_auto_run", "type": "boolean", "optional": True}, {"name": "wait_ms_before_async", "type": "number", "optional": True}]},
            {"id": "builtin_command_status", "name": "command_status", "description": "Check the status and output of a background command.", 
             "args": [{"name": "command_id", "type": "string"}, {"name": "output_character_count", "type": "number", "optional": True}, {"name": "wait_duration_seconds", "type": "number", "optional": True}]},
            
        ]


        # Initialize Handlers
        self.node_handlers = {}
        self._init_node_handlers()

    def _init_node_handlers(self):
        """Registers all node handlers."""
        # Flow Control
        self.node_handlers['start'] = self._handle_flow_passthrough
        self.node_handlers['function_input'] = self._handle_flow_passthrough
        self.node_handlers['function_return'] = self._handle_function_return
        self.node_handlers['function_call'] = self._handle_function_call
        self.node_handlers['condition'] = self._handle_condition
        self.node_handlers['match'] = self._handle_match
        self.node_handlers['action'] = self._handle_action
        
        # UI/System

        self.node_handlers['log_message'] = self._handle_log_message
        self.node_handlers['run_process'] = self._handle_run_process
        self.node_handlers['write_file'] = self._handle_write_file
        self.node_handlers['web_request'] = self._handle_web_request

        # Variables
        self.node_handlers['set_variable'] = self._handle_set_variable

        # Tier 1 / State Engine Nodes

        self.node_handlers['list_for_each'] = self._handle_list_for_each
        self.node_handlers['map_for_each'] = self._handle_map_for_each

        
        # Collections (Lists/Maps) - Side-effect nodes (Set/Modify)
        # Note: 'list_create', 'list_make' etc are purely value nodes handled in evaluate_output
        # But 'list_set', 'list_add' modify the list reference and flow.
        self.node_handlers['list_set'] = self._handle_list_set
        self.node_handlers['list_add'] = self._handle_list_add
        self.node_handlers['list_remove_at'] = self._handle_list_remove_at
        self.node_handlers['list_clear'] = self._handle_list_clear
        
        self.node_handlers['map_set'] = self._handle_map_set
        self.node_handlers['map_remove'] = self._handle_map_remove

        # Context
        self.node_handlers['set_context_top_level_goal'] = self._handle_set_context_goal
        self.node_handlers['set_context_agent_goal'] = self._handle_set_context_goal
        self.node_handlers['set_context_key_value'] = self._handle_set_context_key_value
        
        # Context Messages
        self.node_handlers['context_any_pending_messages'] = self._handle_context_any_pending_messages
        self.node_handlers['context_get_new_messages'] = self._handle_context_get_new_messages
        self.node_handlers['context_get_all_messages'] = self._handle_context_get_all_messages
        self.node_handlers['context_send_message'] = self._handle_context_send_message
        
        # LLM Chat Nodes
        self.node_handlers['create_llm_chat'] = self._handle_create_llm_chat
        self.node_handlers['send_llm_chat_message'] = self._handle_send_llm_chat_message
        self.node_handlers['ai_eval'] = self._handle_ai_eval

        # Casts
        self.node_handlers['try_cast_to_type'] = self._handle_try_cast_to_type
        self.node_handlers['list_try_cast'] = self._handle_try_cast_to_type
        self.node_handlers['map_try_cast'] = self._handle_try_cast_to_type
    def safe_graph_eval(self, graph_data, expected_input_types, input_values):
        """
        Executes the graph by providing input values. 
        Will only pass as many values as the graph has input ports for.
        """
        if not graph_data:
            return None
            
        graph_inputs = graph_data.get('inputs', [])
        
        # Build context from available inputs
        context = {}
        for i, graph_input in enumerate(graph_inputs):
            name_lower = graph_input['name'].lower()
            if 'tick' in name_lower and len(input_values) >= 2:
                # If we have at least 2 inputs (context, tick), and this port is for tick
                context[graph_input['name']] = input_values[1]
            elif i < len(input_values):
                # Standard mapping by index
                context[graph_input['name']] = input_values[i]
            
        # Execute
        self.execute(graph_data, context=context)
        
        # Return results if any
        if self.return_stack:
            return self.return_stack.pop()
        return None

    def execute(self, graph_data, context=None):
        """
        Executes the graph starting from the entry node.
        """
        if not graph_data:
            return



        self.nodes = {n['id']: n for n in graph_data.get('nodes', [])}
        self.connections = graph_data.get('connections', [])
        # Merge provided context with simulation state variables if any
        self.context = context or {}
        
        # Reset per-execution state
        self.output_cache = {}
        self.call_stack = []
        self.return_stack = []

        entry_node = self.find_entry_node()
        
        if not entry_node:
            logger.warning("No entry node (function_input or similar) found in graph.")
            return

        try:
            self.execute_node(entry_node)
        except Exception as e:
            logger.error(f"Graph execution failed: {e}", exc_info=True)
            if self.sim_state:
                self.sim_state._add_event(f"Graph Error: {e}", "error")

    def find_entry_node(self):
        for node in self.nodes.values():
            if node['type'] in ('start', 'function_input', 'entry'):
                return node
        return None

    def execute_node(self, node):
        if not node: return None

        node_type = node['type']
        handler = self.node_handlers.get(node_type)
        
        if handler:
            return handler(node)
        else:
            # Fallback for unknown nodes with standard exec_out
            return self.follow_flow(node, 'exec_out')

    # --- Node Handlers ---

    def _handle_flow_passthrough(self, node):
        return self.follow_flow(node, 'exec_out')



    def _handle_log_message(self, node):
        msg = self.get_input_value(node, 'message')
        if self.sim_state:
            self.sim_state._add_event(f"{msg}", "info")
        else:
            print(f"GRAPH LOG: {msg}")
        return self.follow_flow(node, 'exec_out')

    def _handle_set_variable(self, node):
        name = node.get('params', {}).get('name') or self.get_input_value(node, 'name')
        val = self.get_input_value(node, 'value')
        if name:
            self.context[name] = val
            logger.debug(f"Set Local Variable {name} = {val}")
        return self.follow_flow(node, 'exec_out')

    def _handle_function_return(self, node):
        # Gather all data inputs as return values
        returns = {}
        for input_port in node.get('inputs', []):
            if input_port['type'] != 'exec':
                val = self.get_input_value(node, input_port.get('key') or input_port['label'])
                returns[input_port['label']] = val
        
        self.return_stack.append(returns)
        return "STOP" # Signal to cease execution of this graph context

    def _handle_function_call(self, node):
        func_id = node.get('params', {}).get('functionId')
        if not func_id:
            raise Exception(f"Function Call node {node['id']} missing functionId")

        # Gather arguments
        args = {}
        for input_port in node.get('inputs', []):
            if input_port['type'] != 'exec':
                # Check if port is connected or has default value
                val = self.get_input_value(node, input_port.get('key') or input_port['label'])
                args[input_port['label']] = val

        # Execute sub-graph
        prev_stack_depth = len(self.return_stack)
        res = self.execute_function(func_id, args, caller_node_id=node['id'])
        if res == "SUSPEND": return "SUSPEND"
        
        # Extract results from return stack
        if len(self.return_stack) > prev_stack_depth:
            results = self.return_stack.pop()
            # Cache results for this node's output ports
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            for output_port in node.get('outputs', []):
                if output_port['type'] != 'exec':
                    label = output_port['label']
                    if label in results:
                        self.output_cache[node['id']][output_port['id']] = results[label]

        return self.follow_flow(node, 'exec_out')

    def _handle_condition(self, node):
        condition = self.get_input_value(node, 'condition')
        if bool(condition):
            return self.follow_flow(node, 'exec_true')
        else:
            return self.follow_flow(node, 'exec_false')

    def _handle_match(self, node):
        switch_val = self.get_input_value(node, 'value')
        
        # We need to find which case matches
        # Inputs are 'exec_in', 'value', 'case_0', 'case_1', ...
        # Outputs are 'exec_default', 'case_0', 'case_1', ... (wait, keys match)
        
        case_matched = False
        for inp in node.get('inputs', []):
            key = inp.get('key')
            if key and key.startswith('case_'):
                case_val = self.get_input_value(node, key)
                if switch_val == case_val:
                    # Found match!
                    case_matched = True
                    # The output port for this case has the same key
                    out_port = next((p for p in node.get('outputs', []) if p.get('key') == key), None)
                    if out_port:
                        return self.follow_flow(node, out_port['label'])
                    break
        
        if not case_matched:
            return self.follow_flow(node, 'Default')

    def _handle_action(self, node):
        msg = self.get_input_value(node, 'message')
        if self.sim_state:
            self.sim_state._add_event(f"Action: {msg}", "info")
        return self.follow_flow(node, 'exec_out')

    def _handle_list_set(self, node):
        lst = self.get_input_value(node, 'list')
        idx = int(self.get_input_value(node, 'index') or 0)
        val = self.get_input_value(node, 'value')
        if isinstance(lst, list) and 0 <= idx < len(lst):
            lst[idx] = val
        elif isinstance(lst, list) and idx == len(lst):
            lst.append(val)
            
        self._update_output_cache(node, 'list', lst)
        return self.follow_flow(node, 'exec_out')

    def _handle_list_add(self, node):
        lst = self.get_input_value(node, 'list')
        val = self.get_input_value(node, 'value')
        if isinstance(lst, list):
            lst.append(val)
        
        self._update_output_cache(node, 'list', lst)
        return self.follow_flow(node, 'exec_out')

    def _handle_list_remove_at(self, node):
        lst = self.get_input_value(node, 'list')
        idx = int(self.get_input_value(node, 'index') or 0)
        if isinstance(lst, list) and 0 <= idx < len(lst):
            lst.pop(idx)
        
        self._update_output_cache(node, 'list', lst)
        return self.follow_flow(node, 'exec_out')
    
    def _handle_list_clear(self, node):
        lst = self.get_input_value(node, 'list')
        if isinstance(lst, list):
            lst.clear()
        
        self._update_output_cache(node, 'list', lst)
        return self.follow_flow(node, 'exec_out')

    def _handle_map_set(self, node):
        map_obj = self.get_input_value(node, 'map')
        key = self.get_input_value(node, 'key')
        val = self.get_input_value(node, 'value')
        if isinstance(map_obj, dict):
            map_obj[key] = val
        
        self._update_output_cache(node, 'map', map_obj)
        return self.follow_flow(node, 'exec_out')

    def _handle_map_remove(self, node):
        map_obj = self.get_input_value(node, 'map')
        key = self.get_input_value(node, 'key')
        if isinstance(map_obj, dict) and key in map_obj:
            del map_obj[key]
        
        self._update_output_cache(node, 'map', map_obj)
        return self.follow_flow(node, 'exec_out')

    def _handle_run_process(self, node):
        program_name = self.get_input_value(node, 'program_name')
        arguments = self.get_input_value(node, 'arguments')
        timeout = self.get_input_value(node, 'timeout')
        
        output_str = ""
        
        if program_name:
            # Construct command string
            cmd = str(program_name)
            
            if isinstance(arguments, list):
                 for arg in arguments:
                     cmd += " " + str(arg)
            elif arguments:
                 cmd += " " + str(arguments)
            
            timeout_val = None
            try:
                if timeout is not None:
                    t = float(timeout)
                    if t > 0: timeout_val = t
            except:
                pass
            
            try:
                logger.info(f"Running subprocess: {cmd}")
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout_val)
                output_str = result.stdout
            except subprocess.TimeoutExpired:
                 output_str = "Error: Timeout Expired"
                 logger.warning(f"Process timeout: {cmd}")
            except Exception as e:
                 output_str = f"Error: {str(e)}"
                 logger.error(f"Process error: {e}")
        
        self._update_output_cache(node, 'output', output_str)
        if 'returncode' in locals() and 'result' in locals():
             self._update_output_cache(node, 'exit_code', result.returncode)
        elif 'result' in locals():
             self._update_output_cache(node, 'exit_code', result.returncode)
        else:
             self._update_output_cache(node, 'exit_code', -1)
             
        return self.follow_flow(node, 'exec_out')

    def _handle_write_file(self, node):
        path = self.get_input_value(node, 'path')
        content = self.get_input_value(node, 'content')
        
        try:
            # Call the tool function (it handles directory creation etc)
            tools.write_to_file(path, content, overwrite=True)
            msg = f"Successfully wrote to {path}"
            logger.info(msg)
            self._update_output_cache(node, 'result', msg)
        except Exception as e:
            err = f"Failed to write file: {e}"
            logger.error(err)
            self._update_output_cache(node, 'result', err)
            
        return self.follow_flow(node, 'exec_out')

    def _handle_web_request(self, node):
        url = self.get_input_value(node, 'url')
        method = self.get_input_value(node, 'method') or "GET"
        headers = self.get_input_value(node, 'headers')
        body = self.get_input_value(node, 'body')
        
        if not url:
            logger.warning("Web Request node missing URL")
            self._update_output_cache(node, 'response', "Error: Missing URL")
            self._update_output_cache(node, 'status_code', -1)
            return self.follow_flow(node, 'exec_out')

        try:
            # Ensure headers is a dict if it's not None
            request_headers = {}
            if isinstance(headers, dict):
                request_headers = {str(k): str(v) for k, v in headers.items()}
            
            logger.info(f"Sending {method} request to {url}")
            
            response = requests.request(
                method=method.upper(),
                url=url,
                headers=request_headers,
                data=body,
                timeout=30 # Default timeout
            )
            
            self._update_output_cache(node, 'response', response.text)
            self._update_output_cache(node, 'status_code', response.status_code)
            
        except Exception as e:
            logger.error(f"Web Request failed: {e}")
            self._update_output_cache(node, 'response', f"Error: {str(e)}")
            self._update_output_cache(node, 'status_code', -1)
            
        return self.follow_flow(node, 'exec_out')
    def _handle_list_for_each(self, node):
        """
        Iterates over a list. 
        Required Inputs: 'list' (List[Any])
        Outputs: 'item', 'index'
        Flows: 'exec_loop', 'exec_done'
        """
        collection = self.get_input_value(node, 'list')
        if not isinstance(collection, list):
            collection = []

        # We need to store the current index for this specific node ID in the current execution context.
        iter_key = f"__iter_{node['id']}_index"
        current_index = self.context.get(iter_key, 0)
        
        if current_index < len(collection):
            item = collection[current_index]
            
            # Update outputs
            self._update_output_cache(node, 'item', item)
            self._update_output_cache(node, 'index', current_index)
            
            # Increment for next time
            self.context[iter_key] = current_index + 1
            
            return self.follow_flow(node, 'exec_loop')
        else:
            # Reset index in case we loop back to this node entirely later
            self.context[iter_key] = 0
            return self.follow_flow(node, 'exec_done')

    def _handle_map_for_each(self, node):
        """
        Iterates over a map (dict). 
        Required Inputs: 'map' (Dict)
        Outputs: 'key', 'value'
        Flows: 'exec_loop', 'exec_done'
        """
        collection = self.get_input_value(node, 'map')
        if not isinstance(collection, dict):
            collection = {}

        iter_key = f"__iter_{node['id']}_index"
        current_index = self.context.get(iter_key, 0)
        
        keys = sorted(list(collection.keys()))
        
        if current_index < len(keys):
            key = keys[current_index]
            value = collection[key]
            
            # Update outputs
            self._update_output_cache(node, 'key', key)
            self._update_output_cache(node, 'value', value)
            
            # Increment for next time
            self.context[iter_key] = current_index + 1
            
            return self.follow_flow(node, 'exec_loop')
        else:
            # Reset index
            self.context[iter_key] = 0
            return self.follow_flow(node, 'exec_done')

    def _update_output_cache(self, node, port_key, value):
        if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
        out_port = next((p for p in node.get('outputs', []) if p.get('key') == port_key), None)
        if out_port:
            self.output_cache[node['id']][out_port['id']] = value

    # --- Context Handlers ---
    def _handle_set_context_goal(self, node):
        ctx = self.get_input_value(node, 'ctx')
        goal = self.get_input_value(node, 'goal')
        if isinstance(ctx, dict):
            if node['type'] == 'set_context_top_level_goal':
                ctx['goal'] = goal
            else:
                ctx['agent_goal'] = goal
        return self.follow_flow(node, 'exec_out')

    def _handle_set_context_key_value(self, node):
        ctx = self.get_input_value(node, 'ctx')
        key = self.get_input_value(node, 'key')
        val = self.get_input_value(node, 'value')
        if isinstance(ctx, dict):
            ctx[key] = val
        return self.follow_flow(node, 'exec_out')

    def _resolve_thread(self, ctx):
        """Helper to find the thread instance associated with a context dictionary."""
        if not self.sim_state:
            return None
            
        tid = None
        if isinstance(ctx, dict):
            tid = ctx.get('_thread_id')
            
        # Fallback to current evaluation thread if no ID in ctx
        if not tid:
            tid = self.thread_context
            
        # Final fallback to active thread
        if not tid:
            tid = self.sim_state.active_thread_id
            
        if tid:
            return self.sim_state.threads.get(tid)
        return None

    def _handle_context_any_pending_messages(self, node):
        ctx = self.get_input_value(node, 'ctx')
        thread = self._resolve_thread(ctx)
        
        has_pending = False
        if thread:
            has_pending = any(m.get('role') == 'user' and not m.get('responded', False) for m in thread.get('messages', []))
        
        self._update_output_cache(node, 'result', has_pending)
        # Data function - no exec follow
        return None

    def _handle_context_get_new_messages(self, node):
        ctx = self.get_input_value(node, 'ctx')
        thread = self._resolve_thread(ctx)
        
        msgs = []
        if thread:
            msgs = [m['content'] for m in thread.get('messages', []) if m.get('role') == 'user' and not m.get('responded', False)]
        
        self._update_output_cache(node, 'messages', msgs)
        return None

    def _handle_context_get_all_messages(self, node):
        ctx = self.get_input_value(node, 'ctx')
        thread = self._resolve_thread(ctx)
        
        msgs = []
        if thread:
            msgs = [m['content'] for m in thread.get('messages', [])]
        
        self._update_output_cache(node, 'messages', msgs)
        return None

    def _handle_context_send_message(self, node):
        ctx = self.get_input_value(node, 'ctx')
        thread = self._resolve_thread(ctx)
        message_text = self.get_input_value(node, 'message')
        role_num = self.get_input_value(node, 'role')
        
        # Default to assistant (1) if not provided
        if role_num is None: 
            role_num = 1
            
        role_str = self._map_role_num_to_str(role_num)
        
        if thread:
            # Add message with specified role
            if "messages" not in thread: thread["messages"] = []
            thread["messages"].append({"role": role_str, "content": message_text})
            
            # Mark all user messages as responded ONLY if we are replying as assistant
            if role_str == 'assistant':
                for m in thread["messages"]:
                    if m.get('role') == 'user':
                        m['responded'] = True
                    
            # Also log as event for UI visibility
            self.sim_state._add_event(f"{role_str.capitalize()}: {message_text}", "info")
                
        return self.follow_flow(node, 'exec_out')

    # --- Core Logic Methods ---



    def execute_function(self, function_id, args, caller_node_id=None):
        if not self.function_manager:
            raise Exception("No FunctionManager provided to interpreter")
            
        graph_data = self.function_manager.load_function(function_id)
        if not graph_data:
            raise Exception(f"Failed to load function graph: {function_id}")

        # Push current state to call stack
        self.call_stack.append({
            'nodes': self.nodes,
            'connections': self.connections,
            'output_cache': self.output_cache,
            'args': args, # Was missing? Added back
            'caller_id': caller_node_id
        })

        # Set up new context
        self.nodes = {n['id']: n for n in graph_data.get('nodes', [])}
        self.connections = graph_data.get('connections', [])
        self.output_cache = {}

        try:
            entry_node = self.find_entry_node()
            if entry_node:
                return self.execute_node(entry_node)
        finally:
            if not self.is_suspended:
                self._restore_parent()

    def _restore_parent(self):
        if not self.call_stack: return
        parent = self.call_stack.pop()
        self.nodes = parent['nodes']
        self.connections = parent['connections']
        self.output_cache = parent['output_cache']

    def follow_flow(self, node, port_label):
        # Find output port definition to get its ID
        out_port = next((p for p in node.get('outputs', []) if p.get('label') == port_label), None)
             
        if not out_port: return None

        # Find all connections from this port
        active_connections = [c for c in self.connections if c['fromNode'] == node['id'] and c['fromPort'] == out_port['id']]
        
        for conn in active_connections:
            target_node = self.nodes.get(conn['toNode'])
            if target_node:
                res = self.execute_node(target_node)
                if res == "STOP":
                    return "STOP"
                if res == "SUSPEND":
                    return "SUSPEND"
        return None

    def get_input_value(self, node, param_key):
        # 1. Check for incoming connection
        # Need to find the input port ID for this param_key
        in_port = next((p for p in node.get('inputs', []) if p.get('key') == param_key), None)
        
        # Fallback by label if key missing (some old nodes might just have label)
        if not in_port:
             in_port = next((p for p in node.get('inputs', []) if p.get('label', '').replace(" ", "_").lower() == param_key.lower()), None)
        
        if in_port:
             conn = next((c for c in self.connections if c['toNode'] == node['id'] and c['toPort'] == in_port['id']), None)
             if conn:
                 source_node = self.nodes.get(conn['fromNode'])
                 source_port_id = conn['fromPort']
                 return self.evaluate_output(source_node, source_port_id)

        # 2. Return param value if not connected
        return node.get('params', {}).get(param_key)

    def evaluate_output(self, node, port_id):
        # Check cache
        if node['id'] in self.output_cache and port_id in self.output_cache[node['id']]:
            return self.output_cache[node['id']][port_id]

        val = None
        nt = node['type']
        
        if nt == 'start' or nt == 'function_input':
            # Retrieve from call stack args
            if self.call_stack:
                # Find port label
                port = next((p for p in node.get('outputs', []) if p['id'] == port_id), None)
                if port:
                    val = self.call_stack[-1]['args'].get(port['label'])
            else:
                # Root graph? args might be in context
                # Find port label
                port = next((p for p in node.get('outputs', []) if p['id'] == port_id), None)
                if port:
                    val = self.context.get(port['label'])
        
        elif nt == 'math_add':
            a = float(self.get_input_value(node, 'a') or 0)
            b = float(self.get_input_value(node, 'b') or 0)
            val = a + b
            
        elif nt == 'math_sub':
            a = float(self.get_input_value(node, 'a') or 0)
            b = float(self.get_input_value(node, 'b') or 0)
            val = a - b

        elif nt == 'math_mul':
            a = float(self.get_input_value(node, 'a') or 0)
            b = float(self.get_input_value(node, 'b') or 0)
            val = a * b
            
        elif nt == 'math_div':
            a = float(self.get_input_value(node, 'a') or 0)
            b = float(self.get_input_value(node, 'b') or 1)
            val = a / b if b != 0 else 0

        elif nt == 'context_any_pending_messages':
            self._handle_context_any_pending_messages(node)
            if node['id'] in self.output_cache and port_id in self.output_cache[node['id']]:
                return self.output_cache[node['id']][port_id]

        elif nt == 'context_get_new_messages':
            self._handle_context_get_new_messages(node)
            if node['id'] in self.output_cache and port_id in self.output_cache[node['id']]:
                return self.output_cache[node['id']][port_id]

        elif nt == 'context_get_all_messages':
            self._handle_context_get_all_messages(node)
            if node['id'] in self.output_cache and port_id in self.output_cache[node['id']]:
                return self.output_cache[node['id']][port_id]

        elif nt == 'string_format':
            fmt = str(node.get('params', {}).get('format') or "")
            args = []
            i = 1
            while True:
                key = f"arg{i}"
                # Check if this input exists in the node's inputs list
                has_port = any(p.get('key') == key for p in node.get('inputs', []))
                if not has_port:
                    break
                val = self.get_input_value(node, key)
                args.append(val if val is not None else "")
                i += 1
            try:
                val = fmt.format(*args)
            except Exception as e:
                logger.warning(f"String format failed: {e}")
                val = fmt

        elif nt == 'string':
            val = node.get('params', {}).get('value')

        elif nt == 'enum_constant':
            val = node.get('params', {}).get('value', 0)
        
        elif nt == 'get_variable':
            name = node.get('params', {}).get('name')
            if name:
                # Check local context
                val = self.context.get(name)
        
        elif nt == 'number':
            val = float(node.get('params', {}).get('value') or 0)
            
        elif nt == 'boolean':
            val = node.get('params', {}).get('value')

        elif nt == 'logic_and':
            a = self.get_input_value(node, 'a')
            b = self.get_input_value(node, 'b')
            val = bool(a) and bool(b)

        elif nt == 'logic_or':
            a = self.get_input_value(node, 'a')
            b = self.get_input_value(node, 'b')
            val = bool(a) or bool(b)

        elif nt == 'logic_not':
            a = self.get_input_value(node, 'a')
            val = not bool(a)

        elif nt == 'compare_equal':
            a = self.get_input_value(node, 'a')
            b = self.get_input_value(node, 'b')
            val = (a == b)

        elif nt == 'compare_greater':
            a = self.get_input_value(node, 'a')
            b = self.get_input_value(node, 'b')
            try:
                val = float(a) > float(b)
            except:
                val = False

        elif nt == 'compare_less':
            a = self.get_input_value(node, 'a')
            b = self.get_input_value(node, 'b')
            try:
                val = float(a) < float(b)
            except:
                val = False

        elif nt == 'list_create':
            val = []
            # We look for inputs with keys like 'in_0', 'in_1', etc.
            inputs = node.get('inputs', [])
            # Filter for element inputs (avoid num_elements)
            element_inputs = [i for i in inputs if i.get('key', '').startswith('in_')]
            sorted_inputs = sorted(element_inputs, key=lambda i: i.get('label', '0'))
            for i in sorted_inputs:
                if 'key' in i:
                    val.append(self.get_input_value(node, i['key']))

        elif nt == 'list_make':
            val = []
            inputs = node.get('inputs', [])
            # Only consider inputs that result from connections
            # We know the frontend handles adding dynamic inputs, but we only want the connected ones
            # AND we want them in order of index.
            
            # Helper to check connection exists
            def is_connected(port_id):
                 return any(c['toNode'] == node['id'] and c['toPort'] == port_id for c in self.connections)

            item_inputs = []
            for inp in inputs:
                if inp.get('key', '').startswith('in_'):
                    if is_connected(inp['id']):
                         try:
                             idx = int(inp['key'].replace('in_', ''))
                             item_inputs.append((idx, inp['key']))
                         except:
                             pass
            
            # Sort by index to maintain list order
            item_inputs.sort(key=lambda x: x[0])
            
            for _, key in item_inputs:
                val.append(self.get_input_value(node, key))

        elif nt == 'struct_make':
            val = {}
            for input_port in node.get('inputs', []):
                key = input_port.get('key')
                if key:
                    val[key] = self.get_input_value(node, key)
        
        elif nt == 'struct_access':
            obj = self.get_input_value(node, 'object')
            port = next((p for p in node.get('outputs', []) if p['id'] == port_id), None)
            if port and isinstance(obj, dict):
                val = obj.get(port['key'])

        elif nt == 'list_get':
            lst = self.get_input_value(node, 'list')
            idx = int(self.get_input_value(node, 'index') or 0)
            if isinstance(lst, list) and 0 <= idx < len(lst):
                val = lst[idx]
            else:
                val = None

        elif nt == 'map_create':
            val = {}

        elif nt == 'map_get':
            map_obj = self.get_input_value(node, 'map')
            key = self.get_input_value(node, 'key')
            if isinstance(map_obj, dict):
                val = map_obj.get(key)
            else:
                val = None

        elif nt == 'list_length':
            lst = self.get_input_value(node, 'list')
            if isinstance(lst, list):
                val = len(lst)
            else:
                val = 0

        elif nt == 'list_contains':
            lst = self.get_input_value(node, 'list')
            search_val = self.get_input_value(node, 'value')
            if isinstance(lst, list):
                val = search_val in lst
            else:
                val = False

        elif nt == 'to_string':
            input_val = self.get_input_value(node, 'value')
            val = self._value_to_string(input_val)

        elif nt in ('cast_to_type', 'list_cast', 'map_cast'):
            # Data-only cast is a pass-through in visual scripting, 
            # as Gallium is dynamically typed at runtime.
            val = self.get_input_value(node, 'value')

        elif nt == 'create_tool':
            func_name = self.get_input_value(node, 'function_name')
            description = self.get_input_value(node, 'description')
            
            # Create tool definition
            tool_def = {
                'id': func_name, # The filename/ID
                'name': func_name, # Ideally sanitized
                'description': description,
                'args': []
            }
            
            # Inspect the target function to find arguments
            if self.function_manager:
                graph = self.function_manager.load_function(func_name)
                if graph:
                    # Find start node
                    start_node = next((n for n in graph.get('nodes', []) if n.get('type') in ('start', 'function_input')), None)
                    if start_node:
                        for out_port in start_node.get('outputs', []):
                            if out_port['type'] != 'exec':
                                tool_def['args'].append({
                                    'name': out_port['label'],
                                    'type': out_port['type']
                                })
            val = tool_def

        elif nt == 'json_parse':
            json_str = self.get_input_value(node, 'json')
            try:
                if isinstance(json_str, str):
                    # Clean up code blocks if LLM outputs markdown
                    if json_str.strip().startswith("```"):
                         lines = json_str.strip().splitlines()
                         # Remove first line if it starts with ```
                         if lines and lines[0].startswith("```"):
                             lines = lines[1:]
                         # Remove last line if it starts with ```
                         if lines and lines[-1].startswith("```"):
                             lines = lines[:-1]
                         json_str = "\n".join(lines)
                         
                    val = json.loads(json_str)
                else:
                    val = {}
            except Exception as e:
                logger.warning(f"Failed to parse JSON: {e}")
                val = {}

        elif nt == 'get_context_agent_provider':
            ctx = self.get_input_value(node, 'ctx')
            role = self.get_input_value(node, 'role')
            
            provider_val = "unknown"
            model_val = ""
            
            if isinstance(ctx, dict):
                # Try new workflow role format
                roles = ctx.get('roles', [])
                if isinstance(roles, list):
                    for r in roles:
                        if isinstance(r, dict) and r.get('role') == role:
                            provider_val = r.get('provider', "unknown")
                            model_val = r.get('model', "")
                            break
                
                # Check directly in dict if not found
                if provider_val == "unknown" and role in ctx:
                    provider_val = str(ctx[role])

            # Determine which output was requested
            requested_port = next((p for p in node.get('outputs', []) if p['id'] == port_id), None)
            if requested_port and requested_port.get('key') == 'model':
                val = model_val
            else:
                val = provider_val

        elif nt == 'get_context_top_level_goal':
            ctx = self.get_input_value(node, 'ctx')
            val = ctx.get('goal') if isinstance(ctx, dict) else ""

        elif nt == 'get_context_agent_goal':
            ctx = self.get_input_value(node, 'ctx')
            val = ctx.get('agent_goal') if isinstance(ctx, dict) else ""

        elif nt == 'get_context_key_value':
            ctx = self.get_input_value(node, 'ctx')
            key = self.get_input_value(node, 'key')
            val = ctx.get(key) if isinstance(ctx, dict) else None

        if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
        self.output_cache[node['id']][port_id] = val
        return val

    def _get_git_changed_files(self):
        """Returns a list of files modified or untracked in the current git repo."""
        try:
            # We use porcelain for stable machine-readable output
            result = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                return []
            
            files = []
            for line in result.stdout.splitlines():
                if len(line) >= 4:
                    # Format: XY filename (where XY is status)
                    files.append(line[3:].strip())
            return files
        except Exception as e:
            logger.warning(f"Failed to get git status: {e}")
            return []

    def _value_to_string(self, value):
        """
        Converts any value type to a string representation.
        Supports primitives (number, boolean, string), lists, maps, and custom structs.
        """
        import json
        
        if value is None:
            return "null"
        elif isinstance(value, bool):
            return "true" if value else "false"
        elif isinstance(value, (int, float)):
            # Format numbers nicely - remove trailing zeros for floats
            if isinstance(value, float) and value.is_integer():
                return str(int(value))
            return str(value)
        elif isinstance(value, str):
            return value
        elif isinstance(value, list):
            # Format list with JSON-like syntax
            items = [self._value_to_string(item) for item in value]
            return "[" + ", ".join(items) + "]"
        elif isinstance(value, dict):
            # Format dict/struct with JSON-like syntax  
            pairs = [f'"{k}": {self._value_to_string(v)}' for k, v in value.items()]
            return "{" + ", ".join(pairs) + "}"
        else:
            # Fallback for any other type
            try:
                return str(value)
            except:
                return "<unknown>"

    def _create_dynamic_tool(self, tool_def):
        """
        Creates a callable Python function that matches the tool definition.
        This function when called will execute the graph interpreter for that tool.
        """
        func_id = tool_def['id']
        # Sanitize name for Python validity
        name = tool_def['name']
        sanitized_name = name.replace(" ", "_").replace("-", "_")
        sanitized_name = "".join(c for c in sanitized_name if c.isalnum() or c == '_')
        if not sanitized_name: sanitized_name = "unnamed_tool"
        
        args_parts = []
        for arg in tool_def['args']:
             py_type = self._map_type_to_python(arg['type'])
             # We assume all args are required for now or default to None?
             # Let's make them required to match graph inputs.
             args_parts.append(f"{arg['name']}: {py_type}")
        
        args_str = ", ".join(args_parts)
        description = tool_def.get('description', '')
        
        # Define the wrapper function
        # We use locals() to capture arguments.
        code = f"""
def {sanitized_name}({args_str}):
    '''{description}'''
    return tool_runner('{func_id}', locals())
"""
        env = {'tool_runner': self._tool_runner}
        try:
             exec(code, env)
             return env[sanitized_name]
        except Exception as e:
             logger.error(f"Failed to create dynamic tool {sanitized_name}: {e}")
             return None

    def _tool_runner(self, function_id, args):
        """
        Callback used by dynamic tools to execute the graph.
        """
        try:
             logger.info(f"Executing Tool: {function_id} with args: {args}")
             
             # Execute the function graph
             prev_stack_depth = len(self.return_stack)
             self.execute_function(function_id, args)
             
             # Check for return value
             if len(self.return_stack) > prev_stack_depth:
                 result = self.return_stack.pop()
                 # AI expects a string or simple JSON-compatible object
                 # If result is a dict with multiple outputs, return it
                 # If result has one 'result' key, maybe return that?
                 # For now, return the full dict, or value_to_string specific parts?
                 # Returning the dict is safest for structure.
                 return result
                 
             return "Tool executed successfully (no return value)."
             
        except Exception as e:
             logger.error(f"Error executing tool {function_id}: {e}")
             return f"Error: {str(e)}"

    def _map_type_to_python(self, graph_type):
        """Maps graph types to Python types for type hinting."""
        if not graph_type: return 'str'
        gt = graph_type.lower()
        if 'number' in gt: return 'float'
        if 'boolean' in gt or 'bool' in gt: return 'bool'
        if 'list' in gt: return 'list'
        if 'map' in gt: return 'dict'
        return 'str'

    def _handle_create_llm_chat(self, node):
        provider = self.get_input_value(node, 'provider')
        model = self.get_input_value(node, 'model')
        system_prompt = self.get_input_value(node, 'system_prompt')
        initial_messages = self.get_input_value(node, 'message_list')
        tools = self.get_input_value(node, 'tool_list')
        
        # Initialize chat state object
        chat_state = {
            'provider': provider,
            'model': model,
            'system_prompt': system_prompt,
            'messages': [],
            'tools': tools or []
        }
        
        # Process initial messages
        if initial_messages and isinstance(initial_messages, list):
             for m in initial_messages:
                  if isinstance(m, dict):
                      role_num = m.get('role', 0)
                      content = m.get('message', '')
                      role_str = self._map_role_num_to_str(role_num)
                      chat_state['messages'].append({'role': role_str, 'content': content})
         
        if chat_state['messages'] and chat_state['messages'][-1]['role'] == 'assistant':
             # If the history ends in Assistant, and we plan to use this chat, 
             # we likely want to treat that last Assistant message as the User Prompt for *this* new agent.
             logger.info(f"Create LLM Chat (Node {node['id']}): Final message in initial list is 'assistant'. Coercing to 'user' to allow response.")
             chat_state['messages'][-1]['role'] = 'user'
        
        self._update_output_cache(node, 'llm_chat', chat_state)
        return self.follow_flow(node, 'exec_out')

    def _get_llm_client(self, provider, model_name):
        """Helper to create the appropriate LLM client based on provider."""
        # Load Connections Config
        connections = {}
        if self.sim_state and self.sim_state.system_root:
             try:
                 conn_path = self.sim_state.system_root / "gallium" / "connections.json"
                 if conn_path.exists():
                     with open(conn_path, 'r') as f:
                         connections = json.load(f)
             except Exception as e:
                 logger.warning(f"Failed to load connections.json: {e}")

        if provider == 'local':
            model = model_name or "current-model"
            local_cfg = connections.get("local", {})
            base_url = local_cfg.get("base_url", "http://127.0.0.1:8080")
            api_url = base_url if base_url.endswith("/v1/chat/completions") else f"{base_url.rstrip('/')}/v1/chat/completions"
            return LocalLlamaClient(api_url=api_url, model_name=model)
        elif provider == 'gemini':
            model = model_name or "gemini-2.0-flash"
            gemini_cfg = connections.get("gemini", {})
            return GeminiClient(api_key=gemini_cfg.get("api_key"), model_name=model)
        elif provider == 'openai':
            model = model_name or "gpt-4o"
            openai_cfg = connections.get("openai", {})
            return OpenAIClient(api_key=openai_cfg.get("api_key"), model_name=model)
        elif provider == 'claude' or provider == 'anthropic':
            model = model_name or "claude-3-5-sonnet-20241022"
            claude_cfg = connections.get("claude", {}) or connections.get("anthropic", {})
            return ClaudeClient(api_key=claude_cfg.get("api_key"), model_name=model)
        return None

    def _get_builtin_python_tools(self):
        """Returns schemas and registry for built-in Python tools."""
        tools_schema = []
        tool_registry = {}
        
        for tdef in self.builtin_python_tool_defs:
            schema = self._create_tool_schema(tdef)
            tools_schema.append(schema)
            # Map tool name in schema to the actual function in tools.py
            func_name = tdef['name']
            if hasattr(tools, func_name):
                func = getattr(tools, func_name)
                # Wrap it to handle and return string errors
                def make_wrapper(f):
                    def wrapper(**kwargs):
                        try:
                            res = f(**kwargs)
                            return str(res)
                        except Exception as e:
                            return f"Error: {e}"
                    return wrapper
                tool_registry[schema['function']['name']] = make_wrapper(func)
                
        return tools_schema, tool_registry

    def _handle_send_llm_chat_message(self, node):
        chat_state = self.get_input_value(node, 'llm_chat')
        message_struct = self.get_input_value(node, 'message')
        
        if not chat_state or not isinstance(chat_state, dict):
             logger.error(f"Send LLM Chat Message (Node {node['id']}): Invalid chat state.")
             result_struct = {'message': "Error: Invalid Chat State", 'role': 'system'}
             self._update_output_cache(node, 'result_message', result_struct)
             return self.follow_flow(node, 'exec_out')

        # Add user message to state
        if message_struct:
             role_num = message_struct.get('role', 0)
             content = message_struct.get('message', '')
             role_str = self._map_role_num_to_str(role_num)
             
             # Edge Case: If we are feeding an Assistant message (e.g. from another agent) 
             # into this node to TRIGGER a response, we must treat it as a USER (instruction).
             # Providing two 'assistant' messages in a row at the end of context causes errors in many backends (llama-server).
             if role_str == 'assistant':
                 logger.info(f"Node {node['id']}: Coercing 'assistant' input message to 'user' role for LLM Prompting.")
                 role_str = 'user'
                 
             chat_state['messages'].append({'role': role_str, 'content': content})

        provider = chat_state.get('provider', 'local')
        result_content = ""
        result_role = 1 # Assistant
        
        # Load Connections Config
        connections = {}
        if self.sim_state and self.sim_state.system_root:
             try:
                 conn_path = self.sim_state.system_root / "gallium" / "connections.json"
                 if conn_path.exists():
                     with open(conn_path, 'r') as f:
                         connections = json.load(f)
             except Exception as e:
                 logger.warning(f"Failed to load connections.json: {e}")

        model_name = chat_state.get('model')
        client = self._get_llm_client(provider, model_name)

        if client:
            try:
                messages_for_run = []
                if chat_state.get('system_prompt'):
                    messages_for_run.append({'role': 'system', 'content': chat_state['system_prompt']})
                messages_for_run.extend(chat_state['messages'])
                
                # Prepare Tools
                builtin_schema, builtin_registry = self._get_builtin_python_tools()
                
                tool_registry = builtin_registry
                tools_schema = builtin_schema
                
                if chat_state.get('tools'):
                    for t in chat_state['tools']:
                        # Skip if it's already a builtin (prevent name collisions)
                        # though IDs should be different.
                        schema = self._create_tool_schema(t)
                        tools_schema.append(schema)
                        tool_registry[schema['function']['name']] = lambda tid=t['id'], **kwargs: self._tool_runner(tid, kwargs)

                result_text, new_history = client.run_chat(
                    messages_for_run, 
                    tools_schema=tools_schema, 
                    tool_registry=tool_registry
                )
                
                if result_text:
                    result_content = result_text
                    chat_state['messages'] = [m for m in new_history if m.get('role') != 'system']
                else:
                    result_content = f"No response from {provider}"
            except Exception as e:
                logger.error(f"LLM execution ({provider}) failed: {e}")
                result_content = f"Error: {e}"
        else:
            result_content = f"Provider '{provider}' not implemented."
        
        # Output result
        result_struct = {'message': result_content, 'role': 1}
        self._update_output_cache(node, 'result_message', result_struct)
        
        return self.follow_flow(node, 'exec_out')

    def _map_role_num_to_str(self, role_num):
        mapping = {0: 'user', 1: 'assistant', 2: 'tool', 3: 'system'}
        return mapping.get(role_num, 'user')

    def _create_tool_schema(self, tool_def):
        """Converts internal tool definition to OpenAI-compatible JSON schema."""
        name = tool_def['name']
        sanitized_name = name.replace(" ", "_").replace("-", "_")
        sanitized_name = "".join(c for c in sanitized_name if c.isalnum() or c == '_')
        if not sanitized_name: sanitized_name = "unnamed_tool"
        
        properties = {}
        required = []
        for arg in tool_def.get('args', []):
            arg_name = arg['name']
            arg_type = arg['type']
            
            json_type = "string"
            if arg_type.lower() in ['number', 'float', 'int', 'integer']:
                json_type = "number"
            elif arg_type.lower() in ['boolean', 'bool']:
                json_type = "boolean"
            elif arg_type.lower() in ['list', 'array']:
                json_type = "array"
            elif arg_type.lower() in ['map', 'dict', 'object']:
                json_type = "object"
            
            properties[arg_name] = {"type": json_type, "description": f"Argument {arg_name}"}
            # Add to required if not explicitly optional
            if not arg.get('optional', False):
                required.append(arg_name)
            
        return {
            "type": "function",
            "function": {
                "name": sanitized_name,
                "description": tool_def.get('description', ''),
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
        }

    def _handle_ai_eval(self, node):
        provider = self.get_input_value(node, 'provider') or 'gemini'
        model = self.get_input_value(node, 'model') or self.get_input_value(node, 'model_name')
        system_prompt = self.get_input_value(node, 'system_prompt')
        prompt = self.get_input_value(node, 'prompt')
        tools_list = self.get_input_value(node, 'tools')

        client = self._get_llm_client(provider, model)
        
        if not client:
            result_content = f"Provider '{provider}' not implemented."
            self._update_output_cache(node, 'response', result_content)
            return self.follow_flow(node, 'exec_out')

        # Prepare Tools
        builtin_schema, builtin_registry = self._get_builtin_python_tools()
        
        tool_registry = builtin_registry
        tools_schema = builtin_schema

        if tools_list:
            for t in tools_list:
                schema = self._create_tool_schema(t)
                tools_schema.append(schema)
                tool_registry[schema['function']['name']] = lambda tid=t['id'], **kwargs: self._tool_runner(tid, kwargs)

        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        messages.append({'role': 'user', 'content': prompt})

        try:
            result_content, _ = client.run_chat(messages, tools_schema=tools_schema, tool_registry=tool_registry)
        except Exception as e:
            logger.error(f"AI Eval ({provider}) failed: {e}")
            result_content = f"Error: {e}"

        self._update_output_cache(node, 'response', result_content)
        self._update_output_cache(node, 'changed_files', self._get_git_changed_files())
        return self.follow_flow(node, 'exec_out')

    def _handle_try_cast_to_type(self, node):
        target_type = node.get('params', {}).get('target_type')
        if not target_type:
            if node['type'] == 'list_try_cast':
                el_type = node.get('params', {}).get('element_type', 'any_not_exec')
                target_type = f"list:{el_type}"
            elif node['type'] == 'map_try_cast':
                k_type = node.get('params', {}).get('key_type', 'string')
                v_type = node.get('params', {}).get('value_type', 'any_not_exec')
                target_type = f"map:{k_type}:{v_type}"

        val = self.get_input_value(node, 'value')
        
        if self._check_type_match(val, target_type):
            # Cache the result for the output data port
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            # Result port might be 'result' or 'Result' or indexed. 
            # We look for the first non-exec output.
            out_port = next((p for p in node.get('outputs', []) if p.get('type') != 'exec'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = val
            
            return self.follow_flow(node, 'Success')
        else:
            return self.follow_flow(node, 'Fail')

    def _check_type_match(self, val, target_type):
        """Checks if a value matches the given Gallium type string."""
        if not target_type or target_type == 'any' or target_type == 'any_not_exec':
            return True
        
        if val is None:
             return False

        if target_type == 'string':
            return isinstance(val, str)
        if target_type == 'number':
            return isinstance(val, (int, float)) and not isinstance(val, bool)
        if target_type == 'boolean':
            return isinstance(val, bool)
        if target_type == 'chat_state' or target_type == 'context' or target_type.startswith('struct:'):
            # These are all represented as dictionaries in the interpreter
            return isinstance(val, dict)
        if target_type.startswith('list:'):
            return isinstance(val, list)
        if target_type.startswith('map:'):
            return isinstance(val, dict)
        
        return True
