# Step 20: Waterfall View Improvements

## Goal
Enhance the Waterfall view with noise filtering and detailed "peek" functionality as per `specs/high-level-tasks.md`.

## Implementation Details

1.  **Filtering**:
    *   Implemented `is_noisy_event` to identify "LLM_MONITOR", "LLM_RAW", and "context_report" events.
    *   Added `waterfall_filter_noise` toggle to `gallium_ui_t`, defaulted to `true`.
    *   Mapped `n` key (when focused on Waterfall) to toggle filtering.

2.  **Navigation**:
    *   Added `FOCUS_WATERFALL` to the focus cycle (Tab/Right/Left).
    *   Implemented Up/Down navigation within the Waterfall list to select events.
    *   Added `waterfall_selected_idx` to track selection.

3.  **Peek Functionality**:
    *   Implemented `create_peek_modal` to show the full JSON payload of the selected event.
    *   Mapped `Enter` key (when focused on Waterfall) to open the peek modal.
    *   Mapped `Esc` or `Enter` to close the peek modal.

## Verification
1.  **Build**: `nix develop --command ./build.sh` (Successful).
2.  **Manual Test**:
    *   Start Client: `build/bin/client/gallium-tui`.
    *   Toggle Waterfall: Press `w`.
    *   Focus Waterfall: Press `Tab` until "Waterfall Logs" border is green.
    *   Toggle Filter: Press `n`. Observe "Waterfall (Filter: OFF)" in header.
    *   Select Event: Use Up/Down arrows. Selection should highlight in green/black.
    *   Peek: Press `Enter` on a selected event. A blue modal with JSON details should appear.
    *   Close Peek: Press `Esc`.
