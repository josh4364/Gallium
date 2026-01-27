# Feature Specification: Task Workflow and Agent Logic

## 1. Overview
Gallium uses a hierarchical agent structure to solve complex problems. It integrates deeply with Git to provide a versioned history of the AI's "thoughts" and "work," ensuring that every attempt and sub-task is a recoverable state.

## 2. Declarative Requirements

### 2.1 Git-Backed Task Tracking
- **Server should be able to** store each top-level task attempt as a local git branch.
- **Server should be able to** store each sub-task completion as a local git commit on the associated task branch.
- **Server should be able to** generate alternative implementations by creating new branches named `task-alt-N` (where N increments for each workflow).
- **Server should be able to** flatten the final task branch into a single top-level goal branch once all tasks are complete, preserving the sub-task commit history.

### 2.2 Orchestration Workflow
- **Top-Level Manager should be able to** switch between "Interview Mode" (requirements gathering) and "Architecture Mode" (execution).
- **Task Manager should be able to** break down a feature goal into a concrete list of sub-tasks stored in memory.
- **Task Manager should be able to** spawn specialized sub-task agents (e.g., code generator, debugger, researcher) with specific prompts and backing objects.
- **Task Manager should be able to** detect loops (e.g., redundant tool calls without progress) by evaluating a simplified history log of the sub-task at every event.

### 2.3 Code Generation Loop (Automation)
- **Sub-task agent should be able to** automatically trigger a "Checkpoint" before and after making code edits.
- **Sub-task agent should be able to** trigger LSP linting on modified files and feed errors back into the LLM for correction.
- **Sub-task agent should be able to** compress large error logs and code updates into a "Fixed errors + updated code" summary for the context window to maximize efficiency.

### 2.4 Completion and Bottlenecks
- **Task Manager should be able to** perform a bottleneck assessment at the end of each task to identify slowdowns (e.g., "spent 40% time on Vulkan resource transitions").
- **Task Manager should be able to** hand off a "Complete" signal to the Top-Level Manager once its sub-task list is exhausted.
- **Server should be able to** shut down any built project testing or background processes when a "Panic/Pause" button is pressed or an agent is backed up to a checkpoint.
