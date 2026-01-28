import json
from google import genai
from google.genai import types

KEY_FILE = "keys.json"

def get_current_weather(location: str) -> str:
    """Returns the current weather.

    Args:
        location: The city and state, e.g. San Francisco, CA
    """
    print("get_current_weather called " + location)
    return 'sunny'

try:
    with open(KEY_FILE, 'r') as f:
        data = json.load(f)
        api_key = data.get("gemini_api_key")
        client = genai.Client(api_key=api_key)

        # List all models
        print("Available models:")
        for m in client.models.list():
            print(m)
            print("\n")

        # Standard generated content
        response = client.models.generate_content(
            #model="gemini-3-flash-preview",
            model="gemini-2.5-flash",
            contents="Generate a hello world in C"
        )
        print(response.text)

        # Tool calling example
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents='What is the weather like in Boston?',
            config=types.GenerateContentConfig(
                tools=[get_current_weather],
            ),
        )

        print(response.text)

        print("response:\n")
        print(response.usage_metadata)
        print(response.usage_metadata.total_token_count)


        client.close()
except Exception as e:
    print(f"Error: {e}")



