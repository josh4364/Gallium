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
                # Log messages
                logging.info(f"Received from Web Client: {msg}")
                
                # Handle Start Simulation
                if isinstance(msg, dict) and msg.get("type") == "start_simulation":
                    logging.info("Starting simulation...")
                    new_state = sim_state.start_simulation()
                    server.broadcast({
                        "type": "state_update",
                        "data": new_state
                    })

                # Handle Restart Simulation
                elif isinstance(msg, dict) and msg.get("type") == "restart_simulation":
                    logging.info("Restarting simulation...")
                    new_state = sim_state.start_simulation()
                    server.broadcast({
                        "type": "state_update",
                        "data": new_state
                    })

                # Handle Step Action
                elif isinstance(msg, dict) and msg.get("type") == "step_simulation":
                    logging.info("Stepping simulation...")
                    new_state = sim_state.step()
                    server.broadcast({
                        "data": new_state
                    })

                # Handle Prompt Response
                elif isinstance(msg, dict) and msg.get("type") == "prompt_response":
                    choice = msg.get("choice")
                    logging.info(f"Received prompt response: {choice}")
                    sim_state.handle_prompt_response(choice)
                    server.broadcast({
                        "type": "state_update",
                        "data": sim_state.get_state()
                    })

                # Handle Auto Start
                elif isinstance(msg, dict) and msg.get("type") == "start_auto":
                    logging.info("Auto-run started")
                    if sim_state.tick_count == 0:
                        sim_state.start_simulation()
                        server.broadcast({
                            "type": "state_update",
                            "data": sim_state.get_state()
                        })
                    auto_mode = True

                # Handle Auto Stop
                elif isinstance(msg, dict) and msg.get("type") == "stop_auto":
                    logging.info("Auto-run stopped")
                    auto_mode = False
                
                # Handle Initial State Request
                elif isinstance(msg, dict) and msg.get("type") == "get_state":
                     server.broadcast({
                        "type": "state_update",
                        "data": sim_state.get_state()
                     })

                # Handle Get Functions List
                elif isinstance(msg, dict) and msg.get("type") == "get_functions":
                    funcs = sim_state.func_manager.get_function_list()
                    server.broadcast({
                        "type": "function_list",
                        "functions": funcs
                    })

                # Handle Load Function Data
                elif isinstance(msg, dict) and msg.get("type") == "load_function":
                    func_id = msg.get("id")
                    data = sim_state.func_manager.load_function(func_id)
                    server.broadcast({
                        "type": "function_data",
                        "id": func_id,
                        "data": data
                    })

                # Handle Save Function
                elif isinstance(msg, dict) and msg.get("type") == "save_function":
                    func_id = msg.get("id")
                    graph_data = msg.get("graph")
                    success = sim_state.func_manager.save_function(func_id, graph_data)
                    server.broadcast({
                        "type": "save_response",
                        "id": func_id,
                        "success": success
                    })
                
                # Handle Delete Function
                elif isinstance(msg, dict) and msg.get("type") == "delete_function":
                    func_id = msg.get("id")
                    success = sim_state.delete_function(func_id)
                    server.broadcast({
                        "type": "delete_response",
                        "id": func_id,
                        "success": success
                    })
                    # Send updated state in case hooks were cleared
                    server.broadcast({
                        "type": "state_update",
                        "data": sim_state.get_state()
                    })

                # Handle Get Structs List
                elif isinstance(msg, dict) and msg.get("type") == "get_structs":
                    structs = sim_state.struct_manager.get_all_structs_data()
                    server.broadcast({
                        "type": "struct_list",
                        "structs": structs
                    })

                # Handle Save Struct
                elif isinstance(msg, dict) and msg.get("type") == "save_struct":
                    struct_id = msg.get("id")
                    struct_data = msg.get("data")
                    success = sim_state.struct_manager.save_struct(struct_id, struct_data)
                    server.broadcast({
                        "type": "struct_save_response",
                        "id": struct_id,
                        "success": success
                    })

                # Handle Delete Struct
                elif isinstance(msg, dict) and msg.get("type") == "delete_struct":
                    struct_id = msg.get("id")
                    success = sim_state.struct_manager.delete_struct(struct_id)
                    server.broadcast({
                        "type": "struct_delete_response",
                        "id": struct_id,
                        "success": success
                    })
                    # Send updated struct list
                    structs = sim_state.struct_manager.get_all_structs_data()
                    server.broadcast({
                        "type": "struct_list",
                        "structs": structs
                    })
                     
                # Handle File List Request
                elif isinstance(msg, dict) and msg.get("type") == "get_files":
                    try:
                        req_path = msg.get("path", "")
                        target_dir = os.path.join(os.getcwd(), req_path)
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
                        logging.error(f"Error reading file: {e}")
                        server.broadcast({
                            "type": "error",
                            "message": f"Failed to read file: {str(e)}"
                        })

                # Handle Workflow Hooks Update
                elif isinstance(msg, dict) and msg.get("type") == "update_workflow_hooks":
                    try:
                        new_state = sim_state.update_workflow_hooks(
                            msg.get("on_start"), 
                            msg.get("on_tick")
                        )
                        logging.info(f"Updated workflow hooks: {sim_state.workflow_hooks}")
                        server.broadcast({
                            "type": "state_update",
                            "data": new_state
                        })
                    except Exception as e:
                        logging.error(f"Error updating workflow hooks: {e}")

            if auto_mode:
                new_state = sim_state.step()
                server.broadcast({
                    "type": "state_update",
                    "data": new_state
                })
                time.sleep(0.01)
            else:
                time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()
        print("Server stopped.")

if __name__ == "__main__":
    main()
