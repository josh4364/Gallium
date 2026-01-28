import os
import inspect
from pathlib import Path
from base_agent import Agent
import tools

class Worker(Agent):
    def __init__(self, client, task=None):
        self.name = "Worker"
        
        # Load System Prompt
        prompt_path = Path(__file__).parent / "worker_prompt.md"
        if not prompt_path.exists():
            raise FileNotFoundError(f"System prompt file not found: {prompt_path}")
            
        base_prompt = prompt_path.read_text(encoding='utf-8')
        
        # Append Task
        if task:
            system_instruction = f"{base_prompt}\n\nCURRENT TASK:\n{task}"
        else:
            system_instruction = base_prompt
            
        # Load Tools
        worker_tools = self._get_tools()
        
        # Initialize Base Agent
        super().__init__(
            client=client,
            model_name="gemini-3-flash-preview",
            tools=worker_tools,
            system_instruction=system_instruction
        )
        
    def _get_tools(self):
        tool_list = []
        for name, obj in inspect.getmembers(tools):
            if inspect.isfunction(obj) and not name.startswith('_'):
                tool_list.append(obj)
        return tool_list
