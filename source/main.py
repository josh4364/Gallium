import sys
import os
import json
import inspect
import logging
from pathlib import Path
from google import genai
from agents.worker import Worker

# Configure Logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("google_genai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

# Path to keys.json (located in project root, parent of source)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = PROJECT_ROOT / "keys.json"

def load_api_key():
    try:
        with open(KEY_FILE, 'r') as f:
            data = json.load(f)
            return data.get("gemini_api_key")
    except Exception as e:
        print(f"Error loading API key from {KEY_FILE}: {e}")
        return None

def main():
    api_key = load_api_key()
    if not api_key:
        print("API Key not found. Exiting.")
        return

    # Create the main Gemini Client
    client = genai.Client(api_key=api_key)

    # Define the specific task
    task = "List the files in the current directory."

    # Create Worker Agent
    print(f"Initializing Worker Agent...")
    print(f"Task: {task}")

    try:
        worker = Worker(client=client, task=task)
    except Exception as e:
        print(f"Failed to initialize Worker: {e}")
        return

    chat = worker.start_chat()

    print("\n--- Output ---\n")
    try:
        # Send a trigger message to start the task execution
        response = chat.prompt("Please proceed with the assigned task.", stream=False)
        
        if response.text:
            print(response.text)
        
        # Handle manual tool calls checking if text was empty or if we have explicit parts
        if hasattr(response, 'candidates'):
            for candidate in response.candidates:
                if hasattr(candidate, 'content') and candidate.content and hasattr(candidate.content, 'parts'):
                    for part in candidate.content.parts:
                        if hasattr(part, 'function_call') and part.function_call:
                            args = part.function_call.args
                            print(f"\n[Calling tool: {part.function_call.name}{args}]\n", flush=True)

        print("\n")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        # ... rest of error handling ...
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            print("\n" + "="*40)
            print("API QUOTA EXHAUSTED")
            print("="*40)
            
            # Attempt to extract detailed quota info
            import re
            
            # Pattern for "Quota exceeded for metric: <metric>, limit: <limit>, model: <model>"
            # and potentially "quotaValue": "20" from the JSON structure
            
            # Extract simple text messages first
            lines = error_str.split('\\n')
            for line in lines:
                if "Quota exceeded" in line:
                    print(f"- {line.strip()}")
            
            # Attempt to find violations in JSON structure if present
            # Looking for 'quotaMetric': '...', ... 'quotaValue': '...'
            violations = re.findall(r"'quotaMetric':\s*'([^']+)'.*?'quotaValue':\s*'([^']+)'", error_str, re.DOTALL)
            if violations:
                print("\nViolations:")
                for metric, value in violations:
                    print(f"  Metric: {metric}")
                    print(f"  Usage/Limit Hit: {value}")
            
            print("\nProgram exiting due to API rate limit.")
            sys.exit(1)
            
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
