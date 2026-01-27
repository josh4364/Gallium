# Step 19: Context Window Usage Monitoring

## Goal
Implement context window usage monitoring and reporting to track LLM token consumption and warn when approaching limits.

## Implementation Details

1.  **Database Layer**:
    *   Added `db_get_total_tokens()` to `source/server/db_manager.c` to aggregate lifetime token usage from `llm_logs`.

2.  **LLM Client Logic**:
    *   Updated `gallium_llm_generate` in `source/server/llm_client.c`.
    *   Defined `CONTEXT_WINDOW_LIMIT` (1,000,000 tokens) and `CONTEXT_WARNING_THRESHOLD` (80%).
    *   Added logic to calculate percentage usage of the current request.
    *   Added `context_warning` event logging if usage exceeds 80%.
    *   Added `context_report` event logging for every request, showing current and lifetime usage.

3.  **Testing**:
    *   Added `--test-context` to `gallium-server`.
    *   Verified that token usage is correctly aggregated and reported.

## Verification
Run the context test:
```bash
build/bin/server/gallium-server --test-context
```
Expected output:
```
Running Context Usage Test...
Total tokens: 400
Context Usage Test PASSED.
```
