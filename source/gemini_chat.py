import os
import json
from gemini_client import GeminiAgent

KEY_FILE = "keys.json"

def load_api_key():
    try:
        with open(KEY_FILE, 'r') as f:
            data = json.load(f)
            return data.get("gemini_api_key")
    except FileNotFoundError:
        print(f"Error: {KEY_FILE} not found.")
        return None
    except json.JSONDecodeError:
        print(f"Error: Failed to decode {KEY_FILE}.")
        return None

def main():
    api_key = load_api_key()
    if not api_key:
        print("Could not load API key. Exiting.")
        return

    agent = GeminiAgent(api_key=api_key)
    chat = agent.start_chat()

    print("----------------------------------------")
    print("Welcome to the Gemini Chat Application!")
    print("Type 'exit' or 'quit' to end the session.")
    print("----------------------------------------")

    while True:
        user_input = input("You: ")
        if user_input.lower() in ['exit', 'quit']:
            break
        
        if not user_input.strip():
            continue

        try:
            # Using the abstraction with retry logic
            response = chat.prompt(user_input, stream=True)
            print("Gemini: ", end="", flush=True)
            for chunk in response:
                print(chunk.text, end="", flush=True)
            print() # Newline after response
        except Exception as e:
            print(f"\nError: {e}")

if __name__ == "__main__":
    main()
