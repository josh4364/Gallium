import random
import logging
from datetime import datetime
from source.agents.observer import ObserverAgent

logger = logging.getLogger("SimulationState")

class SimulationState:
    def __init__(self):
        self.tick_count = 0
        self.events = []
        self.layer_0_weights = {
            "Develop-Feature": 0.5,
            "Refactor-Cleanup": 0.2,
            "Fix-Bugs": 0.1,
            "Improve-Tooling": 0.1,
            "Documentation": 0.1
        }
        # In the future, these will be actual Agent objects
        self.agents = {
            "Layer0_Decision": None,
            "Layer1_Sequencer": None,
            "Layer2_Decoder": None,
            "Layer3_Action": None,
            "Observer": ObserverAgent()
        }
        self.observer_metrics = {
            "context_saturation": 0.2, # 0.0 to 1.0
            "technical_debt": 0.1,     # 0.0 to 1.0
            "velocity": 0.8            # 0.0 to 1.0 (Normalized)
        }

    def _add_event(self, message, event_type="info"):
        event = {
            "id": len(self.events),
            "tick": self.tick_count,
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "message": message
        }
        self.events.append(event)
        # Keep log size manageable for now
        if len(self.events) > 1000:
            self.events = self.events[-1000:]
        return event

    def step(self):
        """
        Advances the simulation by one tick.
        """
        self.tick_count += 1
        
        # 0. Observer Logic (First tick only for now)
        if self.tick_count == 1 and self.agents["Observer"]:
            try:
                self.agents["Observer"].tick(self)
            except Exception as e:
                logger.error(f"Observer tick failed: {e}")

        # 1. Update Layer 0 Weights (Simulated for now)
        self._simulate_weight_fluctuation()

        # 2. Update Observer Metrics (Simulated)
        self._simulate_observer_metrics()

        # 3. Log key events
        # Determine the highest priority goal
        primary_goal = max(self.layer_0_weights, key=self.layer_0_weights.get)
        
        # Add an event about the tick
        self._add_event(f"Tick {self.tick_count} complete. Focus: {primary_goal}")

        return self.get_state()

    def _simulate_weight_fluctuation(self):
        """Randomly adjusts weights to visualize change."""
        changes = {k: random.uniform(-0.05, 0.05) for k in self.layer_0_weights}
        
        for k, change in changes.items():
            self.layer_0_weights[k] = max(0.0, min(1.0, self.layer_0_weights[k] + change))
            
        # Normalize to sum to 1.0 (approximately)
        total = sum(self.layer_0_weights.values())
        if total > 0:
            for k in self.layer_0_weights:
                self.layer_0_weights[k] /= total

    def _simulate_observer_metrics(self):
        """Randomly adjusts observer metrics."""
        # Context saturation tends to go up slowly
        self.observer_metrics["context_saturation"] += random.uniform(-0.01, 0.05)
        self.observer_metrics["context_saturation"] = max(0.0, min(1.0, self.observer_metrics["context_saturation"]))
        
        # Tech debt changes slowly
        self.observer_metrics["technical_debt"] += random.uniform(-0.02, 0.02)
        self.observer_metrics["technical_debt"] = max(0.0, min(1.0, self.observer_metrics["technical_debt"]))

        # Velocity fluctuates
        self.observer_metrics["velocity"] += random.uniform(-0.1, 0.1)
        self.observer_metrics["velocity"] = max(0.0, min(1.0, self.observer_metrics["velocity"]))

    def get_state(self):
        """Returns the current state of the simulation for the client."""
        return {
            "tick": self.tick_count,
            "weights": self.layer_0_weights,
            "observer_metrics": self.observer_metrics,
            "latest_events": self.events[-10:] # Send last 10 events for efficiency
        }
