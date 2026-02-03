import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("FunctionManager")

class FunctionManager:
    def __init__(self, system_root=None, graphs_dir="graphs"):
        # The system root is where the program was launched. 
        # We store system files (graphs, manifest) in a gallium folder there.
        self.system_root = Path(system_root).resolve() if system_root else Path.cwd()
        
        potential_paths = [
            self.system_root / "gallium" / "graphs",
            self.system_root / "graphs",
            # We also check the current workspace in case someone manually put them there
            Path.cwd() / "gallium" / "graphs",
            Path.cwd() / "graphs",
            Path(graphs_dir).resolve() 
        ]
        
        # Use existing if found
        self.graphs_dir = None
        for p in potential_paths:
            if p.exists() and p.is_dir():
                self.graphs_dir = p
                break
        
        if not self.graphs_dir:
            # Default to gallium/graphs in the system root
            self.graphs_dir = self.system_root / "gallium" / "graphs"
            self.graphs_dir.mkdir(parents=True, exist_ok=True)
            
        logger.info(f"FunctionManager initialized with graphs directory: {self.graphs_dir}")

    def _load_json_file(self, file_path):
        """Helper to load JSON with potential double-serialization check."""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                if isinstance(data, str):
                    try:
                        inner = json.loads(data)
                        if isinstance(inner, (dict, list)):
                            return inner
                    except json.JSONDecodeError:
                        pass
                return data
        except Exception as e:
            logger.error(f"Error loading JSON file {file_path}: {e}")
            return None

    def get_function_list(self):
        """Returns a list of available functions."""
        functions = []
        for file_path in self.graphs_dir.glob("func_*.json"):
            data = self._load_json_file(file_path)
            if isinstance(data, dict):
                functions.append({
                    "id": file_path.stem,
                    "name": data.get("name", file_path.stem),
                    "filename": file_path.name
                })
            else:
                logger.warning(f"File {file_path.name} contains invalid data format")
        return functions

    def get_agent_list(self):
        """Returns a list of available agents."""
        agents = []
        for file_path in self.graphs_dir.glob("agent_*.json"):
            data = self._load_json_file(file_path)
            if isinstance(data, dict):
                agents.append({
                    "id": file_path.stem,
                    "name": data.get("name", file_path.stem),
                    "filename": file_path.name,
                    "description": data.get("description", "")
                })
        return agents

    def get_workflow_list(self):
        """Returns a list of available workflows."""
        workflows = []
        for file_path in self.graphs_dir.glob("workflow_*.json"):
            data = self._load_json_file(file_path)
            if isinstance(data, dict):
                workflows.append({
                    "id": file_path.stem,
                    "name": data.get("name", file_path.stem),
                    "filename": file_path.name,
                    "data": data # Optionally return full data or just summary
                })
        return workflows

    def save_function(self, function_id, graph_data):
        """Saves a graph to disk."""
        try:
            # function_id should be safe? simple sanitization
            safe_id = "".join([c for c in function_id if c.isalnum() or c in ('_', '-')])
            if not safe_id:
                safe_id = "unnamed_function"
                
            file_path = self.graphs_dir / f"{safe_id}.json"
            
            # Ensure name is in the data
            if isinstance(graph_data, dict) and "name" not in graph_data:
                 graph_data["name"] = safe_id

            with open(file_path, 'w') as f:
                json.dump(graph_data, f, indent=4)
            return True
        except Exception as e:
            logger.error(f"Error saving function {function_id}: {e}")
            logger.error(f"Error saving function {function_id}: {e}")
            return False

    def save_agent(self, agent_id, agent_data):
        """Saves an agent to disk."""
        try:
            safe_id = "".join([c for c in agent_id if c.isalnum() or c in ('_', '-')])
            if not safe_id:
                safe_id = "unnamed_agent"
            
            # If the ID doesn't start with agent_, prepend it?
            # actually the frontend usually sends the ID.
            # If the ID is new (random number), we might want to ensure prefix.
            if not safe_id.startswith("agent_"):
                # If it's a new ID being generated/saved for the first time
                safe_id = f"agent_{safe_id}"
            
            file_path = self.graphs_dir / f"{safe_id}.json"
            
            # Ensure type metadata
            if isinstance(agent_data, dict):
                agent_data["type"] = "agent"
                if "name" not in agent_data:
                    agent_data["name"] = safe_id

            with open(file_path, 'w') as f:
                json.dump(agent_data, f, indent=4)
            return True, safe_id
        except Exception as e:
            logger.error(f"Error saving agent {agent_id}: {e}")
            return False, None

    def load_function(self, function_identifier):
        """
        Loads a graph from disk.
        function_identifier can be an ID (filename) or a Name.
        """
        # 1. Try treating it as an ID/Filename first
        safe_id = "".join([c for c in function_identifier if c.isalnum() or c in ('_', '-')])
        file_path = self.graphs_dir / f"{safe_id}.json"
        if file_path.exists():
            return self._load_json_file(file_path)
        
        # 2. If not found, try searching by Name
        logger.info(f"Function {function_identifier} not found by ID, searching by name...")
        for file_path in self.graphs_dir.glob("func_*.json"):
            data = self._load_json_file(file_path)
            if data and data.get("name") == function_identifier:
                return data
        return None

    def load_agent(self, agent_identifier):
        """Loads an agent, ensuring it is an agent."""
        safe_id = "".join([c for c in agent_identifier if c.isalnum() or c in ('_', '-')])
        file_path = self.graphs_dir / f"{safe_id}.json"
        if file_path.exists():
            return self._load_json_file(file_path)
        return None

    def delete_function(self, function_id):
        """Deletes a graph from disk."""
        try:
            safe_id = "".join([c for c in function_id if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                os.remove(file_path)
                logger.info(f"Deleted function file: {file_path}")
                return True
            else:
                logger.warning(f"Could not delete function {function_id}: File not found.")
                return False
        except Exception as e:
            logger.error(f"Error deleting function {function_id}: {e}")
            logger.error(f"Error deleting function {function_id}: {e}")
            return False

    def delete_agent(self, agent_id):
        return self.delete_function(agent_id)

    def save_workflow(self, workflow_name, workflow_data):
        """Saves a workflow configuration to disk."""
        try:
            safe_name = "".join([c for c in workflow_name if c.isalnum() or c in ('_', '-')])
            if not safe_name:
                safe_name = "unnamed_workflow"
                
            file_path = self.graphs_dir / f"workflow_{safe_name}.json"
            
            # Ensure name is in the data
            workflow_data["name"] = workflow_name
            workflow_data["type"] = "workflow" 

            with open(file_path, 'w') as f:
                json.dump(workflow_data, f, indent=4)
            return True
        except Exception as e:
            logger.error(f"Error saving workflow {workflow_name}: {e}")
            return False

    def load_workflow(self, workflow_name):
        """Loads a workflow configuration from disk."""
        try:
            safe_name = "".join([c for c in workflow_name if c.isalnum() or c in ('_', '-')])
            
            # Try direct file first if it has prefix
            if safe_name.startswith("workflow_"):
                file_path = self.graphs_dir / f"{safe_name}.json"
            else:
                 # Try adding prefix
                file_path = self.graphs_dir / f"workflow_{safe_name}.json"

            if file_path.exists():
                return self._load_json_file(file_path)
            
            # Search by name if internal name differs from filename
            for file_path in self.graphs_dir.glob("workflow_*.json"):
                data = self._load_json_file(file_path)
                if data and data.get("name") == workflow_name:
                    return data
            return None
        except Exception as e:
             logger.error(f"Error loading workflow {workflow_name}: {e}")
             return None

    def delete_workflow(self, workflow_id):
         return self.delete_function(workflow_id)
