### The Gallium State Engine

#### **1. Core Architecture: The "Two-Tier" System**

Instead of a single flat graph, the system operates on two distinct layers.

* **Tier 1: The Orchestrator (State Machine)**
* **Role:** Strategy & Lifecycle.
* **Mechanism:** An FSM (Finite State Machine) that holds global context (`Active Spec`, `File Tree Snapshot`, `User Preferences`).
* **Transitions:** Driven by **Events** (e.g., `PLAN_APPROVED`, `TASK_FAILED`, `SCOPE_CREEP`).

* **Tier 2: The Executor (Node Graphs)**
* **Role:** Tactics & Execution.
* **Mechanism:** Standard Gallium Node Graphs (what you have now).
* **Execution:** The Orchestrator "spins up" a specific graph (e.g., `implement_feature.graph`) based on the current state.


---

#### **2. The Data Structure: "Smart Spec"**

To solve the synchronization issue, the "Spec" is the Single Source of Truth, stored as a JSON object that both the LLM and UI can manipulate.

**Schema:**

```json
{
  "project_id": "gallium_v1",
  "goal": "Add Dark Mode",
  "constraints": [
    "Must use Tailwind CSS",
    "Must persist preference in localStorage"
  ],
  "tasks": [
    {
      "id": "t1",
      "title": "Create Theme Context",
      "status": "pending", // pending | doing | done | failed
      "file_paths": ["src/context/ThemeContext.tsx"]
    },
    {
      "id": "t2", 
      "title": "Update Header UI",
      "status": "pending"
    }
  ]
}

```

---

#### **3. The Pipelines (Detailed Flows)**

##### **A. The Triage Pipeline (Router)**

* **Trigger:** User sends a message.
* **Graph Logic:**
1. `Read Workspace`: Scans file tree summary.
2. `LLM Classifier`: Determines intent (`NEW_FEATURE`, `BUG_FIX`, `QUESTION`).
3. `Event Emitter`: Fires event (e.g., `INTENT_FEATURE`).


* **Orchestrator Action:** Transitions State from `IDLE` -> `PLANNING`.

##### **B. The Planning Pipeline (Spec First)**

* **State:** `PLANNING`
* **Graph Logic:**
1. `LLM Generator`: Takes user prompt + workspace context -> Outputs **JSON Spec**.
2. `UI Yield (Spec Editor)`:
* **Server:** Pauses VM. Sends `event: "REVIEW_SPEC"`, `payload: { json_spec }`.
* **Client:** Renders "Spec Editor" UI. User tweaks tasks/constraints.
* **Return:** User clicks "Approve" -> sends updated JSON back.


3. `Write Context`: Saves the approved JSON to the global Blackboard.
4. `Event Emitter`: Fires `SPEC_APPROVED`.

* **Orchestrator Action:** Transitions State -> `IMPLEMENTATION`.

##### **C. The Implementation Loop (The Workhorse)**

* **State:** `IMPLEMENTATION`
* **Graph Logic (The Iterator):**
1. `Load Spec`: Reads the JSON from memory.
2. `Iterator Node`: Selects the next `status: "pending"` task.
3. **Sub-Routine: The Coding Agent**
* `LLM Coder`: Generates code for the task.
* **The A/B Fork (Optional):**
* If `User_Pref == "Manual"`:
* Generate Option A & Option B.
* `UI Yield (Compare)`: Pauses. Client shows diff side-by-side.
* User picks B.

* If `User_Pref == "Auto"`:
* `LLM Judge`: Picks best implementation.

* `File Writer`: Applies changes.

4. `Verification Node`: Runs linter/tests.
* **If Success:** Update Task JSON status to `done`. Loop to next task.
* **If Fail:** * `LLM Analyzer`: Generates "Why it failed" summary.
* `Event Emitter`: Fires `TASK_FAILED` with payload.


* **Orchestrator Action:** * On `TASK_FAILED`: Transition to `DEBUGGING` state (or pause for user help).
* On `ALL_DONE`: Transition to `SUMMARY`.


---

#### **4. Required Node Palette Additions**

To build this, you need to add these specific nodes to your Gallium Engine:

1. **`Event Emitter`**:
* **Input:** Event Name (String), Payload (JSON).
* **Action:** Stops the current graph execution and signals the Master State Machine to handle a transition.


2. **`UI Yield`**:
* **Input:** UI Type (Enum: `SpecEditor`, `BinaryChoice`, `ChatMessage`), Data Payload.
* **Action:** Suspends VM execution, sends WebSocket message to client, awaits resume signal.


3. **`JSON Iterator`**:
* **Input:** JSON Array.
* **Output:** Current Item, Index, IsDone (Boolean).
* **Action:** Standard Loop control.


4. **`Global Context R/W`**:
   * **Action:** specific nodes to Read/Write to the "Blackboard" (the memory shared between the Planner graph and the Implementer graph).

---

#### **5. Step-by-Step Implementation Plan**

This roadmap breaks down the development of the Gallium State Engine into manageable phases, ensuring that dependencies are met before building higher-level logic.

**Phase 1: Foundation & Primitives (DONE)**
*   **Step 1.1: Define Data Schemas**
    *   Create the Python/Pydantic definitions for the `Smart Spec` (Project, Goal, Constraints, Tasks).
    *   Define the `Event` structure (Name, Payload, Source).
    *   Implement the `Blackboard` (Global Context) storage mechanism in the backend.
*   **Step 1.2: Core Node Implementation**
    *   Implement `Global Context Read` and `Global Context Write` nodes.
    *   Implement `JSON Iterator` node for looping through task lists.
    *   Implement `Event Emitter` node to allow graphs to signal the Orchestrator.

**Phase 2: The UI Bridge (DONE)**
*   **Step 2.1: WebSocket Protocol Update**
    *   Update the backend-frontend communication to support "Yield" states (pausing VM, waiting for client input).
    *   Define the message format for `UI_YIELD` and `UI_RESUME`.
*   **Step 2.2: Implement `UI Yield` Node**
    *   Create the node that halts execution and sends the payload to the client.
    *   Handle the resumption logic when the client response is received.
*   **Step 2.3: Frontend Components**
    *   Build the "Spec Editor" validation UI.
    *   Build the "Diff/Comparison" view for A/B testing implementations.

**Phase 3: The Triage & Planning Graphs (DONE)**
*   **Step 3.1: Build the Triage Graph**
    *   Create `triage.graph` using standard nodes.
    *   Implement the logic to classify user intent (Feature vs. Bug vs. Question).
*   **Step 3.2: Build the Planning Graph**
    *   Create `planner.graph`.
    *   Connect the `LLM Generator` to the `UI Yield` node for Spec review.
    *   Ensure the approved Spec is written to the Blackboard.

**Phase 4: The Orchestrator (FSM)**
*   **Step 4.1: State Machine Logic**
    *   Implement the main Python loop that listens for `Events` from the graphs.
    *   Define the transitions: `IDLE` -> `PLANNING` -> `IMPLEMENTATION` -> `VERIFICATION`.
*   **Step 4.2: Graph Loading & switching**
    *   Implement the logic to dynamically load and "spin up" the correct graph (Tier 2) based on the current Tier 1 state.

**Phase 5: The Implementation Loop**
*   **Step 5.1: Build the Coder Graph**
    *   Create `implementer.graph` that iterates through the Blackboard's task list.
    *   Use the new `JSON Iterator` to process one task at a time.
*   **Step 5.2: Verification & Feedback**
    *   Add the "Verification Node" logic to run tests.
    *   Implement the loop-back mechanism to retry failed tasks.



