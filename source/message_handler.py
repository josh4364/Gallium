import logging
import time
import os
from source import tools

logger = logging.getLogger("MessageHandler")

def handle_message(msg, server, sim_state, current_auto_mode):
    """
    Handles a single message from the client.
    Returns:
        bool: New state for auto_mode (True/False). 
              If None, auto_mode remains unchanged.
    """
    # Log messages
    logger.info(f"Received from Web Client: {msg}")
    
    if not isinstance(msg, dict):
        return current_auto_mode
        
    msg_type = msg.get("type")

    # Handle Start Simulation
    if msg_type == "start_simulation":
        logging.info("Starting simulation...")
        new_state = sim_state.start_simulation()
        server.broadcast({
            "type": "state_update",
            "data": new_state
        })

    # Handle Restart Simulation
    elif msg_type == "restart_simulation":
        logging.info("Restarting simulation...")
        new_state = sim_state.start_simulation()
        server.broadcast({
            "type": "state_update",
            "data": new_state
        })

    # Handle Step Action
    elif msg_type == "step_simulation":
        logging.info("Stepping simulation...")
        new_state = sim_state.step()
        server.broadcast({
            "data": new_state
        })

    # Handle Prompt Response
    elif msg_type == "prompt_response":
        choice = msg.get("choice")
        logging.info(f"Received prompt response: {choice}")
        sim_state.handle_prompt_response(choice)
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })

    # Handle Auto Start
    elif msg_type == "start_auto":
        logging.info("Auto-run started")
        if sim_state.tick_count == 0:
            sim_state.start_simulation()
            server.broadcast({
                "type": "state_update",
                "data": sim_state.get_state()
            })
        return True # Enable auto mode

    # Handle Auto Stop
    elif msg_type == "stop_auto":
        logging.info("Auto-run stopped")
        return False # Disable auto mode
    
    # Handle Initial State Request
    elif msg_type == "get_state":
            server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
            })

    # Handle Get Functions List
    elif msg_type == "get_functions":
        funcs = sim_state.func_manager.get_function_list()
        server.broadcast({
            "type": "function_list",
            "functions": funcs
        })

    # Handle Load Function Data
    elif msg_type == "load_function":
        func_id = msg.get("id")
        data = sim_state.func_manager.load_function(func_id)
        server.broadcast({
            "type": "function_data",
            "id": func_id,
            "data": data
        })

    # Handle Save Function
    elif msg_type == "save_function":
        func_id = msg.get("id")
        graph_data = msg.get("graph")
        success = sim_state.func_manager.save_function(func_id, graph_data)
        server.broadcast({
            "type": "save_response",
            "id": func_id,
            "success": success
        })
    
    # Handle Delete Function
    elif msg_type == "delete_function":
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
    elif msg_type == "get_structs":
        structs = sim_state.struct_manager.get_all_structs_data()
        server.broadcast({
            "type": "struct_list",
            "structs": structs
        })

    # Handle Save Struct
    elif msg_type == "save_struct":
        struct_id = msg.get("id")
        struct_data = msg.get("data")
        success = sim_state.struct_manager.save_struct(struct_id, struct_data)
        server.broadcast({
            "type": "struct_save_response",
            "id": struct_id,
            "success": success
        })

    # Handle Delete Struct
    elif msg_type == "delete_struct":
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
    elif msg_type == "get_files":
        try:
            req_path = msg.get("path", "")
            target_dir = os.path.join(os.getcwd(), req_path)
            # Use tools module usually, or os.listdir
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
    elif msg_type == "read_file":
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
    elif msg_type == "update_workflow_hooks":
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

    return current_auto_mode
