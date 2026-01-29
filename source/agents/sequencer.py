import logging
import json
from source.ai_system import AI_Eval

logger = logging.getLogger("SequencerAgent")

class SequencerAgent:
    def __init__(self):
        self.model_name = "gemini-3-flash-preview"

    def tick(self, simulation_state, chunk_name: str):
        """
        Layer 1 Sequencer logic.
        Observes the codebase and breaks the conceptual chunk into functional tasks.
        """
        if simulation_state._sequencing_finished:
            return

        logger.info(f"Sequencer tick started for chunk: {chunk_name}")
        simulation_state._add_event(f"Layer 1: Sequencing chunk '{chunk_name}'...", "info")

        system_prompt = f"""You are a Layer 1 Sequencer Agent.
Your role is to take a high-level conceptual chunk and turn it into functional milestones/tasks.

CHUNK TO SEQUENCE: "{chunk_name}"

Your goal is to split this conceptual chunk into several functional tasks of roughly equal size/complexity.

First, RESEARCH the codebase using the provided file tools to understand what is needed for "{chunk_name}".
Then, use 'add_task' to build the plan.

IMPORTANT:
1. ONLY produce tasks for the assigned chunk: "{chunk_name}".
2. Try to keep tasks balanced in scope.
3. The list of tasks you produce will be fed to the Decoder (Layer 2) to be further broken down.
4. Call 'finished_sequencing' when you have a solid, balanced plan.
"""
        
        user_prompt = f"Please research the codebase and sequence the tasks for the chunk: '{chunk_name}'."
        
        from source import tools
        from source.ai_system import AI_Eval
        
        # Tools including workspace research and task management
        tools_list = [
            tools.list_dir,
            tools.view_file,
            tools.grep_search,
            tools.find_by_name,
            tools.add_task,
            tools.list_tasks,
            tools.remove_task,
            tools.finished_sequencing
        ]

        try:
            response = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                tools=tools_list,
                model_name=self.model_name
            )
            
            if response:
                simulation_state._add_event(f"Layer 1 AI: {response[:200]}...", "info")
                
            return response
        except Exception as e:
            logger.error(f"Sequencer tick failed: {e}")
            simulation_state._add_event(f"Sequencer Error: {e}", "error")
            return None
