import requests
import json
import logging
import os
from source.base_llm import LLMClient

class OpenAIClient(LLMClient):
    def __init__(self, api_key=None, model_name="gpt-4o"):
        super().__init__(model_name)
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.api_url = "https://api.openai.com/v1/chat/completions"

    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=100):
        if not self.api_key:
            raise ValueError("OpenAI API key not found. Set OPENAI_API_KEY environment variable.")

        current_messages = list(messages)
        
        for i in range(max_turns):
            payload = {
                "model": self.model_name,
                "messages": current_messages,
            }
            if tools_schema:
                payload["tools"] = tools_schema
                payload["tool_choice"] = "auto"

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            try:
                response = requests.post(self.api_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                self.logger.error(f"OpenAI API call failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                     self.logger.error(f"Response: {e.response.text}")
                raise

            choice = data['choices'][0]
            message = choice['message']
            tool_calls = message.get('tool_calls', [])

            if tool_calls:
                current_messages.append(message)
                for tool in tool_calls:
                    func_name = tool['function']['name']
                    args_str = tool['function']['arguments']
                    call_id = tool['id']

                    self.logger.info(f"OpenAI calling tool: {func_name}({args_str})")
                    try:
                        args = json.loads(args_str)
                        if tool_registry and func_name in tool_registry:
                            result = tool_registry[func_name](**args)
                            if not isinstance(result, str):
                                result = json.dumps(result)
                        else:
                            result = json.dumps({"error": f"Tool {func_name} not found"})
                    except Exception as e:
                        result = json.dumps({"error": str(e)})

                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": func_name,
                        "content": result
                    })
                continue
            else:
                content = message.get('content')
                current_messages.append(message)
                return content, current_messages

        err_msg = f"Agent turn hit tool call limit of {max_turns}"
        self.logger.warning(err_msg)
        current_messages.append({"role": "assistant", "content": err_msg})
        return err_msg, current_messages
