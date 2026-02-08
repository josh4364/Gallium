import abc
import logging

class LLMClient(abc.ABC):
    def __init__(self, model_name):
        self.model_name = model_name
        self.logger = logging.getLogger(self.__class__.__name__)

    @abc.abstractmethod
    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=10):
        """
        Runs a chat turn starting with the provided history.
        
        Args:
            messages: List of dicts (OpenAI format).
            tools_schema: List of tool definitions.
            tool_registry: Dict mapping tool names to callables.
            max_turns: Maximum number of internal turns (for tool calling).
            
        Returns:
            (response_text, updated_messages_list)
        """
        pass

    def run_agent(self, user_prompt, system_prompt="You are a helpful assistant.", tool_registry=None, tools_schema=None, max_turns=10):
        """
        Compatibility wrapper for single-turn agent execution.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        return self.run_chat(messages, tools_schema, tool_registry, max_turns)
