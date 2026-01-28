import unittest
from unittest.mock import MagicMock, patch, mock_open
import os
import sys

# Mock google.genai before importing modules that use it
mock_google = MagicMock()
mock_genai = MagicMock()
mock_google.genai = mock_genai
sys.modules['google'] = mock_google
sys.modules['google.genai'] = mock_genai

# Add repo root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from source.agents.observer import ObserverAgent
from source.simulation_state import SimulationState

class TestObserverAgent(unittest.TestCase):

    @patch('source.agents.observer.AI_Eval')
    @patch('os.walk')
    @patch('os.path.exists')
    @patch('os.path.isdir')
    def test_observe_workspace(self, mock_isdir, mock_exists, mock_walk, mock_ai_eval):
        # Setup mocks
        mock_exists.return_value = True # Gallium exists
        mock_isdir.return_value = True

        # Mock os.walk to return some structure
        # root, dirs, files
        mock_walk.return_value = [
            ('.', ['gallium', 'docs'], ['README.md']),
            ('./gallium', [], ['main.c']),
            ('./docs', [], ['intro.md'])
        ]

        # Mock file reading
        m = mock_open(read_data="Some documentation content.")
        with patch('builtins.open', m):
            # Mock AI_Eval response
            mock_ai_eval.return_value = '```json\n{"score": 0.85, "feedback": "Good docs."}\n```'

            agent = ObserverAgent()
            score, feedback = agent.observe_workspace()

            self.assertEqual(score, 0.85)
            self.assertEqual(feedback, "Good docs.")

            # Verify AI_Eval was called
            mock_ai_eval.assert_called_once()
            call_args = mock_ai_eval.call_args
            self.assertIn("Gallium Exists: Yes", call_args.kwargs['user_prompt'])
            self.assertIn("README.md", call_args.kwargs['user_prompt'])

    @patch('source.agents.observer.ObserverAgent.observe_workspace')
    def test_observer_tick(self, mock_observe):
        mock_observe.return_value = (0.9, "Excellent work.")

        sim = SimulationState()

        # We inject a fresh agent just in case
        agent = ObserverAgent()
        sim.agents["Observer"] = agent

        # We want to test tick() directly first
        agent.tick(sim)

        self.assertEqual(sim.layer_0_weights["Documentation"], 0.9)
        self.assertEqual(sim.events[-1]["message"], "Excellent work.")
        self.assertEqual(sim.events[-1]["type"], "observer")

    @patch('source.agents.observer.ObserverAgent.observe_workspace')
    def test_simulation_step_integration(self, mock_observe):
        mock_observe.return_value = (0.75, "Decent.")

        sim = SimulationState()
        # Mock the agent instance in sim
        agent = ObserverAgent()
        sim.agents["Observer"] = agent

        # Step 1
        sim.step()

        self.assertEqual(sim.tick_count, 1)
        mock_observe.assert_called_once()

        # Check if event was added
        found_observer_event = False
        for e in sim.events:
            if e["type"] == "observer" and e["message"] == "Decent.":
                found_observer_event = True
                break
        self.assertTrue(found_observer_event)

        # Step 2
        sim.step()
        self.assertEqual(sim.tick_count, 2)
        # Should not be called again
        mock_observe.assert_called_once()

if __name__ == '__main__':
    unittest.main()
