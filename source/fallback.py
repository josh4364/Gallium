import os
import subprocess
import json
import sys

# Configuration
GEMINI_CLI_CMD = "nix shell github:NixOS/nixpkgs/nixos-unstable#gemini-cli --command gemini"
BRIDGE_SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), "mcp_bridge.py"))
MCP_SERVER_NAME = "gallium-bridge"

def ensure_mcp_configured(allowed_tools=None, cwd=None, dynamic_tools_path=None):
    """
    Ensure the MCP bridge is registered with gemini-cli.
    Args:
        allowed_tools: List of tool names to whitelist.
        cwd: The working directory for the bridge to use as sandbox root.
        dynamic_tools_path: Path to a JSON file containing dynamic tool definitions.
    """
    
    # Construct arguments for the bridge script
    python_exe = sys.executable
    script_args = f"{BRIDGE_SCRIPT}"
    
    if cwd:
        script_args += f" --root {cwd}"
        
    if allowed_tools:
        tools_str = ",".join(allowed_tools)
        script_args += f" --tools {tools_str}"
        
    if dynamic_tools_path:
        script_args += f" --dynamic-tools {dynamic_tools_path}"
        
    full_server_cmd = f"{python_exe} {script_args}"
    
    # Check if we need to update the registration.
    # Current limitation: we can't easily query the specific command args of a registered server via `mcp list`.
    # `mcp list` usually just shows names or statii.
    # To ensure correctness, we might have to remove and re-add if we want to guarantee state,
    # especially since we are changing dynamic args (cwd, tools).
    # THIS IS OKAY for a fallback script used in a one-off manner.
    
    # Always remove to ensure fresh config
    remove_cmd = f"{GEMINI_CLI_CMD} mcp remove {MCP_SERVER_NAME}"
    try:
        subprocess.run(remove_cmd, shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    except:
        pass

    # Add the server
    add_cmd = f"{GEMINI_CLI_CMD} mcp add {MCP_SERVER_NAME} {full_server_cmd}"
    
    print(f"Registering MCP server: {add_cmd}")
    try:
        subprocess.check_call(add_cmd, shell=True)
        # print("Successfully registered MCP server.")
    except subprocess.CalledProcessError as e:
        print(f"Failed to register MCP server: {e}")
        # Dont exit, let it fail at runtime if needed, or raise?
        # raise e

def run_interactive():
    """
    Run gemini-cli in interactive mode.
    """
    # Interactive mode might not have specific CWD or tools unless passed.
    # We default to current CWD and all tools if running directly.
    ensure_mcp_configured(cwd=os.getcwd())
    
    cmd = f"{GEMINI_CLI_CMD} --prompt-interactive 'Hello, I am running from the fallback script. Please verify you can access my filesystem by listing the current directory.'"
    
    print(f"Launching gemini-cli: {cmd}")
    try:
        # Use simple os.system or subprocess.call for interactive shell
        subprocess.call(cmd, shell=True)
    except Exception as e:
        print(f"Error running gemini-cli: {e}")

if __name__ == "__main__":
    print("Setting up gemini-cli fallback...")
    run_interactive()
