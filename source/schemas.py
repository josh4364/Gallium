from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict, Literal

class Task(BaseModel):
    id: str
    title: str
    status: Literal['pending', 'doing', 'done', 'failed'] = 'pending'
    file_paths: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SmartSpec(BaseModel):
    project_id: str
    goal: str
    constraints: List[str] = Field(default_factory=list)
    tasks: List[Task] = Field(default_factory=list)

class Event(BaseModel):
    name: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "graph_node"
