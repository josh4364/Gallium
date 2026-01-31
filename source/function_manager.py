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

    def get_function_list(self):
        """Returns a list of available functions."""
        functions = []
        for file_path in self.graphs_dir.glob("func_*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    # Use filename stem as ID, but check if data has a name
                    # The frontend likely expects an array of {id, name} objects
                    functions.append({
                        "id": file_path.stem,
                        "name": data.get("name", file_path.stem),
                        "filename": file_path.name
                    })
            except Exception as e:
                logger.error(f"Error reading function {file_path}: {e}")
        return functions

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
            return False

    def load_function(self, function_identifier):
        """
        Loads a graph from disk.
        function_identifier can be an ID (filename) or a Name.
        """
        try:
            # 1. Try treating it as an ID/Filename first
            safe_id = "".join([c for c in function_identifier if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                with open(file_path, 'r') as f:
                    return json.load(f)
            
            # 2. If not found, try searching by Name
            # This is less efficient, but necessary if we use Names as identifiers for Tools
            # We can iterate specifically for this, or check the cache if we had one.
            # For now, we iterate over files as we do in get_function_list
            logger.info(f"Function {function_identifier} not found by ID, searching by name...")
            for file_path in self.graphs_dir.glob("func_*.json"):
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                        if data.get("name") == function_identifier:
                            return data
                except:
                    continue
                    
        except Exception as e:
            logger.error(f"Error loading function {function_identifier}: {e}")
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
            return False
