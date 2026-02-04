import logging
import time
import os
import json
from source import tools

logger = logging.getLogger("MessageHandler")

def handle_message(msg, server, sim_state):
    """
    Handles a single message from the client.
    """
    # Log messages
    logger.info(f"Received from Web Client: {msg}")
    
    if not isinstance(msg, dict):
        return
        
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

    # Handle UI Resume
    elif msg_type == "ui_resume":
        payload = msg.get("payload")
        logging.info(f"Received UI resume: {payload}")
        sim_state.handle_ui_resume(payload)
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })

    # Handle Auto Start
    elif msg_type == "start_auto":
        logging.info("Auto-run started")
        sim_state.auto_run = True
        if sim_state.tick_count == 0:
            sim_state.start_simulation()
        
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })

    # Handle Auto Stop
    elif msg_type == "stop_auto":
        logging.info("Auto-run stopped")
        sim_state.auto_run = False
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })
    
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
        
    # Handle Get Agents List
    elif msg_type == "get_agents":
        agents = sim_state.func_manager.get_agent_list()
        server.broadcast({
            "type": "agent_list",
            "agents": agents
        })

    # Handle Load Agent Data
    elif msg_type == "load_agent":
        agent_id = msg.get("id")
        data = sim_state.func_manager.load_agent(agent_id)
        server.broadcast({
            "type": "function_data", # Reuse function_data type for editor compatibility or make new? 
            # If editor uses 'function_data' to load, keeping it same is easier if we just want it to load.
            # But the ID will differ.
            "id": agent_id,
            "data": data,
            "is_agent": True
        })

    # Handle Save Agent
    elif msg_type == "save_agent":
        agent_id = msg.get("id")
        agent_data = msg.get("graph") # Uses 'graph' key from editor usually
        success, new_id = sim_state.func_manager.save_agent(agent_id, agent_data)
        server.broadcast({
            "type": "save_response",
            "id": new_id if new_id else agent_id,
            "success": success,
            "is_agent": True
        })
    
    # Handle Delete Agent
    elif msg_type == "delete_agent":
        agent_id = msg.get("id")
        success = sim_state.func_manager.delete_agent(agent_id)
        server.broadcast({
            "type": "delete_response",
            "id": agent_id,
            "success": success,
            "is_agent": True
        })
        # Send updated agents list
        agents = sim_state.func_manager.get_agent_list()
        server.broadcast({
            "type": "agent_list",
            "agents": agents
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
            "type": "struct_list",
            "structs": sim_state.struct_manager.get_all_structs_data()
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

    # Handle Orchestrator Roles Update
    elif msg_type == "update_orchestrator_roles":
        try:
            new_state = sim_state.update_orchestrator_roles(
                msg.get("triage"),
                msg.get("planner"),
                msg.get("implementer")
            )
            logging.info(f"Updated orchestrator roles: {sim_state.workflow_hooks}")
            server.broadcast({
                "type": "state_update",
                "data": new_state
            })
        except Exception as e:
            logging.error(f"Error updating orchestrator roles: {e}")

    # Handle Get LLM Connections
    elif msg_type == "get_llm_connections":
        conn_path = sim_state.system_root / "gallium" / "connections.json"
        data = {}
        if conn_path.exists():
            try:
                with open(conn_path, 'r') as f:
                    data = json.load(f)
            except Exception as e:
                logging.error(f"Failed to load connections.json: {e}")
        
        server.broadcast({
            "type": "llm_connections",
            "data": data
        })

    # Handle Save LLM Config
    elif msg_type == "save_llm_config":
        provider = msg.get("provider")
        config = msg.get("config")
        
        if provider and config:
            conn_path = sim_state.system_root / "gallium" / "connections.json"
            data = {}
            if conn_path.exists():
                try:
                    with open(conn_path, 'r') as f:
                        data = json.load(f)
                except: pass
            
            data[provider] = config
            
            try:
                # Ensure dir exists
                if not conn_path.parent.exists():
                    conn_path.parent.mkdir(parents=True, exist_ok=True)
                    
                with open(conn_path, 'w') as f:
                    json.dump(data, f, indent=4)
                    
                server.broadcast({
                    "type": "save_llm_response",
                    "provider": provider,
                    "success": True
                })
            except Exception as e:
                logging.error(f"Failed to save connection config: {e}")
                server.broadcast({
                    "type": "save_llm_response",
                    "provider": provider,
                    "success": False,
                    "error": str(e)
                })

    # Handle User Chat Message
    elif msg_type == "user_message":
        message = msg.get("message")
        if message:
            sim_state.handle_user_message(message)
            sim_state.auto_run = True # Resume if message sent
            server.broadcast({
                "type": "state_update",
                "data": sim_state.get_state()
            })

    # Handle Clear Active Thread
    elif msg_type == "clear_active_thread":
        sim_state.active_thread_id = None
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })

    # Handle Start Goal (Workflow Instance)
    elif msg_type == "start_goal":
        prompt = msg.get("prompt")
        workflow_id = msg.get("agent_id") # Frontend sends workflow ID as 'agent_id' currently
        if prompt and workflow_id:
            new_state = sim_state.handle_start_goal(prompt, workflow_id)
            if new_state:
                sim_state.auto_run = True
                server.broadcast({
                    "type": "state_update",
                    "data": new_state
                })
                logging.info("Auto-run enabled via start_goal")

    # Handle Save Workflow
    elif msg_type == "save_workflow":
        name = msg.get("name")
        data = msg.get("data")
        success = sim_state.func_manager.save_workflow(name, data)
        server.broadcast({
            "type": "save_response",
            "id": f"workflow_{name}", # Approximation
            "success": success,
            "is_workflow": True
        })
        # Send updated list
        workflows = sim_state.func_manager.get_workflow_list()
        server.broadcast({
            "type": "workflow_list",
            "workflows": workflows
        })

    # Handle Get Workflows
    elif msg_type == "get_workflows":
        workflows = sim_state.func_manager.get_workflow_list()
        server.broadcast({
            "type": "workflow_list",
            "workflows": workflows
        })

    # Handle Load Workflow
    elif msg_type == "load_workflow":
        wf_id = msg.get("id")
        data = sim_state.func_manager.load_workflow(wf_id)
        server.broadcast({
            "type": "workflow_data",
            "id": wf_id,
            "data": data
        })

    # Handle Delete Workflow
    elif msg_type == "delete_workflow":
        wf_id = msg.get("id")
        success = sim_state.func_manager.delete_workflow(wf_id)
        server.broadcast({
            "type": "delete_response",
            "id": wf_id,
            "success": success,
            "is_workflow": True
        })
        # Send updated list
        workflows = sim_state.func_manager.get_workflow_list()
        server.broadcast({
            "type": "workflow_list",
            "workflows": workflows
        })

    # Handle Delete Thread
    elif msg_type == "delete_thread":
        thread_id = msg.get("id")
        success = sim_state.delete_thread(thread_id)
        server.broadcast({
            "type": "state_update",
            "data": sim_state.get_state()
        })

    # Handle Switch Active Thread
    elif msg_type == "switch_thread":
        thread_id = msg.get("id")
        if thread_id in sim_state.threads:
            sim_state.active_thread_id = thread_id
            server.broadcast({
                "type": "state_update",
                "data": sim_state.get_state()
            })
