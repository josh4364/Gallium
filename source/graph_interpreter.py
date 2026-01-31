import logging
import subprocess
from source.ai_system import AI_Eval

logger = logging.getLogger("GraphInterpreter")

class GraphInterpreter:
    def __init__(self, simulation_state=None, function_manager=None, struct_manager=None):
        self.nodes = {}
        self.connections = []
        self.context = {} 
        self.sim_state = simulation_state
        self.function_manager = function_manager
        self.struct_manager = struct_manager
        self.output_cache = {} # nodeId -> outputId -> value
        self.call_stack = [] # Stack of parent states for recursion
        self.return_stack = [] # Stack of return values from function calls

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
        # Prefer function_input, but fallback to any node if it's a simple graph?
        # Actually for flow execution we need a starting point.
        for node in self.nodes.values():
            if node['type'] in ('start', 'function_input', 'entry'):
                return node
        return None

    def execute_node(self, node):
        if not node: return None

        node_type = node['type']
        
        # --- Execution Flow Nodes ---
        if node_type == 'start' or node_type == 'function_input':
            # Just pass through
            return self.follow_flow(node, 'exec_out')
            
        elif node_type == 'log_message':
            msg = self.get_input_value(node, 'message')
            if self.sim_state:
                self.sim_state._add_event(f"{msg}", "info")
            else:
                print(f"GRAPH LOG: {msg}")
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'set_variable':
            name = node.get('params', {}).get('name') or self.get_input_value(node, 'name')
            val = self.get_input_value(node, 'value')
            if name:
                self.context[name] = val
                logger.debug(f"Set Local Variable {name} = {val}")
            return self.follow_flow(node, 'exec_out')
            
        elif node_type == 'function_return':
            # Gather all data inputs as return values
            returns = {}
            for input_port in node.get('inputs', []):
                if input_port['type'] != 'exec':
                    val = self.get_input_value(node, input_port.get('key') or input_port['label'])
                    returns[input_port['label']] = val
            
            self.return_stack.append(returns)
            return "STOP" # Signal to cease execution of this graph context
            
        elif node_type == 'function_call':
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
            self.execute_function(func_id, args)
            
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

        elif node_type == 'condition': # Branch
            condition = self.get_input_value(node, 'condition')
            if bool(condition):
                return self.follow_flow(node, 'exec_true')
            else:
                return self.follow_flow(node, 'exec_false')
                
        elif node_type == 'action': # Generic action
            msg = self.get_input_value(node, 'message')
            if self.sim_state:
                self.sim_state._add_event(f"Action: {msg}", "info")
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'list_set':
            lst = self.get_input_value(node, 'list')
            idx = int(self.get_input_value(node, 'index') or 0)
            val = self.get_input_value(node, 'value')
            if isinstance(lst, list) and 0 <= idx < len(lst):
                lst[idx] = val
            elif isinstance(lst, list) and idx == len(lst):
                lst.append(val)
                
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            out_port = next((p for p in node.get('outputs', []) if p.get('key') == 'list'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = lst
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'list_add':
            lst = self.get_input_value(node, 'list')
            val = self.get_input_value(node, 'value')
            if isinstance(lst, list):
                lst.append(val)
            
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            out_port = next((p for p in node.get('outputs', []) if p.get('key') == 'list'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = lst
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'list_remove_at':
            lst = self.get_input_value(node, 'list')
            idx = int(self.get_input_value(node, 'index') or 0)
            if isinstance(lst, list) and 0 <= idx < len(lst):
                lst.pop(idx)
            
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            out_port = next((p for p in node.get('outputs', []) if p.get('key') == 'list'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = lst
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'ai_eval':
            model_name = self.get_input_value(node, 'model_name')
            system_prompt = self.get_input_value(node, 'system_prompt')
            prompt = self.get_input_value(node, 'prompt')

            if self.sim_state:
                self.sim_state._add_event(f"AI Eval: {prompt[:100]}...", "info")

            # Get before status
            before_files = set(self._get_git_changed_files())

            # Call AI (blocks)
            try:
                response = AI_Eval(
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    model_name=model_name
                )
            except Exception as e:
                logger.error(f"AI_Eval failed: {e}")
                response = f"Error: {str(e)}"

            # Get after status
            after_files = set(self._get_git_changed_files())
            
            # Detect files that became modified or were newly created
            # Note: This won't detect if an already modified file was changed again,
            # but it will detect files that are currently modified.
            # Let's just return all currently modified files as 'changed_files' for simplicity,
            # or the delta if we want to be more specific.
            # User said "list of files that were changed by this llm call".
            # The delta (after - before) is a good start.
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

        elif node_type == 'map_set':
            map_obj = self.get_input_value(node, 'map')
            key = self.get_input_value(node, 'key')
            val = self.get_input_value(node, 'value')
            if isinstance(map_obj, dict):
                map_obj[key] = val
            
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            out_port = next((p for p in node.get('outputs', []) if p.get('key') == 'map'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = map_obj
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'map_remove':
            map_obj = self.get_input_value(node, 'map')
            key = self.get_input_value(node, 'key')
            if isinstance(map_obj, dict) and key in map_obj:
                del map_obj[key]
            
            if out_port:
                self.output_cache[node['id']][out_port['id']] = map_obj
            return self.follow_flow(node, 'exec_out')

        elif node_type == 'list_clear':
            lst = self.get_input_value(node, 'list')
            if isinstance(lst, list):
                lst.clear()
            
            if node['id'] not in self.output_cache: self.output_cache[node['id']] = {}
            out_port = next((p for p in node.get('outputs', []) if p.get('key') == 'list'), None)
            if out_port:
                self.output_cache[node['id']][out_port['id']] = lst
            return self.follow_flow(node, 'exec_out')

        else:
            # Fallback for unknown nodes with standard exec_out
            return self.follow_flow(node, 'exec_out')

    def execute_function(self, function_id, args):
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
            'args': args
        })

        # Set up new context
        self.nodes = {n['id']: n for n in graph_data.get('nodes', [])}
        self.connections = graph_data.get('connections', [])
        self.output_cache = {}

        try:
            entry_node = self.find_entry_node()
            if entry_node:
                self.execute_node(entry_node)
        finally:
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

        # Cache it
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
