import logging
import inspect
from source.ai_system import AI_Eval
import source.tools as tools_module

logger = logging.getLogger("ActionAgent")

class ActionAgent:
    def __init__(self):
        self.model_name = "gemini-3-flash-preview"

    def get_action_tools(self):
        """Retrieve all available tools from the tools module."""
        tool_list = []
        for name, obj in inspect.getmembers(tools_module):
            if inspect.isfunction(obj) and not name.startswith('_'):
                tool_list.append(obj)
        return tool_list

    def tick(self, simulation_state, subtask_name: str, feedback: str = None):
        """
        Layer 3 Action logic.
        Performs a single AI_Eval call to complete an atomic subtask.
        """
        logger.info(f"Action tick started for subtask: {subtask_name}")
        simulation_state._add_event(f"Layer 3: Executing action '{subtask_name}'...", "info")

        # Get context: chunks and tasks for broader awareness but strict directive
        system_prompt = f"""You are a Layer 3 Action Agent.
Your role is to perform a SINGLE ATOMIC WORK TASK.

TASK TO EXECUTE: "{subtask_name}"

Your goal is to complete this task and ONLY this task using the tools provided.
Do not start other tasks. 

If this is a retry, here is the FEEDBACK from the previous attempt:
{feedback if feedback else "No feedback provided (first attempt)."}

Use your tools (edit_file, run_command, etc.) to perform the work.
"""

        user_prompt = f"Executing subtask: '{subtask_name}'. Please perform the work now."
        action_tools = self.get_action_tools()

        try:
            # Single AI_Eval call
            response = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                tools=action_tools,
                model_name=self.model_name
            )
            
            # Post result to Layer 2 Mailbox
            result = {
                "subtask": subtask_name,
                "response": response,
                "status": "completed"
            }
            simulation_state._post_to_mailbox("Layer2", result)
            
            simulation_state._add_event(f"Layer 3: Completed '{subtask_name}'. Posted to Layer 2 Mailbox.", "info")
            return response

        except Exception as e:
            logger.error(f"Action execution failed: {e}")
            simulation_state._add_event(f"Action Error: {e}", "error")
            return None
