# Gemini-CLI Bridge Documentation

## Overview
This integration provides a fallback mechanism for Gallium development when the main API key is rate-limited. It bridges the local Gallium toolset (filesystem access, command execution, etc.) to `gemini-cli`, allowing it to act as a capable local agent.

## Architecture
The solution uses the Model Context Protocol (MCP) to expose Python functions as tools.

1.  **MCP Server (`source/mcp_bridge.py`)**:
    -   Uses `mcp.server.fastmcp` to create a lightweight MCP server.
    -   Imports tools from `source.tools`.
    -   Wraps tool functions to ensure arguments like paths are converted to absolute paths (required by the bridge execution context).
    -   Runs over stdio by default.

2.  **Orchestrator (`source/fallback.py`)**:
    -   Wraps the `gemini-cli` invocation.
    -   Checks if the `gallium-bridge` MCP server is registered in `gemini-cli`.
    -   If not registered, it registers it using the current Python interpreter (which has the `mcp` package installed via `flake.nix`).
    -   Launches `gemini-cli` in interactive mode.

## Prerequisities
The environment must include the `mcp` python package. This is handled in `flake.nix` by adding `mcp` to the `python312.withPackages` derivation.

## Usage
To launch the fallback session:

```bash
nix develop --command python3 source/fallback.py
```

This will:
1.  Enter the Nix development shell (if not already active).
2.  Register the bridge if needed.
3.  Drop you into a `gemini-cli` prompt where you can chat with the model.
4.  The model will automatically have access to tools `list_dir`, `view_file`, `grep_search`, etc.

## Troubleshooting

### "Directory path must be absolute" Error
The `gemini-cli` or the underlying tools often strictly require absolute paths. The `mcp_bridge.py` includes a wrapper to automatically `os.path.abspath()` inputs, but if you see this error, ensure your prompt provides clear paths or that the wrapper in `mcp_bridge.py` covers the specific tool you are using.

### Import Errors in Bridge
If `mcp_bridge.py` fails with `ModuleNotFoundError: No module named 'source'`, it usually means it's being run directly without the project root in `PYTHONPATH`. The script includes a try/except block to handle imports both as a module (`from source import tools`) and as a script (`import tools`), but running via `source/fallback.py` from the project root is the recommended method.

### "Connection closed" MCP Error
If `gemini-cli` reports an error connecting to the MCP server:
1.  Ensure no residual python processes are locking resources (though unlikely with stdio).
2.  Verify `flake.nix` environment is active and `mcp` is installed (`python3 -c "import mcp"`).
3.  Try unregistering the server manually in `gemini-cli`: `gemini mcp remove gallium-bridge`.

## Headless Usage
You can run `gemini-cli` in headless (non-interactive) mode to perform one-off tasks.

**Important**: When running headless, you must use the `--yolo` flag to automatically approve tool execution, as there is no user to interact with the confirmation prompt.

Example using the provided demo script:
```bash
nix develop --command python3 source/headless_demo.py
```

Or manually:
```bash
nix shell github:NixOS/nixpkgs/nixos-unstable#gemini-cli --command gemini --yolo "Calculate 10 * 10 using the calculate tool"
```
