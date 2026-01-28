import os
import json
import logging
import zlib
from source.ai_system import AI_Eval

logger = logging.getLogger("ObserverAgent")

class ObserverAgent:
    def __init__(self):
        pass

    def tick(self, simulation_state):
        """
        Runs the observer logic for a tick.
        Updates the simulation state with documentation score and feedback.
        """
        logger.info("Observer tick started.")
        score, feedback = self.observe_workspace()

        # Update documentation score
        # Assuming we replace the weight directly
        simulation_state.layer_0_weights["Documentation"] = score

        # Broadcast feedback
        simulation_state._add_event(feedback, event_type="observer")
        logger.info(f"Observer tick complete. Score: {score}, Feedback: {feedback}")

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
        # Formula: (Missing ProjectMD ? 0.25 : 0) + (0.75 * FileRot)
        project_md_penalty = 0.25 if not project_md_exists else 0.0
        score = project_md_penalty + (0.75 * file_rot_ratio)
        score = max(0.0, min(1.0, score))

        # Generate Feedback using LLM
        system_prompt = (
            "You are a software documentation auditor. "
            "I have calculated the documentation score based on strict metrics. "
            "Your job is to generate a concise, constructive feedback message explaining the score."
        )

        user_prompt = (
            f"Documentation Score: {score:.2f} (1.0 = Needs Documentation, 0.0 = Perfect)\n"
            f"Gallium Directory: Present\n"
            f"Project Spec (project.md): {'Present' if project_md_exists else 'MISSING'}\n"
            f"Source Files Analysis:\n"
            f"- Total Files: {total_files}\n"
            f"- Undocumented Files: {undocumented_count}\n"
            f"- Changed/Outdated Files: {changed_count}\n"
            f"Please provide a 1-2 sentence feedback message for the development team."
        )

        try:
            feedback = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model_name="gemini-3-flash-preview"
            )
            return score, feedback.strip()

        except Exception as e:
            logger.error(f"AI_Eval failed for feedback generation: {e}")
            return score, f"Score: {score:.2f}. Project MD: {project_md_exists}. Files: {total_files}, Bad: {undocumented_count+changed_count}."
