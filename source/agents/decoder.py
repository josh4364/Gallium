import logging
from source.ai_system import AI_Eval
from source import tools

logger = logging.getLogger("DecoderAgent")

class DecoderAgent:
    def __init__(self):
        self.model_name = "gemini-3-flash-preview"

    def tick(self, simulation_state, task_name: str):
        """
        Layer 2 Decoder logic.
        Decomposes a functional task into '5-minute' atomic subtasks (actions).
        """
        if simulation_state._decoding_finished:
            return

        logger.info(f"Decoder tick started for task: {task_name}")
        simulation_state._add_event(f"Layer 2: Decoding task '{task_name}'...", "info")

        # Get context: tasks from layer 1 (to show progress)
        tasks_progress = tools.list_tasks()

        system_prompt = f"""You are a Layer 2 Decoder Agent.
Your role is to take a functional task and decompose it into a sequence of atomic "5-minute" work subtasks.

FUNCTIONAL TASK TO DECODE: "{task_name}"

CONTEXT (LAYER 1 PROGRESS):
{tasks_progress}

Process:
1. RESEARCH the current codebase to understand the technical requirements of this specific task.
2. Use the subtask management tools to define the atomic sequence.
3. Each subtask MUST be small enough to complete in a single AI evaluation (approx 5 mins of work).
4. CLEAR MESSAGE: Your task is ONLY to decode "{task_name}". Do not attempt work outside this scope.

Tools for Decoding:
1. 'add_subtask': Add an atomic 5-minute action.
2. 'list_subtasks': View current subtasks.
3. 'remove_subtask': Delete a mistake.
4. 'finished_decoding': Call this when the atomic sequence is complete.
"""

        user_prompt = f"Please research and decompose the task '{task_name}' into atomic subtasks."

        # Tools list for Decoder
        tools_list = [
            tools.list_dir,
            tools.view_file,
            tools.grep_search,
            tools.add_subtask,
            tools.list_subtasks,
            tools.remove_subtask,
            tools.finished_decoding
        ]

        try:
            response = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                tools=tools_list,
                model_name=self.model_name
            )
            
            if response:
                simulation_state._add_event(f"Layer 2 AI: {response[:200]}...", "info")
                
            return response
        except Exception as e:
            logger.error(f"Decoder tick failed: {e}")
            simulation_state._add_event(f"Decoder Error: {e}", "error")
            return None

    def run_code_review(self, simulation_state, subtask_name, action_result):
        """
        Performs a code review pass on the work done by Layer 3.
        """
        logger.info(f"Running code review for: {subtask_name}")
        
        system_prompt = f"""You are a Senior Reviewer Agent.
Evaluate the following work performed for the subtask: "{subtask_name}"

ACTION RESULT:
{action_result}

Critically evaluate:
1. Does it satisfy the requirements of the atomic subtask?
2. Is the code of high quality and follows conventions?
3. Are there any obvious bugs or regressions?

Return a feedback string. If the work is PERFECT, start your response with "APPROVED".
Otherwise, provide constructive feedback for the next attempt.
"""
        
        try:
            feedback = AI_Eval(
                system_prompt=system_prompt,
                user_prompt="Evaluate the work and provide feedback or approval.",
                model_name=self.model_name
            )
            return feedback
        except Exception as e:
            logger.error(f"Code review failed: {e}")
            return f"Review Error: {e}"
