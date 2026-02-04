import json
import logging
import os
from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GeminiLLM")

class GeminiClient:
    def __init__(self, api_key=None, model_name="gemini-2.0-flash"):
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
                logger.error(f"Failed to load keys.json: {e}")
        
        if not api_key:
            # Check environment variable as fallback
            api_key = os.environ.get("GEMINI_API_KEY")

        if not api_key:
            raise ValueError("API Key not found. Please provide api_key, set GEMINI_API_KEY env var, or put it in keys.json")

        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name

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

    def run_chat(self, messages, tools_schema=None, tool_registry=None, max_turns=10):
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
        # If the last message is NOT user, we assume we just want to continue/generate from history?
        # But for 'send_llm_chat_message' node, we usually append a user message then run.
        
        history_msgs = []
        last_msg = None
        
        if cleaned_messages:
            last_msg = cleaned_messages[-1]
            if last_msg.get('role') == 'user':
                history_msgs = cleaned_messages[:-1]
            else:
                # If last msg is assistant or tool, we might be in a loop or something.
                # But Gemini SDK usually expects a User message to trigger generation.
                # If we just want to continue generation... 
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
                logger.info(f"User: {last_msg['content']}")
                response = chat.send_message(last_msg['content'])
            else:
                # Try to generate without input? Not typical for chat.
                # Maybe sending empty string?
                # Or if the last message was a Tool response (user role), we are 'continuing'.
                # But my logic above put Tool responses in history_msgs.
                # If the last thing in history is a Tool Response, we need to send *something* or call generate?
                # Actually, if the last thing is a Tool Response, we should have processed it.
                # Let's assume standard Use Case: User message is the trigger.
                if not last_msg:
                     # Fallback 
                     return None, messages
                response = chat.send_message(last_msg.get('content', ''))

            # Loop for tool calls
            while current_turn < max_turns:
                part = None
                if response.candidates and response.candidates[0].content.parts:
                    part = response.candidates[0].content.parts[0]
                
                if part and part.function_call:
                    # 1. Log Assistant Tool Call
                    fc = part.function_call
                    args = fc.args
                    
                    # Log internally (OpenAI format for return)
                    assistant_msg = {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": "call_" + fc.name,
                            "type": "function",
                            "function": {
                                "name": fc.name,
                                "arguments": json.dumps(args)
                            }
                        }]
                    }
                    messages.append(assistant_msg)
                    
                    logger.info(f"Agent calls: {fc.name}({args})")
                    
                    # 2. Execute Tool
                    result_data = {}
                    try:
                        if tool_registry and fc.name in tool_registry:
                            raw_result = tool_registry[fc.name](**args)
                            try:
                                result_data = json.loads(raw_result)
                            except:
                                result_data = {"result": raw_result}
                        else:
                            result_data = {"error": f"Tool {fc.name} not found"}
                    except Exception as e:
                        result_data = {"error": str(e)}

                    logger.info(f"Tool Result: {result_data}")

                    # 3. Add Tool Response to return messages
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": "call_" + fc.name,
                        "name": fc.name,
                        "content": json.dumps(result_data)
                    }
                    messages.append(tool_msg)
                    
                    # 4. Send back to Gemini
                    response = chat.send_message(
                        types.Content(
                            parts=[
                                types.Part(
                                    function_response=types.FunctionResponse(
                                        name=fc.name,
                                        response=result_data
                                    )
                                )
                            ]
                        )
                    )
                    current_turn += 1
                else:
                    # Text response
                    txt = response.text
                    messages.append({
                        "role": "assistant",
                        "content": txt
                    })
                    logger.info(f"Agent: {txt}")
                    return txt, messages
                    
            return "Max turns reached", messages

        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            raise

    def run_agent(self, user_prompt, system_prompt="You are a helpful assistant.", tool_registry=None, tools_schema=None, max_turns=10):
        # Compatibility wrapper
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        return self.run_chat(messages, tools_schema, tool_registry, max_turns)

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
