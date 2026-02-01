
import logging
import json
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
            "on_tick": None,
            "triage": "func_triage", # Default
            "planner": "func_planner", # Default
            "implementer": "func_implementer" # Default
        }
        self.goal = ""
        self.workflow_memory = {}
        self.orchestrator = Orchestrator(self)
        self.pending_graph_id = None
        self.pending_graph_context = None
        
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
        """Runs the On Start graph."""
        self.tick_count = 0 # Reset tick on start
        self.events = [] # Optional: Clear events on restart? User didn't specify, but often Start means new session.
                         # Actually logging results from On Start to stream suggests keeping them. 
                         # But clearing old events is usually good. I'll NOT clear execution memory but I will reset tick.
        self._add_event("Simulation Started", "info")
        
        self.workflow_memory = {} # Reset memory on start
        
        if self.workflow_hooks.get("on_start"):
            try:
                graph = self.func_manager.load_function(self.workflow_hooks["on_start"])
                if graph:
                    self._add_event(f"Executing On Start Graph: {self.workflow_hooks['on_start']}", "info")
                    self.interpreter.execute(graph, context={"tick": self.tick_count})
                else:
                    self._add_event(f"On Start Graph not found: {self.workflow_hooks['on_start']}", "warn")
            except Exception as e:
                logger.error(f"Error executing On Start graph: {e}")
                self._add_event(f"Start Graph Error: {e}", "error")
        else:
             self._add_event("No On Start graph assigned.", "info")
        
        self.orchestrator.start()
        self.check_pending_execution()
        
        return self.get_state()

    def step(self):
        """Advances the simulation by one tick (On Tick graph)."""
        self.tick_count += 1
        
        if self.workflow_hooks.get("on_tick"):
            try:
                graph = self.func_manager.load_function(self.workflow_hooks["on_tick"])
                if graph:
                    # Pass tick number to the first input, ensuring it's a number
                    self.interpreter.safe_graph_eval(graph, ['number'], [self.tick_count])
            except Exception as e:
                logger.error(f"Error executing On Tick graph: {e}")
                self._add_event(f"Tick Graph Error: {e}", "error")
        
                self._add_event(f"Tick Graph Error: {e}", "error")
        
        self.check_pending_execution()
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
            "orchestrator_state": self.orchestrator.current_state
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
        
        # Store in Blackboard for Triage graph
        self.workflow_memory["latest_user_message"] = message
        
        event = Event(name="USER_MESSAGE", payload={"message": message}, source="user_client")
        self.orchestrator.handle_event(event)
        self.check_pending_execution()

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
