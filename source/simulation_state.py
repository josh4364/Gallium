
import logging
import json
from datetime import datetime
from pathlib import Path
from source.graph_interpreter import GraphInterpreter
from source.function_manager import FunctionManager

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
        self.interpreter = GraphInterpreter(self, self.func_manager)
        self.workflow_hooks = {
            "on_start": None,
            "on_tick": None
        }
        self.workflow_memory = {}
        
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
        
        return self.get_state()

    def get_state(self):
        """Returns the current state of the simulation for the client."""
        return {
            "tick": self.tick_count,
            "workflow_hooks": self.workflow_hooks,
            "workflow_memory": self.workflow_memory,
            "latest_events": self.events[-10:] # Send last 10 events for efficiency
        }

    def update_workflow_hooks(self, on_start, on_tick):
        if on_start is not None:
             self.workflow_hooks["on_start"] = on_start
        if on_tick is not None:
             self.workflow_hooks["on_tick"] = on_tick
        self._save_manifest()
        return self.get_state()

    def delete_function(self, function_id):
        """Deletes a function and clears any hooks using it."""
        success = self.func_manager.delete_function(function_id)
        if success:
            # Clear hooks if they used this function
            hooks_changed = False
            if self.workflow_hooks.get("on_start") == function_id:
                self.workflow_hooks["on_start"] = None
                hooks_changed = True
            if self.workflow_hooks.get("on_tick") == function_id:
                self.workflow_hooks["on_tick"] = None
                hooks_changed = True
            
            if hooks_changed:
                self._save_manifest()
                self._add_event(f"Cleared hooks for deleted function: {function_id}", "info")
        
        return success

    def _load_state_from_manifest(self):
        try:
            manifest_path = self.system_root / "gallium" / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    data = json.load(f)
                    self.workflow_hooks["on_start"] = data.get("hook_on_start")
                    self.workflow_hooks["on_tick"] = data.get("hook_on_tick")
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
                "hook_on_start": self.workflow_hooks["on_start"],
                "hook_on_tick": self.workflow_hooks["on_tick"]
            })

            with open(manifest_path, 'w') as f:
                json.dump(manifest_data, f, indent=4)
        except Exception as e:
            logger.warning(f"Failed to save manifest: {e}")
