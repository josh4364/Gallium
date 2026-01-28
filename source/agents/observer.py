import os
import json
import logging
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

    def observe_workspace(self, root_dir="."):
        """
        Analyzes the workspace structure and documentation.
        Returns:
            tuple: (score (float), feedback (str))
        """
        gallium_exists = os.path.exists(os.path.join(root_dir, "gallium")) and os.path.isdir(os.path.join(root_dir, "gallium"))

        file_structure = []
        documentation_content = []

        # Traverse directory for structure and docs
        exclude_dirs = {'.git', '.vscode', '__pycache__', '.gemini'}

        for root, dirs, files in os.walk(root_dir):
            # Modify dirs in-place to exclude unwanted directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]

            level = root.replace(root_dir, '').count(os.sep)
            indent = ' ' * 4 * (level)
            file_structure.append(f"{indent}{os.path.basename(root)}/")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                file_structure.append(f"{subindent}{f}")

                # Check for documentation
                if f.lower() == "readme.md" or (root.endswith("docs") and f.endswith(".md")):
                    try:
                        with open(os.path.join(root, f), 'r', encoding='utf-8') as doc_file:
                            content = doc_file.read()
                            # Truncate content if too large to avoid massive context
                            if len(content) > 5000:
                                content = content[:5000] + "...(truncated)"
                            documentation_content.append(f"--- File: {os.path.join(root, f)} ---\n{content}\n")
                    except Exception as e:
                        logger.warning(f"Failed to read doc file {f}: {e}")

        tree_str = "\n".join(file_structure)
        docs_str = "\n".join(documentation_content)

        system_prompt = (
            "You are a software documentation auditor. Evaluate the documentation quality (0.0 to 1.0) "
            "based on the file structure and provided documentation content. "
            "Check if the 'gallium' directory exists (it is a key component). "
            "If 'gallium' is missing, the score should likely be lower unless other docs are excellent. "
            "Output strict JSON with keys: 'score' (float) and 'feedback' (string)."
        )

        user_prompt = (
            f"Gallium Exists: {'Yes' if gallium_exists else 'No'}\n"
            f"File Structure:\n{tree_str}\n\n"
            f"Documentation Content:\n{docs_str}"
        )

        try:
            response_text = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model_name="gemini-3-flash-preview" # Using flash for speed/cost as it's an observer
            )

            # clean response if it contains markdown code blocks
            clean_text = response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            data = json.loads(clean_text)
            score = float(data.get("score", 0.5))
            feedback = data.get("feedback", "No feedback provided.")

            # Clamp score
            score = max(0.0, min(1.0, score))

            return score, feedback

        except Exception as e:
            logger.error(f"AI_Eval failed or JSON parse error: {e}")
            return 0.0, f"Error evaluating documentation: {e}"
