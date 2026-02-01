
import logging
from source.schemas import Event

logger = logging.getLogger("Orchestrator")

class OrchState:
    IDLE = "IDLE"
    PLANNING = "PLANNING"
    IMPLEMENTATION = "IMPLEMENTATION"
    VERIFICATION = "VERIFICATION"
    DEBUGGING = "DEBUGGING"

class Orchestrator:
    def __init__(self, simulation_state):
        self.sim_state = simulation_state
        self.current_state = OrchState.IDLE

    def start(self):
        """Called when system starts."""
        self._set_state(OrchState.IDLE)

    def handle_event(self, event: Event):
        """
        Main Event Loop Logic.
        Decides state transitions based on incoming events.
        """
        logger.info(f"Orchestrator analyzing event: {event.name} (Current State: {self.current_state})")
        
        if self.current_state == OrchState.IDLE:
            if event.name == "USER_CONNECTED" or event.name == "SIMULATION_START":
                # Maybe run Triage immediately on start? 
                # Or wait for explicit user message?
                pass
            
            # If we receive a user intent event directly (e.g. from a chat interface hooked to events)
            if event.name == "USER_MESSAGE":
                 # Trigger Triage
                 logger.info("User Message received. Triggering Triage Graph.")
                 user_prompt = event.payload.get("message", "")
                 self._run_graph("triage", context={"prompt": user_prompt})
                 
            # If the Triage graph has finished and emitted an intent:
            if event.name.startswith("INTENT_"):
                logger.info(f"Intent detected: {event.name}. Transitioning to PLANNING.")
                self._set_state(OrchState.PLANNING)

        elif self.current_state == OrchState.PLANNING:
            if event.name == "SPEC_APPROVED":
                logger.info("Spec Approved. Transitioning to IMPLEMENTATION.")
                self._set_state(OrchState.IMPLEMENTATION)

        elif self.current_state == OrchState.IMPLEMENTATION:
            if event.name == "TASK_FAILED":
                logger.warning("Task Failed. Transitioning to DEBUGGING.")
                self._set_state(OrchState.DEBUGGING)
            elif event.name == "ALL_DONE":
                logger.info("All Tasks Done. Transitioning to IDLE/SUMMARY.")
                self._set_state(OrchState.IDLE)
        
        elif self.current_state == OrchState.DEBUGGING:
            if event.name == "RESUME":
                logger.info("Resuming Implementation loop.")
                self._set_state(OrchState.IMPLEMENTATION)

    def _set_state(self, new_state):
        if self.current_state == new_state:
            return
            
        logger.info(f"FSM Transition: {self.current_state} -> {new_state}")
        self.current_state = new_state
        self._on_state_enter(new_state)

    def _on_state_enter(self, state):
        if state == OrchState.PLANNING:
            self._run_graph("planner")
        elif state == OrchState.IMPLEMENTATION:
            self._run_graph("implementer")
        elif state == OrchState.IDLE:
            # Maybe waiting? 
            pass

    def _run_graph(self, graph_key, context=None):
        graph_id = self.sim_state.workflow_hooks.get(graph_key)
        if not graph_id:
            logger.error(f"No graph ID found for key: {graph_key}")
            return
            
        logger.info(f"Orchestrator requesting execution of graph: {graph_id}")
        self.sim_state.run_graph_by_id(graph_id, context=context)
