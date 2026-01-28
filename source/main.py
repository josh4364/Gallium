import sys
import os
import json
import logging
from pathlib import Path


# Configure Logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("google_genai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

# Path to keys.json
PROJECT_ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = PROJECT_ROOT / "keys.json"

def load_environment():
    """Ensure API key is in environment for AI_Eval"""
    try:
        with open(KEY_FILE, 'r') as f:
            data = json.load(f)
            api_key = data.get("gemini_api_key")
            if api_key:
                os.environ["GEMINI_API_KEY"] = api_key
            else:
                logging.warning(f"Key 'gemini_api_key' not found in {KEY_FILE}")
    except Exception as e:
        # If keys.json missing, hopefully it's already in env
        logging.warning(f"Could not load keys.json: {e}")

import time
import webbrowser
from source.web_server import GalliumWebServer

def main():
    load_environment()
    
    # Web Server Loop

    print("\n--- Gallium Web Server ---")
    server = GalliumWebServer()
    try:
        url = server.start()
        print(f"Server started at: {url}")
        
        # Attempt to open browser
        try:
            webbrowser.open(url)
        except Exception:
            logging.warning("Could not open default browser.")

        logging.info("Entering main loop. Press Ctrl+C to exit.")
        while True:
            msgs = server.get_messages()
            for msg in msgs:
                logging.info(f"Received from Web Client: {msg}")
            
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()
        print("Server stopped.")

if __name__ == "__main__":
    main()
