import json
import logging
import os
from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GeminiLLM")

from source.base_llm import LLMClient

class GeminiClient(LLMClient):
    def __init__(self, api_key=None, model_name="gemini-2.0-flash"):
        super().__init__(model_name)
        if not api_key:
            # Try to load from keys.json in root if not provided
            try:
                # Assuming this file is in source/, so root is one level up
                base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                key_path = os.path.join(base_path, "keys.json")
                if os.path.exists(key_path):
                    with open(key_path, 'r') as f:
                        data = json.load(f)
                        api_key = data.get("gemini_api_key")
            except Exception as e:
                self.logger.error(f"Failed to load keys.json: {e}")
        
        if not api_key:
            # Check environment variable as fallback
            api_key = os.environ.get("GEMINI_API_KEY")

        if not api_key:
            raise ValueError("API Key not found. Please provide api_key, set GEMINI_API_KEY env var, or put it in keys.json")

        self.client = genai.Client(api_key=api_key)

    def _convert_openai_to_gemini(self, messages):
        """
        Converts OpenAI-style message history to Gemini Content objects.
        """
        gemini_history = []
        
        for msg in messages:
            role = msg.get('role')
            content_text = msg.get('content')
            
            parts = []
            if content_text:
                parts.append(types.Part(text=content_text))
                
            if role == 'system':
                continue
                
            elif role == 'user':
                if parts:
                    gemini_history.append(types.Content(role="user", parts=parts))
                    
            elif role == 'tool':
                # OpenAI tool response -> Gemini user message with function_response
                f_name = msg.get('name')
                f_response = msg.get('content')
                
                # Try to parse response as dict, else string
                try:
                    resp_dict = json.loads(f_response)
                except:
                    resp_dict = {"result": f_response}

                parts = [types.Part(
                    function_response=types.FunctionResponse(
                        name=f_name,
                        response=resp_dict
                    )
                )]
                gemini_history.append(types.Content(role="user", parts=parts))

            elif role == 'assistant':
                # Check for tool calls
                tool_calls = msg.get('tool_calls')
                if tool_calls:
                    for tc in tool_calls:
                        fn = tc['function']
                        try:
                            args = json.loads(fn['arguments'])
                        except:
                            args = {}
                            
                        parts.append(types.Part(
                            function_call=types.FunctionCall(
                                name=fn['name'],
                                args=args
                            )
                        ))
                
                if parts:
                    gemini_history.append(types.Content(role="model", parts=parts))
        
        return gemini_history

    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=100):
        """
        Runs a chat turn starting with the provided history.
        
        Args:
            messages: List of dicts (OpenAI format). Must include the new user message at the end.
            tools_schema: List of tool definitions.
            tool_registry: Dict mapping tool names to callables.
            
        Returns:
            (response_text, updated_messages_list)
        """
        # Extract system prompt if present
        system_prompt = "You are a helpful assistant."
        cleaned_messages = []
        for m in messages:
            if m.get('role') == 'system':
                system_prompt = m.get('content', '')
            else:
                cleaned_messages.append(m)
                
        # Prepare tools
        gemini_tools_config = None
        if tools_schema:
            function_declarations = []
            for tool in tools_schema:
                if 'function' in tool:
                    function_declarations.append(tool['function'])
                else:
                    function_declarations.append(tool)
            
            if function_declarations:
                gemini_tools = [types.Tool(function_declarations=function_declarations)]
                gemini_tools_config = gemini_tools

        config = types.GenerateContentConfig(
            tools=gemini_tools_config,
            system_instruction=system_prompt,
            temperature=0.7,
        )

        # Separate the last user message to be sent as the trigger
        history_msgs = []
        last_msg = None
        
        if cleaned_messages:
            last_msg = cleaned_messages[-1]
            if last_msg.get('role') == 'user':
                history_msgs = cleaned_messages[:-1]
            else:
                # If last msg is assistant or tool, we might be in a loop or something.
                history_msgs = cleaned_messages
                last_msg = None # No new message to send
        
        converted_history = self._convert_openai_to_gemini(history_msgs)
        
        try:
            chat = self.client.chats.create(
                model=self.model_name, 
                config=config, 
                history=converted_history
            )
            
            current_turn = 0
            
            # Initial Send
            if last_msg and last_msg['role'] == 'user':
                self.logger.info(f"User: {last_msg['content']}")
                response = chat.send_message(last_msg['content'])
            else:
                if not last_msg:
                     return None, messages
                response = chat.send_message(last_msg.get('content', ''))

            # Loop for tool calls
            while current_turn < max_turns:
                current_parts = response.candidates[0].content.parts if (
                    response.candidates and 
                    response.candidates[0].content and 
                    response.candidates[0].content.parts
                ) else []
                
                function_calls = [p.function_call for p in current_parts if p.function_call]
                
                if function_calls:
                    # 1. Prepare Assistant Message (OpenAI format)
                    assistant_txt = ""
                    try:
                        assistant_txt = response.text
                    except:
                        pass
                        
                    assistant_msg = {
                        "role": "assistant",
                        "content": assistant_txt,
                        "tool_calls": []
                    }
                    
                    # Generate unique IDs for this turn's tool calls
                    call_ids = [f"call_{fc.name}_{current_turn}_{i}" for i, fc in enumerate(function_calls)]
                    
                    for i, fc in enumerate(function_calls):
                        assistant_msg["tool_calls"].append({
                            "id": call_ids[i],
                            "type": "function",
                            "function": {
                                "name": fc.name,
                                "arguments": json.dumps(fc.args)
                            }
                        })
                    
                    messages.append(assistant_msg)
                    self.logger.info(f"Agent calls: {[fc.name for fc in function_calls]}")
                    
                    # 2. Execute all tools and prepare Gemini response parts
                    gemini_response_parts = []
                    
                    for i, fc in enumerate(function_calls):
                        args = fc.args
                        self.logger.info(f"Executing tool: {fc.name}({args})")
                        
                        result_data = {}
                        try:
                            if tool_registry and fc.name in tool_registry:
                                raw_result = tool_registry[fc.name](**args)
                                try:
                                    # Try to parse as JSON if it's a string, otherwise use as-is if it's already a dict
                                    if isinstance(raw_result, str):
                                        result_data = json.loads(raw_result)
                                    else:
                                        result_data = raw_result
                                except:
                                    result_data = {"result": raw_result}
                            else:
                                result_data = {"error": f"Tool {fc.name} not found"}
                        except Exception as e:
                            self.logger.error(f"Error executing tool {fc.name}: {e}")
                            result_data = {"error": str(e)}

                        self.logger.info(f"Tool Result: {result_data}")

                        # 3. Add Tool Response to return messages (OpenAI format)
                        messages.append({
                            "role": "tool",
                            "tool_call_id": call_ids[i],
                            "name": fc.name,
                            "content": json.dumps(result_data)
                        })
                        
                        # Add to Gemini response parts
                        gemini_response_parts.append(
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=fc.name,
                                    response=result_data
                                )
                            )
                        )

                    # 4. Send back to Gemini
                    # Passing a list of parts instead of a Content object
                    response = chat.send_message(gemini_response_parts)
                    current_turn += 1
                else:
                    # Text response
                    try:
                        txt = response.text
                    except:
                        txt = "No text response received."
                        
                    messages.append({
                        "role": "assistant",
                        "content": txt
                    })
                    self.logger.info(f"Agent: {txt}")
                    return txt, messages
                    
            err_msg = f"Agent turn hit tool call limit of {max_turns}"
            self.logger.warning(err_msg)
            messages.append({"role": "assistant", "content": err_msg})
            return err_msg, messages

        except Exception as e:
            self.logger.error(f"Error calling Gemini API: {e}")
            raise

if __name__ == "__main__":
    # Test Block
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

    print("Running Gemini Test...")
    try:
        client = GeminiClient()
        # Test basic run_agent
        # res, msgs = client.run_agent("What is the weather in Seattle?", tool_registry=registry, tools_schema=schema)
        # print("Final Result:", res)
        
        # Test stateful run_chat
        hist = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "My name is Josh."}
        ]
        res1, hist1 = client.run_chat(hist)
        print("Response 1:", res1)
        
        hist1.append({"role": "user", "content": "What is my name?"})
        res2, hist2 = client.run_chat(hist1)
        print("Response 2:", res2)
        
    except Exception as e:
        print("Test failed:", e)
