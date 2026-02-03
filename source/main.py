import sys
import os
import json
import logging
import time
import webbrowser
from pathlib import Path
from source.web_server import GalliumWebServer
from source.simulation_state import SimulationState
from source import tools

# Import the new handler
try:
    from source.message_handler import handle_message
except ImportError:
    # During dev if files aren't synced yet?
    pass

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

def main():
    load_environment()
    # Capture Initial CWD as System Root (for graphs/manifests)
    system_root = os.getcwd()

    # Check for Workspace Root Argument
    if len(sys.argv) > 1:
        workspace_path = sys.argv[1]
        try:
            abs_workspace = os.path.abspath(workspace_path)
            
            if not os.path.exists(abs_workspace):
                try:
                    os.makedirs(abs_workspace, exist_ok=True)
                    logging.info(f"Created new workspace directory: {abs_workspace}")
                except OSError as e:
                    print(f"Error creating directory '{abs_workspace}': {e}")
                    return

            if not os.path.isdir(abs_workspace):
                print(f"Error: Provided workspace path '{abs_workspace}' is not a directory.")
                return
            
            os.chdir(abs_workspace)
            logging.info(f"Set Workspace Root to: {abs_workspace}")
        except Exception as e:
            logging.error(f"Failed to change directory to '{workspace_path}': {e}")
            return
    else:
        logging.info(f"No workspace argument provided. Using current directory: {os.getcwd()}")
    
    # Initialize Simulation State with the captured system root
    sim_state = SimulationState(system_root=system_root)

    # Web Server Loop

    print("\n--- Gallium Web Server ---")
    server = GalliumWebServer()
    
    # Wire up event streaming
    def stream_event(event):
        msg_type = "info"
        if event["type"] == "error":
            msg_type = "error"
        elif event["type"] == "warn":
             # Frontend doesn't explicit handle 'warn' type message, but we can prefix
             event["message"] = f"[WARN] {event['message']}"
        elif event["type"] == "user_prompt":
             server.broadcast(event)
             return
        elif event["type"] == "ui_yield":
             server.broadcast(event)
             return
        
        server.broadcast({
            "type": msg_type,
            "message": event["message"]
        })
        
    sim_state.set_event_handler(stream_event)

    try:
        url = server.start()
        print(f"Server started at: {url}")
        
        # Attempt to open browser
        try:
            webbrowser.open(url)
        except Exception:
            logging.warning("Could not open default browser.")

        logging.info("Entering main loop. Press Ctrl+C to exit.")
        auto_mode = False

        while True:
            msgs = server.get_messages()
            for msg in msgs:
                # Use the extracted handler
                handle_message(msg, server, sim_state)

            if sim_state.auto_run:
                new_state = sim_state.step()
                server.broadcast({
                    "type": "state_update",
                    "data": new_state
                })
                time.sleep(1.0)
            else:
                time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()
        print("Server stopped.")

if __name__ == "__main__":
    main()
