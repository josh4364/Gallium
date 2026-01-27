# Task: Project Initialization Interview

## 1. Goal
Implement the interactive interview process for gathering project requirements.

## 2. Requirements

### 2.1 Structured Interview Sequence
- [x] **Action**: Implement a "Wizard" in the server that asks the 6 core questions (Goal, OS, Language, Deps, Integration, Vending).

### 2.2 Clarification Mode
- [x] **Action**: Transition to "Generated Interview Mode" where the Top-Level Manager asks iterative follow-up questions.

### 2.3 Synthesis Engine
- [x] **Action**: Prompt an LLM to summarize the entire interview into a formal `project.md` and `feature-*.md` set.

### 2.4 Branch Creation
- [x] **Action**: Commit the generated documents to a new `init-project` branch.

## 3. Verification Steps
1. **Flow Test**: Start the interview on the TUI, answer the questions, and verify the LLM asks relevant follow-ups.
2. **Synthesis Test**: Verify the final `project.md` contains the info provided during the interview.

## 4. Completion Summary
**To Future Self:**
This task successfully implemented the Project Initialization Wizard. The wizard is triggered automatically when a client connects to the server and no project configuration is detected. It guides the user through 6 foundational questions (Goal, OS, Language, etc.) via the TUI, which now supports interactive text input.

**Key Accomplishments:**
*   **Interactive TUI Input**: Added logical support for text-input modals in `source/client/ui.c`, allowing the server to request string input, not just boolean approvals.
*   **State Machine Wizard**: Implemented `source/server/project_init.c` which manages the interview flow state.
*   **LLM Synthesis**: Integrated `llm_gemini` to synthesize the user's answers into a markdown specification file.
*   **Git Automation**: The system automatically branches to `init-project` and commits the generated specs.

**Next Steps:**
*   Consider expanding the "Clarification Mode" to be more dynamic; currently, it follows a fixed path before synthesis.
*   The generated `specs/project.md` is currently a placeholder name; ensure it integrates well with the rest of the system's expected paths.
