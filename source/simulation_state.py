
import logging
import json
import time
from datetime import datetime
from pathlib import Path
from source.graph_interpreter import GraphInterpreter
from source.function_manager import FunctionManager
from source.graph_interpreter import GraphInterpreter
from source.function_manager import FunctionManager
from source.struct_manager import StructManager
from source.orchestrator import Orchestrator
from source.schemas import Event

logger = logging.getLogger("SimulationState")

class SimulationState:
    def __init__(self, system_root=None):
        self.tick_count = 0
        self.events = []
        self.on_event = None
        
        # Capture the system root (where Gallium was launched)
        self.system_root = Path(system_root).resolve() if system_root else Path.cwd()
        
        # Graph Integration - System root is where we store our system graphs
        self.func_manager = FunctionManager(system_root=self.system_root)
        self.struct_manager = StructManager(system_root=self.system_root)
        self.interpreter = GraphInterpreter(self, self.func_manager, self.struct_manager)
        self.workflow_hooks = {
            "on_start": None,
            "on_tick": None
        }
        self.goal = ""
        self.workflow_memory = {}
        self.orchestrator = Orchestrator(self)
        self.pending_graph_id = None
        self.pending_graph_context = None
        
        # Workflow Engine State
        self.threads = {} # thread_id -> WorkflowInstance dict
        self.active_thread_id = None
        self.auto_run = False
        
        # Manifest State
        self._load_state_from_manifest()

    def set_event_handler(self, handler):
        self.on_event = handler

    def _add_event(self, message, event_type="info"):
        # Log to console
        if event_type == "error":
            logger.error(f"Event: {message}")
        elif event_type == "warn":
            logger.warning(f"Event: {message}")
        else:
            logger.info(f"Event: {message}")

        event = {
            "id": len(self.events),
            "tick": self.tick_count,
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "message": message
        }
        self.events.append(event)
        # Keep log size manageable
        if len(self.events) > 1000:
            self.events = self.events[-1000:]
            
        if self.on_event:
            self.on_event(event)
            
        return event

    def trigger_event(self, event):
        """Pass internal events to Orchestrator."""
        self.orchestrator.handle_event(event)
        self.check_pending_execution()

    def run_graph_by_id(self, graph_id, context=None):
        """Queues a graph for execution."""
        self.pending_graph_id = graph_id
        self.pending_graph_context = context

    def check_pending_execution(self):
        """Runs any queued graphs (and chains them)."""
        loop_guard = 0
        while self.pending_graph_id and loop_guard < 10:
            gid = self.pending_graph_id
            ctx = self.pending_graph_context
            self.pending_graph_id = None
            self.pending_graph_context = None
            
            graph = self.func_manager.load_function(gid)
            if graph:
                self._add_event(f"Orchestrator running graph: {gid}", "info")
                try:
                    self.interpreter.execute(graph, context=ctx)
                except Exception as e:
                    logger.error(f"Error executing orchestrated graph {gid}: {e}")
                    self._add_event(f"Orchestrator Graph Error ({gid}): {e}", "error")
            else:
                 self._add_event(f"Orchestrator could not load graph: {gid}", "error")
            
            loop_guard += 1


    def start_simulation(self):
        """Initializes the simulation state."""
        self.tick_count = 0 # Reset tick on start
        self._add_event("Simulation Started", "info")
        
        self.workflow_memory = {} # Reset memory on start
        
        self.orchestrator.start()
        self.check_pending_execution()
        
        return self.get_state()

    def step(self):
        """Advances the simulation by one tick."""
        self.tick_count += 1
        
        self.check_pending_execution()
        
        # Evaluate dynamic workflow instances
        self._evaluate_workflow_instances()
        
        return self.get_state()

    def get_state(self):
        """Returns the current state of the simulation for the client."""
        return {
            "tick": self.tick_count,
            "goal": self.goal,
            "workflow_hooks": self.workflow_hooks,
            "workflow_memory": self.workflow_memory,
            "latest_events": self.events[-10:], # Send last 10 events for efficiency
            "pending_prompt": self.interpreter.suspended_prompt_data if self.interpreter.is_suspended else None,
            "orchestrator_state": self.orchestrator.current_state,
            "threads": self.threads,
            "active_thread_id": self.active_thread_id,
            "auto_run": self.auto_run
        }

    def update_workflow_hooks(self, on_start, on_tick):
        if on_start is not None:
             self.workflow_hooks["on_start"] = on_start
        if on_tick is not None:
             self.workflow_hooks["on_tick"] = on_tick
        self._save_manifest()
        return self.get_state()

    def update_orchestrator_roles(self, triage, planner, implementer):
        if triage is not None: self.workflow_hooks["triage"] = triage
        if planner is not None: self.workflow_hooks["planner"] = planner
        if implementer is not None: self.workflow_hooks["implementer"] = implementer
        self._save_manifest()
        return self.get_state()

    def delete_function(self, function_id):
        """Deletes a function and clears any hooks using it."""
        success = self.func_manager.delete_function(function_id)
        if success:
            # Clear hooks if they used this function
            hooks_changed = False
            for key in ["on_start", "on_tick", "triage", "planner", "implementer"]:
                if self.workflow_hooks.get(key) == function_id:
                     # For core roles, reverting to default might be safer than None, but None indicates missing.
                     # Let's set to None and warn safely later.
                     self.workflow_hooks[key] = None
                     hooks_changed = True
            
            if hooks_changed:
                self._save_manifest()
                self._add_event(f"Cleared hooks for deleted function: {function_id}", "info")
        
        return success
    
    def send_ui_yield(self, ui_type, payload):
        """
        Pauses execution and requests UI interaction from the client.
        """
        self._add_event(f"UI Yield Triggered: {ui_type}", "info")
        if self.on_event:
            self.on_event({
                "type": "ui_yield",
                "ui_type": ui_type,
                "payload": payload,
                "timestamp": datetime.now().isoformat()
            })

    def handle_ui_resume(self, payload):
        """
        Resumes execution with data from the UI.
        """
        self._add_event("UI Resumed", "info")
        try:
             self.interpreter.resume(payload)
        except Exception as e:
             logger.error(f"Error resuming from UI yield: {e}")
             self._add_event(f"Error Resuming: {e}", "error")
        # Resume might have triggered more events/graphs
        self.check_pending_execution()

    def handle_user_message(self, message):
        """Handle incoming chat message from user."""
        self._add_event(f"User: {message}", "user_message")
        
        # If there is an active thread, add to its memory
        if self.active_thread_id and self.active_thread_id in self.threads:
            instance = self.threads[self.active_thread_id]
            instance["memory"]["latest_user_message"] = message
            
            # Formally track messages
            if "messages" not in instance:
                instance["messages"] = []
            instance["messages"].append({"role": "user", "content": message, "responded": False})
            
            self._add_event(f"Added message to thread {self.active_thread_id} memory", "info")
        else:
            # Fallback to global
            self.workflow_memory["latest_user_message"] = message
        
        self.check_pending_execution()

    def handle_start_goal(self, prompt, workflow_id):
        """Initializes a new workflow instance from a user goal/prompt."""
        self._add_event(f"Starting Goal with workflow {workflow_id}: {prompt}", "info")
        
        # Load workflow
        workflow = self.func_manager.load_workflow(workflow_id)
        if not workflow:
            self._add_event(f"Failed to load workflow: {workflow_id}", "error")
            return None
            
        # Create instance
        thread_id = f"thread_{int(time.time())}"
        instance = {
            "id": thread_id,
            "workflow_id": workflow_id,
            "agent_id": workflow.get("router_agent"),
            "current_state_id": None, # Will be set on first eval
            "memory": {
                "goal": prompt,
                "latest_user_message": prompt,
                "_thread_id": thread_id,
                "roles": workflow.get("roles", [])
            },
            "messages": [
                {"role": "user", "content": prompt, "responded": False}
            ],
            "tick_count": 0,
            "state_tick": 0,
            "status": "active"
        }
        
        self.threads[thread_id] = instance
        self.active_thread_id = thread_id
        
        # Immediate evaluation to enter start state
        self._evaluate_workflow_instances()
        
        return self.get_state()

    def delete_thread(self, thread_id):
        """Removes a thread from history."""
        if thread_id in self.threads:
            del self.threads[thread_id]
            if self.active_thread_id == thread_id:
                self.active_thread_id = next(iter(self.threads)) if self.threads else None
            self._add_event(f"Deleted thread {thread_id}", "info")
            return True
        return False

    def _evaluate_workflow_instances(self):
        """Ticks all active workflow instances."""
        for tid, instance in self.threads.items():
            if instance.get("status") == "active":
                self._evaluate_instance(instance)

    def _evaluate_instance(self, instance):
        """Evaluates one step of a workflow instance (the Agent FSM)."""
        agent_id = instance.get("agent_id")
        if not agent_id:
            return
            
        agent_data = self.func_manager.load_agent(agent_id)
        if not agent_data:
            self._add_event(f"Failed to load agent {agent_id} for thread {instance['id']}", "error")
            instance["status"] = "error"
            return

        # 1. Handle Initial State Transition
        if not instance.get("current_state_id"):
            start_state = next((s for s in agent_data.get("states", []) if s.get("isStart")), None)
            if start_state:
                instance["current_state_id"] = start_state["id"]
                instance["state_tick"] = 0
                state_name = start_state.get('name', 'Start')
                if "messages" not in instance: instance["messages"] = []
                instance["messages"].append({"role": "system", "content": f"Entered state: {state_name}"})
                self._add_event(f"Thread {instance['id']} entered start state: {state_name}", "info")
            else:
                self._add_event(f"Agent {agent_id} has no start state", "error")
                instance["status"] = "error"
                return

        # 2. Get Current State
        current_state_id = instance["current_state_id"]
        current_state = next((s for s in agent_data.get("states", []) if s["id"] == current_state_id), None)
        if not current_state:
            self._add_event(f"Thread {instance['id']} current state {current_state_id} not found", "error")
            instance["status"] = "error"
            return

        # 3. Check Transitions FIRST (to allow for immediate state changes based on inputs)
        # OR should we tick first? User said: "agent state nodes `tick` the function ... and tick number as second arg"
        # Usually we tick the current state, THEN check if it's time to move.
        
        # 3.1 Execute Function for current state
        func_id = current_state.get("function_id")
        if func_id:
            try:
                graph = self.func_manager.load_function(func_id)
                if graph:
                    # Tick graph with (context, tick) as promised
                    # Set the current thread context in the interpreter for node resolution fallback
                    self.interpreter.thread_context = instance["id"]
                    self.interpreter.safe_graph_eval(graph, ['map', 'number'], [instance["memory"], instance["state_tick"]])
                    self.interpreter.thread_context = None # Clear after
                else:
                    logger.warning(f"Function {func_id} not found for state {current_state_id}")
            except Exception as e:
                logger.error(f"Error ticking function {func_id} in state {current_state_id}: {e}")
                self._add_event(f"State Function Error ({func_id}): {e}", "error")

        # 3.2 Check for Transitions
        transitions = [t for t in agent_data.get("transitions", []) if t["from"] == current_state_id]
        for trans in transitions:
            if self._evaluate_conditions(trans.get("conditions", []), instance["memory"]):
                # Transition!
                instance["current_state_id"] = trans["to"]
                instance["state_tick"] = 0
                
                target_state = next((s for s in agent_data.get("states", []) if s["id"] == trans["to"]), None)
                state_name = target_state.get('name', trans["to"]) if target_state else trans["to"]
                if "messages" not in instance: instance["messages"] = []
                instance["messages"].append({"role": "system", "content": f"Transitioned to: {state_name}"})
                
                self._add_event(f"Thread {instance['id']} transitioned to {state_name}", "info")
                return # Only one transition per tick

        # 4. Increment Ticks
        instance["tick_count"] += 1
        instance["state_tick"] += 1

    def _evaluate_conditions(self, conditions, memory):
        """Checks if all conditions in a transition are met."""
        if not conditions:
            # If no conditions, it's an automatic transition? 
            # Usually yes, or maybe after one tick. 
            # In Agent Editor, unconditional transitions might be allowed.
            return True
            
        for cond in conditions:
            key = cond.get("key")
            op = cond.get("op", "==").strip()
            val = cond.get("value")
            
            mem_val = memory.get(key)
            
            # Simple evaluation
            if op == "==":
                if str(mem_val) != str(val): return False
            elif op == "!=":
                if str(mem_val) == str(val): return False
            elif op == ">":
                try:
                    if not float(mem_val) > float(val): return False
                except: return False
            elif op == "<":
                try:
                    if not float(mem_val) < float(val): return False
                except: return False
            elif op == ">=":
                try:
                    if not float(mem_val) >= float(val): return False
                except: return False
            elif op == "<=":
                try:
                    if not float(mem_val) <= float(val): return False
                except: return False
            elif op == "exists":
                if mem_val is None: return False
            elif op == "not exists":
                if mem_val is not None: return False
            else:
                logger.warning(f"Unknown comparison operator: {op}")
                return False
                
        return True

    # Deprecated / Alias for backward compatibility if needed, 
    # but we will update call sites.
    def send_prompt_request(self, title, message):
        self.send_ui_yield("BinaryChoice", {"title": title, "message": message})

    def handle_prompt_response(self, response_bool):
        # The prompt_user node expects a boolean
        self.handle_ui_resume(response_bool)

    def _load_state_from_manifest(self):
        try:
            manifest_path = self.system_root / "gallium" / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    data = json.load(f)
                    self.workflow_hooks["on_start"] = data.get("hook_on_start")
                    self.workflow_hooks["on_tick"] = data.get("hook_on_tick")
                    # Load Orchestrator Roles
                    if "triage" in data: self.workflow_hooks["triage"] = data["triage"]
                    if "planner" in data: self.workflow_hooks["planner"] = data["planner"]
                    if "implementer" in data: self.workflow_hooks["implementer"] = data["implementer"]
                    
                    self.goal = data.get("goal", "")
                    self._add_event("Loaded State from Manifest.", "info")
        except Exception as e:
            logger.warning(f"Failed to load manifest: {e}")

    def _save_manifest(self):
        try:
            gallium_dir = self.system_root / "gallium"
            if not gallium_dir.exists():
                gallium_dir.mkdir(exist_ok=True)
                
            manifest_path = gallium_dir / "manifest.json"
            manifest_data = {}
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    try:
                        manifest_data = json.load(f)
                    except: pass
            
            manifest_data.update({
                "hook_on_start": self.workflow_hooks.get("on_start"),
                "hook_on_tick": self.workflow_hooks.get("on_tick"),
                "triage": self.workflow_hooks.get("triage"),
                "planner": self.workflow_hooks.get("planner"),
                "implementer": self.workflow_hooks.get("implementer"),
                "goal": self.goal
            })

            with open(manifest_path, 'w') as f:
                json.dump(manifest_data, f, indent=4)
        except Exception as e:
            logger.warning(f"Failed to save manifest: {e}")
