# Feature Specification: Project Initialization Workflow

## 1. Overview
The Project Initialization workflow is the primary entry point for starting a new project in Gallium. It follows a structured interview process that transitions from user-led answers to LLM-driven clarification, resulting in a formal requirements document.

## 2. Declarative Requirements

### 2.1 Structured User Interview
- **Server should be able to** interview the user in a fixed sequence:
    1. **Primary Goal**: "Top level what is the project?"
    2. **Platform Support**: "What OSes should be supported?"
    3. **Language Selection**: "What language is X written in?" (Iterated for all project components).
    4. **Dependencies**: "What third party dependencies do you know you want to use?"
    5. **Integration Style**: "Do you want direct coupling or an abstraction wrapper?"
    6. **Vending Style**: "Git submodule or manual vendoring?"

### 2.2 LLM-Generated Clarification
- **Server should be able to** transition into "Generated Interview Mode" after the initial questions.
- **Top-Level Manager should be able to** generate iterative questions to refine the requirements based on previous user input.
- **User should be able to** signify they are "finished" with the clarification phase to move to the synthesis phase.

### 2.3 Requirements Synthesis
- **Server should be able to** synthesize a "Top Level Project Requirements Document" from the entire interview history.
- **Client should be able to** display the generated document for user review and editing.
- **User should be able to** provide feedback and iterate on the document until they say "finished".

### 2.4 Initialization Execution
- **Server should be able to** create a new Git branch for the project initialization.
- **Server should be able to** make an initial commit containing the final synthesized project requirements document to the new branch.
- **Server should be able to** hand off the project to the Architecture Mode once initialization is confirmed.
