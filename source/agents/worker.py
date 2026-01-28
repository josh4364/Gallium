import inspect
from pathlib import Path
from source.ai_system import AI_Eval
import source.tools as tools_module

SYSTEM_PROMPT_PATH = Path(__file__).parent / "worker_prompt.md"

def get_worker_tools():
    """Retrieve all available tools from the tools module."""
    tool_list = []
    for name, obj in inspect.getmembers(tools_module):
        if inspect.isfunction(obj) and not name.startswith('_'):
            tool_list.append(obj)
    return tool_list

def run_worker_task(task: str, context: dict = None, use_fallback: bool = False):
    """
    Executes a worker task using the AI_Eval system.
    
    Args:
        task: The specific task description for the worker.
        context: Optional dictionary of context (file contents, previous steps, etc).
        use_fallback: Whether to force CLI fallback.
        
    Returns:
        The text response from the worker.
    """
    if not SYSTEM_PROMPT_PATH.exists():
         raise FileNotFoundError(f"Worker system prompt not found at {SYSTEM_PROMPT_PATH}")
    
    system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding='utf-8')
    worker_tools = get_worker_tools()
    
    # We can inject the task as the "User Prompt" for the AI_Eval
    response = AI_Eval(
        system_prompt=system_prompt,
        user_prompt=task,
        context_data=context,
        tools=worker_tools,
        model_name="gemini-3-flash-preview", 
        use_fallback=use_fallback
    )
    
    return response
