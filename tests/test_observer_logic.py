import unittest
from unittest.mock import MagicMock, patch, mock_open
import os
import sys
import zlib

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
    @patch('builtins.open', new_callable=mock_open)
    def test_observe_workspace_no_gallium(self, mock_file, mock_isdir, mock_exists, mock_walk, mock_ai_eval):
        # Setup: No Gallium folder
        mock_exists.side_effect = lambda p: not p.endswith("gallium")
        mock_isdir.return_value = False

        agent = ObserverAgent()
        score, feedback = agent.observe_workspace()

        self.assertEqual(score, 1.0)
        self.assertIn("Gallium directory missing", feedback)
        mock_ai_eval.assert_not_called()

    @patch('source.agents.observer.AI_Eval')
    @patch('os.walk')
    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('zlib.crc32')
    def test_observe_workspace_scoring(self, mock_crc, mock_isdir, mock_exists, mock_walk, mock_ai_eval):
        # Setup: Gallium exists, project.md exists
        # We need to control os.path.exists for specific files
        def side_effect_exists(path):
            if path.endswith("gallium"): return True
            if path.endswith("gallium/project.md"): return True
            if path.endswith("gallium/manifest.json"): return True
            if path.endswith("source"): return True
            return False

        mock_exists.side_effect = side_effect_exists
        mock_isdir.return_value = True

        # Mock os.walk for source files
        # Let's say we have 2 files: file1.py (good), file2.py (undocumented)
        mock_walk.return_value = [
            ('./source', [], ['file1.py', 'file2.py'])
        ]

        # Mock Manifest Content
        manifest_content = '[{"file": "source/file1.py", "crc": "deadbeef"}]'

        # Mock File Reading
        file_mock = mock_open(read_data=manifest_content)
        # We need to handle multiple file opens (manifest vs source files)
        # but since we mock zlib.crc32, we don't strictly need to read source files content for CRC
        # However, calculate_crc opens the file.

        with patch('builtins.open', file_mock):
            # Mock CRC: file1.py matches, file2.py is calculated but irrelevant as not in manifest
            # Wait, logic:
            # Iterate actual files (file1, file2).
            # file1 in manifest? Yes. Calculate CRC.
            # file2 in manifest? No. Undocumented count++.

            # We need to return "deadbeef" for file1 to be OK.
            # zlib.crc32 returns int. deadbeef is hex.
            # int('deadbeef', 16) = 3735928559
            mock_crc.return_value = 3735928559

            mock_ai_eval.return_value = "Feedback message."

            agent = ObserverAgent()
            score, feedback = agent.observe_workspace()

            # Calculation:
            # Total files = 2.
            # Undocumented = 1 (file2).
            # Changed = 0 (file1 matches).
            # Ratio = 1/2 = 0.5.
            # ProjectMD present -> penalty 0.0.
            # Score = 0.0 + (0.75 * 0.5) = 0.375.

            self.assertAlmostEqual(score, 0.375)
            self.assertEqual(feedback, "Feedback message.")

            # Verify AI_Eval context
            call_args = mock_ai_eval.call_args
            self.assertIn("Documentation Score: 0.38", call_args.kwargs['user_prompt']) # 0.375 rounds to 0.38
            self.assertIn("Undocumented Files: 1", call_args.kwargs['user_prompt'])

    @patch('source.agents.observer.AI_Eval')
    @patch('os.walk')
    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('zlib.crc32')
    def test_observe_workspace_missing_project_md(self, mock_crc, mock_isdir, mock_exists, mock_walk, mock_ai_eval):
        # Setup: Gallium exists, project.md MISSING
        def side_effect_exists(path):
            if path.endswith("gallium"): return True
            if path.endswith("gallium/project.md"): return False # MISSING
            if path.endswith("gallium/manifest.json"): return True
            if path.endswith("source"): return True
            return False

        mock_exists.side_effect = side_effect_exists
        mock_isdir.return_value = True

        mock_walk.return_value = [
            ('./source', [], ['file1.py'])
        ]

        # Manifest matches file1
        manifest_content = '[{"file": "source/file1.py", "crc": "deadbeef"}]'

        with patch('builtins.open', mock_open(read_data=manifest_content)):
            mock_crc.return_value = 3735928559 # Matches
            mock_ai_eval.return_value = "Msg"

            agent = ObserverAgent()
            score, feedback = agent.observe_workspace()

            # Calculation:
            # Total = 1. Undoc = 0. Changed = 0. Ratio = 0.0.
            # ProjectMD Missing -> Penalty 0.25.
            # Score = 0.25 + 0 = 0.25.

            self.assertEqual(score, 0.25)

if __name__ == '__main__':
    unittest.main()
