import os
import json
import logging
import zlib
from google import genai

logger = logging.getLogger("ObserverAgent")

class ObserverAgent:
    def __init__(self):
        self.tokenizer = None
        self.model_name = "gemini-2.5-flash"

    def tick(self, simulation_state):
        """
        Runs the observer logic for a tick.
        Updates the simulation state with documentation score, feedback, and file metrics.
        """
        logger.info("Observer tick started.")
        
        # 1. Update File Metrics (Tokens, CRC)
        self.update_source_metrics(simulation_state)

        # 2. Doc Score Observation
        score, feedback = self.observe_workspace()

        # Update documentation score
        simulation_state.layer_0_weights["Documentation"] = score

        # Broadcast feedback
        simulation_state._add_event(feedback, event_type="observer")
        logger.info(f"Observer tick complete. Score: {score}, Feedback: {feedback}")

    def update_source_metrics(self, simulation_state, root_dir="."):
        """
        Scans source directory and updates token counts/CRCs.
        """
        if self.tokenizer is None:
            # Note: google.genai does not currently provide a LocalTokenizer in this version.
            # We use a placeholder or heuristic to avoid crashing the simulation.
            self.tokenizer = "heuristic"

        source_dir = os.path.join(root_dir, "source")
        if not os.path.exists(source_dir):
            return

        current_metrics = simulation_state.source_file_metrics
        new_metrics = {}

        for r, d, f in os.walk(source_dir):
            for file in f:
                full_path = os.path.join(r, file)
                rel_path = os.path.relpath(full_path, root_dir)
                
                # Skip __pycache__ or other hidden dirs if rel_path contains them
                if "__pycache__" in rel_path or "/." in rel_path:
                    continue

                crc = self.calculate_crc(full_path)
                
                # Check if we need to re-tokenize
                cached = current_metrics.get(rel_path)
                if cached and cached.get("crc") == crc:
                    new_metrics[rel_path] = cached
                else:
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f_content:
                            text = f_content.read()
                            if self.tokenizer == "heuristic":
                                # Rough estimate: 4 characters per token
                                tokens = len(text) // 4
                            else:
                                tokens = self.tokenizer.count_tokens(text).total_tokens
                            new_metrics[rel_path] = {
                                "crc": crc,
                                "tokens": tokens
                            }
                    except Exception as e:
                        logger.warning(f"Failed to calculate tokens for {rel_path}: {e}")
                        new_metrics[rel_path] = {
                            "crc": crc,
                            "tokens": 0
                        }

        simulation_state.source_file_metrics = new_metrics

    def calculate_crc(self, filepath):
        """Calculates CRC32 of a file, returning hex string."""
        try:
            with open(filepath, 'rb') as f:
                return format(zlib.crc32(f.read()) & 0xFFFFFFFF, '08x')
        except Exception as e:
            logger.warning(f"Failed to calculate CRC for {filepath}: {e}")
            return None

    def observe_workspace(self, root_dir="."):
        """
        Analyzes the workspace structure and documentation.
        Returns:
            tuple: (score (float), feedback (str))
        """
        gallium_dir = os.path.join(root_dir, "gallium")
        gallium_exists = os.path.exists(gallium_dir) and os.path.isdir(gallium_dir)

        if not gallium_exists:
            return 1.0, "Gallium directory missing. Full documentation setup required."

        # Check for project.md
        project_md_path = os.path.join(gallium_dir, "project.md")
        project_md_exists = os.path.exists(project_md_path)

        # Check Manifest and Source Files
        manifest_path = os.path.join(gallium_dir, "manifest.json")
        manifest_map = {}
        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Support list of objects [{"file": "...", "crc": "..."}]
                    if isinstance(data, list):
                        for item in data:
                            if "file" in item and "crc" in item:
                                manifest_map[item["file"]] = item["crc"]
                    # Support dict {"file": "crc"}
                    elif isinstance(data, dict):
                         # If it's a simple dict of file:crc
                         manifest_map = data
            except Exception as e:
                logger.warning(f"Failed to read/parse manifest.json: {e}")

        # Scan source files
        source_dir = os.path.join(root_dir, "source")
        actual_files = []
        if os.path.exists(source_dir):
            for r, d, f in os.walk(source_dir):
                for file in f:
                    full_path = os.path.join(r, file)
                    rel_path = os.path.relpath(full_path, root_dir)
                    actual_files.append(rel_path)

        total_files = len(actual_files)
        undocumented_count = 0
        changed_count = 0

        for f_path in actual_files:
            if f_path not in manifest_map:
                undocumented_count += 1
            else:
                current_crc = self.calculate_crc(os.path.join(root_dir, f_path))
                if current_crc != manifest_map[f_path]:
                    changed_count += 1

        file_rot_ratio = 0.0
        if total_files > 0:
            file_rot_ratio = (undocumented_count + changed_count) / total_files

        # Calculate Score
        # Formula: 0.0-1.0 (FileRot) + 1.0 (No Manifest) + 1.0 (No ProjectMD)
        score = file_rot_ratio
        
        manifest_exists = os.path.exists(manifest_path)
        if not manifest_exists:
            score += 1.0
            
        if not project_md_exists:
            score += 1.0

        # Generate Feedback (Static)
        feedback = ""
        if score == 0.0:
            feedback = "Documentation is up to date."
        elif not project_md_exists:
            feedback = "Project documentation (project.md) is missing."
        elif file_rot_ratio > 0.5:
             feedback = "Significant documentation drift detected (over 50% files undocumented/changed)."
        elif undocumented_count > 0:
             feedback = f"Found {undocumented_count} undocumented new files."
        elif changed_count > 0:
             feedback = f"Found {changed_count} modified files requiring documentation update."
        else:
             feedback = f"Documentation Score: {score:.2f}."

        return score, feedback
