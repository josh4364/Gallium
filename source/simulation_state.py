import random
import logging
import json
from datetime import datetime
from pathlib import Path
import os
from source.agents.observer import ObserverAgent
from source.agents.sequencer import SequencerAgent
from source.agents.decoder import DecoderAgent
from source.agents.worker import ActionAgent
from source.ai_system import AI_Eval, AI_Eval_to_json
from source import tools

logger = logging.getLogger("SimulationState")

class SimulationState:
    def __init__(self):
        self.tick_count = 0
        self.events = []
        
        # Layer 0 State
        self.layer0_goal = None
        self.goal_request_active = False
        self.conceptual_chunks = []
        self._editing_goals_finished = False
        self.layer1_active_chunk = None
        self.tasks = []
        self._sequencing_finished = False
        self.layer2_active_task = None
        self.subtasks = []
        self._decoding_finished = False
        self.layer3_active_subtask = None
        self.layer3_review_pending = False
        self.layer3_last_feedback = None
        self.mailboxes = {
            "Layer2": []
        }
        self.all_work_finished = False

        # Modified initialization based on user request:
        # Only 'Documentation' (fed by observer) and 'work-towards-goal'
        self.layer_0_weights = {
            "Documentation": 0.0,
            "needs-goal": 1.0, # High initially as we have no goal
            "work-towards-goal": 0.0
        }
        # In the future, these will be actual Agent objects
        self.agents = {
            "Layer0_Decision": None,
            "Layer1_Sequencer": SequencerAgent(),
            "Layer2_Decoder": DecoderAgent(),
            "Layer3_Action": ActionAgent(),
            "Observer": ObserverAgent()
        }
        self.source_file_metrics = {} # filename -> {"crc": ..., "tokens": ...}

    def _add_event(self, message, event_type="info"):
        event = {
            "id": len(self.events),
            "tick": self.tick_count,
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "message": message
        }
        self.events.append(event)
        # Keep log size manageable for now
        if len(self.events) > 1000:
            self.events = self.events[-1000:]
        return event

    def set_layer0_goal(self, goal_text):
        """Sets the layer 0 goal and updates state."""
        self.layer0_goal = goal_text
        self.goal_request_active = False
        self._add_event(f"Layer 0 Goal Set: {goal_text}", "info")
        
    def _layer0_tick(self):
        """
        Layer 0 Decision Logic
        """
        # Get current docs score for inhibition
        doc_score = self.layer_0_weights.get("Documentation", 0.0)

        # 1. Update 'needs-goal' score
        if not self.layer0_goal:
            # Try to load from manifest first
            if self._load_state_from_manifest():
                self.layer_0_weights["needs-goal"] = 0.0
                self.layer_0_weights["work-towards-goal"] = max(0.0, 1.0 - doc_score)
            else:
                self.layer_0_weights["needs-goal"] = 2.0
                self.layer_0_weights["work-towards-goal"] = 0.0
        else:
            self.layer_0_weights["needs-goal"] = 0.0
            self.layer_0_weights["work-towards-goal"] = max(0.0, 1.0 - doc_score)

        # 2. Normalize Weights
        total_weight = sum(self.layer_0_weights.values())
        if total_weight > 0:
            for key in self.layer_0_weights:
                self.layer_0_weights[key] /= total_weight
        
        # 3. Determine Focus
        current_focus = max(self.layer_0_weights, key=self.layer_0_weights.get)
        
        # 4. Process Focus Switch
        if current_focus == "needs-goal":
            if not self.goal_request_active:
                self.goal_request_active = True
                self._add_event("Awaiting User Goal...", "warn")
                
        elif current_focus == "Documentation":
            # Check/Create Documentation
            self._process_documentation_focus()
            
        elif current_focus == "work-towards-goal":
            if self._editing_goals_finished:
                # If we're done planning, we might still be in this focus 
                # but we should move to sequencing if we have chunks
                next_chunk = self._get_next_chunk()
                if next_chunk:
                    if self.layer1_active_chunk != next_chunk:
                        self.layer1_active_chunk = next_chunk
                        self._add_event(f"Focusing on Chunk: {self.layer1_active_chunk['name']}", "info")
                        self._update_manifest_chunks()
                else:
                    # ALL CHUNKS DONE!
                    if not self.all_work_finished:
                        self.all_work_finished = True
                        self._add_event("ALL CONCEPTUAL CHUNKS COMPLETED. Project Goal Reached.", "warn")
                    return "Finished"
            else:
                # Breakdown goal into chunks
                self._process_work_towards_goal_focus()

        return current_focus

    def _process_documentation_focus(self):
        """
        Handles the 'Documentation' focus:
        - Creates gallium directory if missing
        - Creates project.md if missing
        """
        try:
            cwd = Path.cwd()
            gallium_dir = cwd / "gallium"
            
            if not gallium_dir.exists():
                gallium_dir.mkdir(exist_ok=True)
                self._add_event("Created 'gallium' directory.", "info")
            
            project_md = gallium_dir / "project.md"
            if not project_md.exists() and self.layer0_goal:
                content = f"# Project Documentation\n\n**Goal**: {self.layer0_goal}\n**manifest.json**: files that currently have documentation in this folder\nAuto-generated by Gallium."
                project_md.write_text(content)
                self._add_event("Created 'gallium/project.md'.", "info")

            # Update/Create manifest.json with goal
            manifest_path = gallium_dir / "manifest.json"
            manifest_data = {}
            if manifest_path.exists():
                try:
                    with open(manifest_path, 'r') as f:
                        manifest_data = json.load(f)
                except Exception:
                    pass # Start fresh if corrupted
            
            if self.layer0_goal:
                if manifest_data.get("goal") != self.layer0_goal:
                    manifest_data["goal"] = self.layer0_goal
                    with open(manifest_path, 'w') as f:
                        json.dump(manifest_data, f, indent=4)
                    self._add_event("Updated 'gallium/manifest.json' goal.", "info")
                
        except Exception as e:
            logger.error(f"Documentation logic failed: {e}")
            self._add_event(f"Documentation Error: {e}", "error")

    def _process_work_towards_goal_focus(self):
        """
        Handles the 'work-towards-goal' behavior:
        Break down the high-level goal into conceptual chunks using tools.
        """
        if not self.layer0_goal or self._editing_goals_finished:
            return

        self._add_event("Focus: Breaking down goal using agentic tools...", "info")
        
        system_prompt = f"""You are a senior software architect. 
Current Top Level Goal: "{self.layer0_goal}"

Your task is to break this goal down into high-level conceptual chunks (goals) for development. 
Not a step-by-step guide, but the bigger picture building blocks.

Use the provided tools to manage the list of high-level goals.
1. Use 'add_high_level_goal' to add chunks in logical order.
2. Use 'list_high_level_goals' to see what you have added.
3. Use 'remove_high_level_goal' if you made a mistake.
4. Call 'finished_editing_goals' when the list is complete and you are satisfied.

Important: You must call 'finished_editing_goals' to complete this task.
"""
        
        user_prompt = "Please break down the goal and use the tools to finalize the conceptual chunks list."

        tools_list = [
            tools.add_high_level_goal, 
            tools.list_high_level_goals, 
            tools.remove_high_level_goal, 
            tools.finished_editing_goals
        ]

        try:
            # Check if we should use fallback
            from source.ai_system import AI_Eval
            
            # Using AI_Eval with tools support. 
            # Note: For tool use, the current AI_Eval performs a single turn.
            # But we want the AI to iterate if needed.
            # However, the user request says "we will run the AI_Eval".
            # If we want a chat session with tool execution, we need to handle it.
            
            # For now, let's use the google-genai client directly for the chat session 
            # as it handles tool execution loops more cleanly in-process, 
            # but we lose the fallback logic there.
            
            # WAIT: If we want fallback support for tools, we should use AI_Eval 
            # and potentially loop it if it indicates tool calls? 
            # Currently AI_Eval's _eval_with_api doesn't loop; it just returns the response.
            
            # Let's use AI_Eval but refine it to handle a few turns of tool calling 
            # if we want a fully functional "agent" behavior here.
            
            response_text = AI_Eval(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                tools=tools_list
            )
            
            if response_text:
                self._add_event(f"AI: {response_text[:200]}...", "info")
            
            # SYNC: Reload state from manifest as the tools (even in fallback) touched it
            self._load_state_from_manifest()
            
            self._add_event("Goal breakdown iteration complete.", "info")
                
        except Exception as e:
            logger.error(f"Goal breakdown tools failed: {e}")
            self._add_event(f"Goal Breakdown Error: {e}", "error")

    def _load_state_from_manifest(self):
        """Attempts to load the full state from gallium/manifest.json"""
        try:
            cwd = Path.cwd()
            manifest_path = cwd / "gallium" / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    data = json.load(f)
                    
                    goal = data.get("goal")
                    if goal and isinstance(goal, str):
                        self.layer0_goal = goal.strip()
                    
                    self.conceptual_chunks = data.get("conceptual_chunks", [])
                    self._editing_goals_finished = data.get("editing_finished", False)
                    self.tasks = data.get("tasks", [])
                    self._sequencing_finished = data.get("sequencing_finished", False)
                    self.subtasks = data.get("subtasks", [])
                    self._decoding_finished = data.get("decoding_finished", False)
                    self.layer1_active_chunk = data.get("layer1_active_chunk")
                    self.layer2_active_task = data.get("layer2_active_task")
                    self.layer3_active_subtask = data.get("layer3_active_subtask")
                    self.layer3_review_pending = data.get("layer3_review_pending", False)
                    self.layer3_last_feedback = data.get("layer3_last_feedback")
                    self.all_work_finished = data.get("all_work_finished", False)
                    
                    self._add_event("Loaded State from Manifest.", "info")
                    return True
        except Exception as e:
            logger.warning(f"Failed to load manifest: {e}")
        return False

    def _update_manifest_chunks(self):
        """Saves current simulation state to manifest.json"""
        try:
            cwd = Path.cwd()
            manifest_path = cwd / "gallium" / "manifest.json"
            manifest_data = {}
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    manifest_data = json.load(f)
            
            manifest_data.update({
                "conceptual_chunks": self.conceptual_chunks,
                "tasks": self.tasks,
                "subtasks": self.subtasks,
                "editing_finished": self._editing_goals_finished,
                "sequencing_finished": self._sequencing_finished,
                "decoding_finished": self._decoding_finished,
                "layer1_active_chunk": self.layer1_active_chunk,
                "layer2_active_task": self.layer2_active_task,
                "layer3_active_subtask": self.layer3_active_subtask,
                "layer3_review_pending": self.layer3_review_pending,
                "layer3_last_feedback": self.layer3_last_feedback,
                "all_work_finished": self.all_work_finished,
                "goal": self.layer0_goal
            })

            with open(manifest_path, 'w') as f:
                json.dump(manifest_data, f, indent=4)
        except Exception as e:
            logger.warning(f"Failed to update manifest chunks: {e}")

    def _post_to_mailbox(self, mailbox_name, message):
        if mailbox_name in self.mailboxes:
            self.mailboxes[mailbox_name].append(message)

    def _layer1_tick(self):
        """
        Layer 1 Sequencer logic.
        Handles functional milestones and research.
        """
        if not self.agents["Layer1_Sequencer"] or not self.layer1_active_chunk:
            return
            
        try:
            self.agents["Layer1_Sequencer"].tick(self, self.layer1_active_chunk["name"])
            self._load_state_from_manifest()
        except Exception as e:
            logger.error(f"Layer 1 tick failed: {e}")
            self._add_event(f"Layer 1 Error: {e}", "error")

    def _layer2_tick(self):
        """Layer 2 Decoder tick."""
        if not self.agents["Layer2_Decoder"] or not self.layer2_active_task:
            return

        # Check mailbox first
        while self.mailboxes["Layer2"]:
            msg = self.mailboxes["Layer2"].pop(0)
            if msg.get("status") == "completed":
                # Result from Layer 3
                self.layer3_review_pending = True
                self._add_event(f"Layer 2: Received work from Layer 3. Starting Review...", "info")
                
                # Perform Review
                review_feedback = self.agents["Layer2_Decoder"].run_code_review(
                    self, msg.get("subtask"), msg.get("response")
                )
                
                if review_feedback.startswith("APPROVED"):
                    self._add_event(f"Layer 2: Subtask '{msg.get('subtask')}' APPROVED.", "info")
                    self._mark_subtask_completed(msg.get("subtask"))
                    self.layer3_active_subtask = None
                    self.layer3_review_pending = False
                    self.layer3_last_feedback = None
                else:
                    self._add_event(f"Layer 2: Subtask '{msg.get('subtask')}' FAILED review. Feedback: {review_feedback[:100]}...", "warn")
                    self.layer3_last_feedback = review_feedback
                    self.layer3_review_pending = False # Ready to retry
                
                self._update_manifest_chunks()
                return # Processing review is the tick

        # If not sequencing and not review pending, try to hand off to layer 3
        if self._decoding_finished:
            if not self.layer3_active_subtask:
                next_subtask = self._get_next_subtask()
                if next_subtask:
                    self.layer3_active_subtask = next_subtask["name"]
                    self._add_event(f"Layer 2: Handing off subtask to Layer 3: {self.layer3_active_subtask}", "info")
                    self._update_manifest_chunks()
                else:
                    # All subtasks complete for this task!
                    self._mark_task_completed(self.layer2_active_task["name"])
                    self.layer2_active_task = None
                    self._decoding_finished = False
                    self._add_event(f"Layer 2: Task completed. Ready for next.", "info")
                    self._update_manifest_chunks()
            return

        # Otherwise, run decoding
        try:
            self.agents["Layer2_Decoder"].tick(self, self.layer2_active_task["name"])
            self._load_state_from_manifest()
        except Exception as e:
            logger.error(f"Layer 2 tick failed: {e}")
            self._add_event(f"Layer 2 Error: {e}", "error")

    def _get_next_subtask(self):
        for st in self.subtasks:
            if not st.get("completed"):
                return st
        return None
        
    def _mark_subtask_completed(self, name):
        for st in self.subtasks:
            if st["name"] == name:
                st["completed"] = True
                break
        self._update_manifest_chunks()

    def _mark_task_completed(self, name):
        for t in self.tasks:
            if t["name"] == name:
                t["completed"] = True
                break
        self._update_manifest_chunks()

    def _layer3_tick(self):
        """Layer 3 Action tick."""
        if not self.agents["Layer3_Action"] or not self.layer3_active_subtask:
            return
            
        try:
            self.agents["Layer3_Action"].tick(self, self.layer3_active_subtask, self.layer3_last_feedback)
            # Clear active subtask so Layer 2 can take a turn to review
            self.layer3_active_subtask = None
            self._update_manifest_chunks()
        except Exception as e:
            logger.error(f"Layer 3 tick failed: {e}")
            self._add_event(f"Layer 3 Error: {e}", "error")

    def step(self):
        """
        Advances the simulation by one tick.
        """
        self.tick_count += 1
        
        # Pre-tick: Try loading goal immediately on first tick so Observer has context
        if self.tick_count == 1 and not self.layer0_goal:
            self._load_state_from_manifest()
            
        # Safety: If Layer 1 is missing but we have tasks/decoding in progress, re-sync from disk
        if not self.layer1_active_chunk and (self.layer2_active_task or self.tasks):
            self._load_state_from_manifest()
        
        # 0. Background Observation (Always runs)
        if self.agents.get("Observer"):
            try:
                self.agents["Observer"].tick(self)
            except Exception as e:
                logger.error(f"Observer tick failed: {e}")

        # --- Priority Drain Loop (Bottom to Top) ---

        # 1. Layer 3: Action Execution (Highest Priority)
        if self.layer3_active_subtask:
            self._layer3_tick()
            return self.get_state()

        # 2. Layer 2: Decoder / Recipe Generation
        if self.layer2_active_task:
            self._layer2_tick()
            return self.get_state()

        # 3. Layer 1: Sequencer / Milestone Planning
        if self.layer1_active_chunk:
            # Only tick if not finished sequencing this chunk
            if not self._sequencing_finished:
                self._layer1_tick()
                return self.get_state()
            else:
                 # Hand off to Layer 2 if Layer 1 is done and Layer 2 is idle
                 if not self.layer2_active_task:
                     next_task = self._get_next_task()
                     if next_task:
                         self.layer2_active_task = next_task
                         self._add_event(f"Handing off first task to Layer 2: {self.layer2_active_task['name']}", "info")
                         return self.get_state()
                     else:
                         # No next task? This chunk is done!
                         self._mark_chunk_completed(self.layer1_active_chunk["name"])
                         self.layer1_active_chunk = None
                         self._sequencing_finished = False # Reset for next chunk
                         self._add_event(f"Layer 1: Chunk completed. Ready for next.", "info")
                         self._update_manifest_chunks()
                         # Continue to Layer 0 to find next chunk

        # 4. Layer 0: Strategic Decision
        # Only wakes up if no lower layer is actively sequencing or executing
        focus = self._layer0_tick()
        
        # If Layer 0 triggers a hand-off (checked in _layer0_tick or next step)
        # we return the state. Focus is already handled inside _layer0_tick.
        
        self._add_event(f"Tick {self.tick_count}. Focus: {focus}")
        return self.get_state()

    def get_state(self):
        """Returns the current state of the simulation for the client."""
        return {
            "tick": self.tick_count,
            "weights": self.layer_0_weights,
            "goal_request_active": self.goal_request_active,
            "layer0_goal": self.layer0_goal,
            "layer1_goal": self.layer1_active_chunk.get("name") if isinstance(self.layer1_active_chunk, dict) else self.layer1_active_chunk,
            "layer2_goal": self.layer2_active_task.get("name") if isinstance(self.layer2_active_task, dict) else self.layer2_active_task,
            "layer3_goal": self.layer3_active_subtask,
            "conceptual_chunks": self.conceptual_chunks,
            "tasks": self.tasks,
            "subtasks": self.subtasks,
            "source_file_metrics": self.source_file_metrics,
            "all_work_finished": self.all_work_finished,
            "latest_events": self.events[-10:] # Send last 10 events for efficiency
        }

    def _get_next_task(self):
        for t in self.tasks:
            if not t.get("completed"):
                return t
        return None

    def _get_next_chunk(self):
        for c in self.conceptual_chunks:
            if not c.get("completed"):
                return c
        return None

    def _mark_chunk_completed(self, name):
        for c in self.conceptual_chunks:
            if c["name"] == name:
                c["completed"] = True
                break
        self._update_manifest_chunks()
