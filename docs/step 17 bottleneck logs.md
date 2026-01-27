# Step 17: Bottleneck Assessment Logs

## Goal
Implement the bottleneck assessment logs at task completion as defined in `specs/high-level-tasks.md`.

## Changes
1.  **Modified `source/server/agent_manager.c`**:
    *   Included `<time.h>`.
    *   Added `clock_gettime(CLOCK_MONOTONIC, ...)` around the agent message processing block.
    *   Calculated duration in seconds.
    *   Logged a `bottleneck_assessment` event with the duration.

## Verification
*   Built the project using `nix develop --command ./build.sh`.
*   Verified compilation success.
