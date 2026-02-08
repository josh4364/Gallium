import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("StructManager")


class StructManager:
    """Manages struct type definitions, saving and loading them as JSON files."""
    
    def __init__(self, system_root=None, graphs_dir="graphs"):
        # The system root is where the program was launched. 
        # We store system files (graphs, structs) in a gallium folder there.
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
            
        logger.info(f"StructManager initialized with graphs directory: {self.graphs_dir}")

    def get_struct_list(self):
        """Returns a list of available structs."""
        structs = []
        for file_path in self.graphs_dir.glob("struct_*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    structs.append({
                        "id": data.get("id", file_path.stem),
                        "name": data.get("name", file_path.stem),
                        "fields": data.get("fields", []),
                        "filename": file_path.name
                    })
            except Exception as e:
                logger.error(f"Error reading struct {file_path}: {e}")
        return structs

    def save_struct(self, struct_id, struct_data):
        """Saves a struct to disk."""
        try:
            # struct_id should be safe? simple sanitization
            safe_id = "".join([c for c in struct_id if c.isalnum() or c in ('_', '-')])
            if not safe_id:
                safe_id = "struct_unnamed"
                
            file_path = self.graphs_dir / f"{safe_id}.json"
            
            # Ensure id is in the data
            if isinstance(struct_data, dict):
                struct_data["id"] = safe_id
                if "name" not in struct_data:
                    struct_data["name"] = safe_id

            with open(file_path, 'w') as f:
                json.dump(struct_data, f, indent=4)
            logger.info(f"Saved struct: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving struct {struct_id}: {e}")
            return False

    def load_struct(self, struct_id):
        """Loads a struct from disk."""
        try:
            safe_id = "".join([c for c in struct_id if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                with open(file_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading struct {struct_id}: {e}")
        return None

    def delete_struct(self, struct_id):
        """Deletes a struct from disk."""
        try:
            safe_id = "".join([c for c in struct_id if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                os.remove(file_path)
                logger.info(f"Deleted struct file: {file_path}")
                return True
            else:
                logger.warning(f"Could not delete struct {struct_id}: File not found.")
                return False
        except Exception as e:
            logger.error(f"Error deleting struct {struct_id}: {e}")
            return False

    def get_all_structs_data(self):
        """Returns full data for all structs (for initial load)."""
        structs = []
        for file_path in self.graphs_dir.glob("struct_*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    structs.append(data)
            except Exception as e:
                logger.error(f"Error reading struct {file_path}: {e}")
        return structs

    # --- Enum Management ---
    def get_enum_list(self):
        """Returns a list of available enums."""
        enums = []
        for file_path in self.graphs_dir.glob("enum_*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    enums.append({
                        "id": data.get("id", file_path.stem),
                        "name": data.get("name", file_path.stem),
                        "values": data.get("values", []),
                        "filename": file_path.name
                    })
            except Exception as e:
                logger.error(f"Error reading enum {file_path}: {e}")
        return enums

    def save_enum(self, enum_id, enum_data):
        """Saves an enum to disk."""
        try:
            safe_id = "".join([c for c in enum_id if c.isalnum() or c in ('_', '-')])
            if not safe_id:
                safe_id = "enum_unnamed"
                
            file_path = self.graphs_dir / f"{safe_id}.json"
            
            # Ensure id is in the data
            if isinstance(enum_data, dict):
                enum_data["id"] = safe_id
                if "name" not in enum_data:
                    enum_data["name"] = safe_id

            with open(file_path, 'w') as f:
                json.dump(enum_data, f, indent=4)
            logger.info(f"Saved enum: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving enum {enum_id}: {e}")
            return False

    def load_enum(self, enum_id):
        """Loads an enum from disk."""
        try:
            safe_id = "".join([c for c in enum_id if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                with open(file_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading enum {enum_id}: {e}")
        return None

    def delete_enum(self, enum_id):
        """Deletes an enum from disk."""
        try:
            safe_id = "".join([c for c in enum_id if c.isalnum() or c in ('_', '-')])
            file_path = self.graphs_dir / f"{safe_id}.json"
            if file_path.exists():
                os.remove(file_path)
                logger.info(f"Deleted enum file: {file_path}")
                return True
            else:
                logger.warning(f"Could not delete enum {enum_id}: File not found.")
                return False
        except Exception as e:
            logger.error(f"Error deleting enum {enum_id}: {e}")
            return False

    def get_all_enums_data(self):
        """Returns full data for all enums (for initial load)."""
        enums = []
        for file_path in self.graphs_dir.glob("enum_*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    enums.append(data)
            except Exception as e:
                logger.error(f"Error reading enum {file_path}: {e}")
        return enums
