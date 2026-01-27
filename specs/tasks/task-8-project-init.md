# Task: Project Initialization Interview

## 1. Goal
Implement the interactive interview process for gathering project requirements.

## 2. Requirements

### 2.1 Structured Interview Sequence
- **Action**: Implement a "Wizard" in the server that asks the 6 core questions (Goal, OS, Language, Deps, Integration, Vending).

### 2.2 Clarification Mode
- **Action**: Transition to "Generated Interview Mode" where the Top-Level Manager asks iterative follow-up questions.

### 2.3 Synthesis Engine
- **Action**: Prompt an LLM to summarize the entire interview into a formal `project.md` and `feature-*.md` set.

### 2.4 Branch Creation
- **Action**: Commit the generated documents to a new `init-project` branch.

## 3. Verification Steps
1. **Flow Test**: Start the interview on the TUI, answer the questions, and verify the LLM asks relevant follow-ups.
2. **Synthesis Test**: Verify the final `project.md` contains the info provided during the interview.
