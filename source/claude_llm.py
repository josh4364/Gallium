import requests
import json
import logging
import os
from source.base_llm import LLMClient

class ClaudeClient(LLMClient):
    def __init__(self, api_key=None, model_name="claude-3-5-sonnet-20241022"):
        super().__init__(model_name)
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.api_url = "https://api.anthropic.com/v1/messages"

    def _convert_to_anthropic(self, messages):
        """Converts OpenAI format to Anthropic format."""
        anthropic_messages = []
        system_prompt = None
        
        for msg in messages:
            role = msg.get('role')
            content = msg.get('content')
            
            if role == 'system':
                system_prompt = content
                continue
            
            if role == 'user':
                anthropic_messages.append({"role": "user", "content": content})
            elif role == 'assistant':
                # Handle tool calls in assistant message if present
                tool_calls = msg.get('tool_calls')
                if tool_calls:
                    anthropic_content = []
                    if content:
                        anthropic_content.append({"type": "text", "text": content})
                    for tc in tool_calls:
                        anthropic_content.append({
                            "type": "tool_use",
                            "id": tc['id'],
                            "name": tc['function']['name'],
                            "input": json.loads(tc['function']['arguments'])
                        })
                    anthropic_messages.append({"role": "assistant", "content": anthropic_content})
                else:
                    anthropic_messages.append({"role": "assistant", "content": content})
            elif role == 'tool':
                # OpenAI tool response -> Anthropic user message with tool_result
                tool_result = {
                    "type": "tool_result",
                    "tool_use_id": msg.get('tool_call_id'),
                    "content": content
                }
                # Anthropic requires tool_result to be in a user message
                # If the previous message was a user message with tool_results, we append to it
                if anthropic_messages and anthropic_messages[-1]['role'] == 'user' and isinstance(anthropic_messages[-1]['content'], list):
                    anthropic_messages[-1]['content'].append(tool_result)
                else:
                    anthropic_messages.append({"role": "user", "content": [tool_result]})
                    
        return system_prompt, anthropic_messages

    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=100):
        if not self.api_key:
            raise ValueError("Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable.")

        current_openai_messages = list(messages)
        
        for i in range(max_turns):
            system_prompt, anth_messages = self._convert_to_anthropic(current_openai_messages)
            
            payload = {
                "model": self.model_name,
                "messages": anth_messages,
                "max_tokens": 4096
            }
            if system_prompt:
                payload["system"] = system_prompt
            
            if tools_schema:
                anth_tools = []
                for tool in tools_schema:
                    fn = tool['function']
                    anth_tools.append({
                        "name": fn['name'],
                        "description": fn['description'],
                        "input_schema": fn['parameters']
                    })
                payload["tools"] = anth_tools

            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }

            try:
                response = requests.post(self.api_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                self.logger.error(f"Claude API call failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                     self.logger.error(f"Response: {e.response.text}")
                raise

            # Anthropic response
            # content is a list of blocks
            text_content = ""
            tool_use_blocks = []
            for block in data['content']:
                if block['type'] == 'text':
                    text_content += block['text']
                elif block['type'] == 'tool_use':
                    tool_use_blocks.append(block)

            # Convert back to OpenAI format for history
            assistant_msg = {
                "role": "assistant",
                "content": text_content if text_content else None
            }
            if tool_use_blocks:
                assistant_msg["tool_calls"] = []
                for block in tool_use_blocks:
                    assistant_msg["tool_calls"].append({
                        "id": block['id'],
                        "type": "function",
                        "function": {
                            "name": block['name'],
                            "arguments": json.dumps(block['input'])
                        }
                    })

            current_openai_messages.append(assistant_msg)

            if tool_use_blocks:
                for block in tool_use_blocks:
                    func_name = block['name']
                    args = block['input']
                    call_id = block['id']

                    self.logger.info(f"Claude calling tool: {func_name}({args})")
                    try:
                        if tool_registry and func_name in tool_registry:
                            result = tool_registry[func_name](**args)
                            if not isinstance(result, str):
                                result = json.dumps(result)
                        else:
                            result = json.dumps({"error": f"Tool {func_name} not found"})
                    except Exception as e:
                        result = json.dumps({"error": str(e)})

                    current_openai_messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": func_name,
                        "content": result
                    })
                continue
            else:
                return text_content, current_openai_messages

        err_msg = f"Agent turn hit tool call limit of {max_turns}"
        self.logger.warning(err_msg)
        current_openai_messages.append({"role": "assistant", "content": err_msg})
        return err_msg, current_openai_messages
