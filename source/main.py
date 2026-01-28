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
from source.simulation_state import SimulationState
from source import tools

def main():
    load_environment()
    
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
    
    # Initialize Simulation State
    sim_state = SimulationState()

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
                
                # Handle Step Action
                if isinstance(msg, dict) and msg.get("type") == "step_simulation":
                    logging.info("Stepping simulation...")
                    new_state = sim_state.step()
                    
                    # Broadcast update
                    update_msg = {
                        "type": "state_update",
                        "data": new_state
                    }
                    server.broadcast(update_msg)
                
                # Handle Initial State Request
                elif isinstance(msg, dict) and msg.get("type") == "get_state":
                     server.broadcast({
                        "type": "state_update",
                        "data": sim_state.get_state()
                     })
                     
                # Handle File List Request
                elif isinstance(msg, dict) and msg.get("type") == "get_files":
                    try:
                        # For now, list root. Supports sub-path traversal if needed later.
                        # Client sends relative path?
                        req_path = msg.get("path", "")
                        # Validate? tools.list_dir takes absolute.
                        # We construct absolute from CWD.
                        target_dir = os.path.join(os.getcwd(), req_path)
                        
                        # tools.list_dir does sandbox validation.
                        files = tools.list_dir(target_dir)
                        
                        server.broadcast({
                            "type": "file_list",
                            "path": req_path, 
                            "data": files
                        })
                    except Exception as e:
                        logging.error(f"Error getting file list: {e}")
                        server.broadcast({
                            "type": "error",
                            "message": f"Failed to list files: {str(e)}"
                        })

                # Handle File Read Request
                elif isinstance(msg, dict) and msg.get("type") == "read_file":
                    try:
                        req_path = msg.get("path", "")
                        target_path = os.path.join(os.getcwd(), req_path)
                        
                        content = tools.read_file(target_path)
                        
                        server.broadcast({
                            "type": "file_content",
                            "path": req_path,
                            "data": content
                        })
                    except Exception as e:
                         server.broadcast({
                            "type": "error",
                            "message": f"Failed to read file: {str(e)}"
                        })

            
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()
        print("Server stopped.")

if __name__ == "__main__":
    main()
