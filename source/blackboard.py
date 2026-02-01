from typing import Optional, Dict, Any, List
from source.schemas import SmartSpec, Task

class Blackboard:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Blackboard, cls).__new__(cls)
            cls._instance.data = {}
            cls._instance.smart_spec = None
        return cls._instance

    def set_spec(self, spec: SmartSpec):
        self.smart_spec = spec

    def get_spec(self) -> Optional[SmartSpec]:
        return self.smart_spec

    def set_value(self, key: str, value: Any):
        self.data[key] = value

    def get_value(self, key: str) -> Any:
        return self.data.get(key)
    
    def update_task_status(self, task_id: str, status: str):
        if self.smart_spec:
            for task in self.smart_spec.tasks:
                if task.id == task_id:
                    task.status = status
                    return True
        return False
