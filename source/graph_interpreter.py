import logging
import subprocess
from source.ai_system import AI_Eval
from source.blackboard import Blackboard
from source.schemas import Event
import json

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
        self.is_suspended = False
        self.suspended_node_id = None
        self.suspended_prompt_data = None
        
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
        self.node_handlers['action'] = self._handle_action
        
        # UI/System
        self.node_handlers['prompt_user'] = self._handle_prompt_user
        self.node_handlers['ui_yield'] = self._handle_ui_yield
        self.node_handlers['log_message'] = self._handle_log_message
        self.node_handlers['run_process'] = self._handle_run_process
        self.node_handlers['write_file'] = self._handle_write_file
        self.node_handlers['ai_eval'] = self._handle_ai_eval

        # Variables
        self.node_handlers['set_variable'] = self._handle_set_variable

        # Tier 1 / State Engine Nodes
        self.node_handlers['global_context_read'] = self._handle_global_context_read
        self.node_handlers['global_context_write'] = self._handle_global_context_write
        self.node_handlers['json_iterator'] = self._handle_json_iterator
        self.node_handlers['event_emit'] = self._handle_event_emit
        
        # Collections (Lists/Maps) - Side-effect nodes (Set/Modify)
        # Note: 'list_create', 'list_make' etc are purely value nodes handled in evaluate_output
        # But 'list_set', 'list_add' modify the list reference and flow.
        self.node_handlers['list_set'] = self._handle_list_set
        self.node_handlers['list_add'] = self._handle_list_add
        self.node_handlers['list_remove_at'] = self._handle_list_remove_at
        self.node_handlers['list_clear'] = self._handle_list_clear
        
        self.node_handlers['map_set'] = self._handle_map_set
        self.node_handlers['map_remove'] = self._handle_map_remove

    def safe_graph_eval(self, graph_data, expected_input_types, input_values):
        """
        Validates graph inputs against expected types and executes.
        expected_input_types: list of strings (e.g. ['number', 'string'])
        input_values: list of values
        Returns the return value(s) of the graph if provided via function_return.
        """
        if not graph_data:
            raise Exception("No graph data provided")
            
        graph_inputs = graph_data.get('inputs', [])
        
        # 1. Check count
        if len(graph_inputs) < len(expected_input_types):
             raise Exception(f"Graph lacks required inputs. Expected at least {len(expected_input_types)}, found {len(graph_inputs)}")
             
        # 2. Check types and build context
        context = {}
        for i, expected_type in enumerate(expected_input_types):
            graph_input = graph_inputs[i]
            if graph_input.get('type') != expected_type:
                raise Exception(f"Input {i} ('{graph_input['name']}') type mismatch. Expected '{expected_type}', found '{graph_input.get('type')}'")
            
            # Use the name defined in the graph for the context
            val = input_values[i] if i < len(input_values) else None
            context[graph_input['name']] = val
            
        # 3. Execute
        self.execute(graph_data, context=context)
        
        # 4. Return results if any
        if self.return_stack:
            return self.return_stack.pop()
        return None

    def execute(self, graph_data, context=None):
        """
        Executes the graph starting from the entry node.
        """
        if not graph_data:
            return

        # If we are starting a fresh execution, ensure cleared state.
        self.is_suspended = False
        self.suspended_node_id = None
        self.suspended_prompt_data = None

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

    def _handle_prompt_user(self, node):
        title = self.get_input_value(node, 'title')
        message = self.get_input_value(node, 'message')
        
        self.is_suspended = True
        self.suspended_node_id = node['id']
        self.suspended_prompt_data = {'title': title, 'message': message} # Keep for state tracking
        
        if self.sim_state:
            # Use specific BinaryChoice type for backward compat or clear definition
            self.sim_state.send_ui_yield("BinaryChoice", {'title': title, 'message': message})
        
        return "SUSPEND"

    def _handle_ui_yield(self, node):
        ui_type = self.get_input_value(node, 'ui_type')
        payload = self.get_input_value(node, 'payload')
        
        self.is_suspended = True
        self.suspended_node_id = node['id']
        self.suspended_prompt_data = {'ui_type': ui_type, 'payload': payload}
        
        if self.sim_state:
            self.sim_state.send_ui_yield(ui_type, payload)
            
        return "SUSPEND"

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

    def _handle_ai_eval(self, node):
        model_name = self.get_input_value(node, 'model_name')
        system_prompt = self.get_input_value(node, 'system_prompt')
        prompt = self.get_input_value(node, 'prompt')
        tools_input = self.get_input_value(node, 'tools')

        if self.sim_state:
            self.sim_state._add_event(f"AI Eval: {prompt[:100]}...", "info")

        # Prepare tools
        executable_tools = []
        if isinstance(tools_input, list):
            for t in tools_input:
                if isinstance(t, dict) and 'id' in t:
                    executable_tools.append(self._create_dynamic_tool(t))

        # Get before status
        before_files = set(self._get_git_changed_files())

        # Call AI (blocks)
        try:
            response = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=prompt,
                model_name=model_name,
                tools=executable_tools if executable_tools else None,
                dynamic_tools=tools_input if isinstance(tools_input, list) else None
            )
        except Exception as e:
            logger.error(f"AI_Eval failed: {e}")
            response = f"Error: {str(e)}"

        # Get after status
        after_files = set(self._get_git_changed_files())
        changed_files = list(after_files - before_files)

        # Store in output cache
        if node['id'] not in self.output_cache: 
            self.output_cache[node['id']] = {}
            
        for output_port in node.get('outputs', []):
            key = output_port.get('key')
            if key == 'response':
                self.output_cache[node['id']][output_port['id']] = response
            elif key == 'changed_files':
                self.output_cache[node['id']][output_port['id']] = changed_files

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
            from source.tools import write_to_file
            # Call the tool function (it handles directory creation etc)
            write_to_file(path, content, overwrite=True)
            msg = f"Successfully wrote to {path}"
            logger.info(msg)
            self._update_output_cache(node, 'result', msg)
        except Exception as e:
            err = f"Failed to write file: {e}"
            logger.error(err)
            self._update_output_cache(node, 'result', err)
            
        return self.follow_flow(node, 'exec_out')

    def _handle_global_context_read(self, node):
        key = self.get_input_value(node, 'key')
        val = self.blackboard.get_value(key)
        
        # If looking for specific spec parts (optional logic, but basic key-value is foundation)
        if key == "SmartSpec" and self.blackboard.get_spec():
             val = self.blackboard.get_spec().dict()

        self._update_output_cache(node, 'value', val)
        return self.follow_flow(node, 'exec_out')

    def _handle_global_context_write(self, node):
        key = self.get_input_value(node, 'key')
        val = self.get_input_value(node, 'value')
        
        self.blackboard.set_value(key, val)
        return self.follow_flow(node, 'exec_out')

    def _handle_event_emit(self, node):
        event_name = self.get_input_value(node, 'event_name')
        payload = self.get_input_value(node, 'payload') or {}
        
        event = Event(name=event_name, payload=payload, source=f"node_{node['id']}")
        logger.info(f"EMITTING EVENT: {event}")
        
        if self.sim_state:
            # Send full event object to SimulationState/Orchestrator
            self.sim_state.trigger_event(event)
            # Log for UI
            self.sim_state._add_event(f"Event Emitted: {event_name}", "info")
            
        # Stop execution so the Orchestrator can decide what to do next
        return "STOP"

    def _handle_json_iterator(self, node):
        """
        Iterates over a list. 
        Required Inputs: 'list' (List[Any])
        Outputs: 'item', 'index', 'is_done' (bool)
        Flows: 'exec_loop', 'exec_done'
        
        Note: This node is re-entrant. It keeps track of index in the local context 
        OR we can design it to just pop one item if the list is modified. 
        Standard iterator pattern:
        """
        collection = self.get_input_value(node, 'list')
        if not isinstance(collection, list):
            collection = []

        # We need to store the current index for this specific node ID in the current execution context.
        # However, `self.context` is global to the function call.
        # We can try to use a unique key in context.
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

    def _update_output_cache(self, node, port_key, value):
        if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
        out_port = next((p for p in node.get('outputs', []) if p.get('key') == port_key), None)
        if out_port:
            self.output_cache[node['id']][out_port['id']] = value

    # --- Core Logic Methods ---

    def resume(self, payload):
        """
        Resumes execution from a suspended state.
        payload: Data returned from the UI
        """
        if not self.is_suspended or not self.suspended_node_id:
            logger.warning("Attempted to resume but interpreter is not suspended.")
            return

        logger.info(f"Resuming execution with payload: {payload}")
        
        # 1. Clear suspension flags
        self.is_suspended = False
        prompt_node = self.nodes.get(self.suspended_node_id)
        self.suspended_node_id = None
        self.suspended_prompt_data = None
        
        if not prompt_node:
            logger.error("Suspended node not found in current graph context.")
            return

        # 2. Continue flow based on node type
        res = None
        if prompt_node['type'] == 'prompt_user':
            # Expect boolean payload
            choice = bool(payload)
            port_label = 'exec_yes' if choice else 'exec_no'
            res = self.follow_flow(prompt_node, port_label)
            
        elif prompt_node['type'] == 'ui_yield':
            # Generic yield
            self._update_output_cache(prompt_node, 'result', payload)
            res = self.follow_flow(prompt_node, 'exec_out')
        
        if res == "SUSPEND": return

        # 3. Unwind manually if needed (handle function returns up the stack)
        while self.call_stack:
             # We finished the current level's flow. Pop back to parent.
             parent_frame = self.call_stack.pop()
             caller_id = parent_frame.get('caller_id')
             
             # Restore parent state
             self.nodes = parent_frame['nodes']
             self.connections = parent_frame['connections']
             self.output_cache = parent_frame['output_cache']
             
             if caller_id:
                 caller_node = self.nodes.get(caller_id)
                 if not caller_node: continue 
                 
                 # Handle return values (if any were pushed by child graph)
                 if self.return_stack:
                     results = self.return_stack.pop()
                     if caller_node['id'] not in self.output_cache: 
                         self.output_cache[caller_node['id']] = {}
                     
                     for output_port in caller_node.get('outputs', []):
                        if output_port['type'] != 'exec':
                            if output_port['label'] in results:
                                self.output_cache[caller_node['id']][output_port['id']] = results[output_port['label']]
                 
                 # Continue parent flow
                 res = self.follow_flow(caller_node, 'exec_out')
                 if res == "SUSPEND": return
             else:
                 # Reached root?
                 pass

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
