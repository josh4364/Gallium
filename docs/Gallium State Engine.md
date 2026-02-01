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


