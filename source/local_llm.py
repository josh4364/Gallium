import requests
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalLLM")

from source.base_llm import LLMClient

class LocalLlamaClient(LLMClient):
    def __init__(self, api_url="http://127.0.0.1:8080/v1/chat/completions", model_name="current-model"):
        super().__init__(model_name)
        self.api_url = api_url

    def call_api(self, messages, tools=None, tool_choice="auto"):
        # Pre-process messages to ensure 'content' is never None/null for local backends
        processed_messages = []
        for msg in messages:
            m = msg.copy()
            if m.get('content') is None:
                m['content'] = ""
            processed_messages.append(m)

        payload = {
            "model": self.model_name,
            "messages": processed_messages,
            "tools": tools if tools else [],
            "tool_choice": tool_choice if tools else None
        }

        try:
            response = requests.post(
                self.api_url,
                headers={"Content-Type": "application/json"},
                json=payload
            )
            if response.status_code == 500:
                try:
                    error_data = response.json()
                    err_msg = error_data.get("error", {}).get("message", "")
                    if "requires --jinja flag" in err_msg:
                        self.logger.error("CRITICAL: The local llama-server MUST be started with the '--jinja' flag to support tool calling.")
                        raise RuntimeError(f"Server configuration error: {err_msg}")
                except (json.JSONDecodeError, KeyError):
                    pass
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            self.logger.error(f"HTTP Error calling local Llama API: {e}")
            if e.response is not None:
                self.logger.error(f"Response Body: {e.response.text}")
            raise
        except Exception as e:
            self.logger.error(f"Error calling local Llama API: {e}")
            raise

    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=100):
        # Local client doesn't have state, so we just continue from the provided list
        
        # Safety Check: Some backends (llama-server) fail 500 if history ends in Assistant.
        if messages and messages[-1].get('role') == 'assistant':
            self.logger.info("Local Provider Safety: Coercing final 'assistant' message to 'user' before API call.")
            messages[-1] = messages[-1].copy()
            messages[-1]['role'] = 'user'

        for i in range(max_turns):
            response_data = self.call_api(messages, tools=tools_schema)
            
            choice = response_data['choices'][0]
            message = choice['message']
            
            # Ensure content is at least an empty string for history consistency
            if message.get('content') is None:
                message['content'] = ""
                
            tool_calls = message.get('tool_calls', [])
            
            if tool_calls:
                # Add the assistant's call message to history
                messages.append(message)

                for tool in tool_calls:
                    function_name = tool['function']['name']
                    function_args = tool['function']['arguments']
                    call_id = tool['id']
                    
                    self.logger.info(f"Agent wants to call: {function_name}({function_args})")

                    try:
                        args_dict = json.loads(function_args)
                        if tool_registry and function_name in tool_registry:
                            result_content = tool_registry[function_name](**args_dict)
                        else:
                            result_content = json.dumps({"error": f"Tool {function_name} not found"})
                    except json.JSONDecodeError:
                        result_content = json.dumps({"error": "Failed to decode function arguments"})
                    except Exception as e:
                        result_content = json.dumps({"error": str(e)})

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": function_name,
                        "content": result_content
                    })
                
                # Continue loop to send results back
                continue
            else:
                # Final answer
                content = message.get('content')
                messages.append(message)
                self.logger.info(f"Agent: {content}")
                return content, messages

        err_msg = f"Agent turn hit tool call limit of {max_turns}"
        self.logger.warning(err_msg)
        messages.append({"role": "assistant", "content": err_msg})
        return err_msg, messages

# Example usage/testing block
if __name__ == "__main__":
    def get_weather(location):
        return json.dumps({"location": location, "temperature": "72F", "condition": "Sunny"})

    def get_time(location):
        return json.dumps({"location": location, "time": "2:30 PM"})

    registry = {
        "get_weather": get_weather,
        "get_time": get_time
    }

    schema = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get the current weather for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "The city and state"}
                    },
                    "required": ["location"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_time",
                "description": "Get the current time for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"}
                    },
                    "required": ["location"]
                }
            }
        }
    ]

    client = LocalLlamaClient()
    # To test, one would need the server running.
    # client.run_agent("What is the weather in Seattle?", tool_registry=registry, tools_schema=schema)
