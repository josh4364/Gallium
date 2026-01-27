## USER

I noticed a discrepency between the items in the task list files in @specs/tasks
They should contain every item in @specs/high-level-tasks.md such as phase 3 TUI development missing everything about the file browser.

Study the high level list and every single task-*.md in tasks folder and make sure they have every item in their list.

Study all feature-*.md in specs to find anything missing from the spec that should be in the task lists, add new tasks where needed.

## GEMINI

The task lists and feature specifications have been synchronized. I found discrepancies where items from 
specs/high-level-tasks.md
 and specs/feature-*.md were missing from the detailed specs/tasks/ files.

Summary of Changes
Fixed TUI Inconsistencies (task-3-tui-layout.md)
File Browser: Added the missing requirement for a File Browser plane with navigation logic, as highlighted in your request.
Settings Modal: Added requirements for a generic Settings/Configuration overlay (API Key management, Toggles).
Added Missing Workflow Logic (task-6-agent-orchestration.md)
LSP Integration: Added the "Code Generation Loop" requirement (Section 2.5), specifying that agents should trigger linters (LSP) and receive error feedback.
Diff Summaries: Added requirements for summarizing file changes.
Added Git Configuration (task-5-git-workflow.md)
Push Toggles: Added a requirement for configurable git push behaviors (Push on Sub-task vs. Final Push), which was present in the feature specs but missing from the task.
Created Phase 6 Task (task-9-system-polish.md)
New Task File: Created specs/tasks/task-9-system-polish.md to cover "Phase 6: Specialist Workflows & Polish" from the high-level plan.
Contents: Includes requirements for System Notifications (libnotify), Visual Feedback (Green flash, Red tasks), Audit Log/Playback, and the Panic Button safety logic.
All items from the high-level plan and feature specs should now be represented in the detailed task files.
