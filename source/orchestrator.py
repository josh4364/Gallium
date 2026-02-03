
import logging
from source.schemas import Event

logger = logging.getLogger("Orchestrator")

class OrchState:
    IDLE = "IDLE"

class Orchestrator:
    def __init__(self, simulation_state):
        self.sim_state = simulation_state
        self.current_state = OrchState.IDLE

    def start(self):
        self.current_state = OrchState.IDLE

    def handle_event(self, event: Event):
        # Legacy event handling removed. 
        # Workflows are now managed via SimulationState.threads
        pass
