import os
import subprocess
import json
import sys

# Configuration
GEMINI_CLI_CMD = "nix shell github:NixOS/nixpkgs/nixos-unstable#gemini-cli --command gemini"
BRIDGE_SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), "mcp_bridge.py"))
MCP_SERVER_NAME = "gallium-bridge"

def ensure_mcp_configured():
    """
    Ensure the MCP bridge is registered with gemini-cli.
    """
    # Check if we can list servers
    check_cmd = f"{GEMINI_CLI_CMD} mcp list"
    try:
        output = subprocess.check_output(check_cmd, shell=True, text=True, stderr=subprocess.STDOUT)
        if MCP_SERVER_NAME in output:
            print(f"MCP server '{MCP_SERVER_NAME}' already registered.")
            return
    except subprocess.CalledProcessError:
        # Ignore error if it fails (maybe no servers yet)
        pass

    # Add the server
    # We execute the python script using the current interpreter (which has mcp installed)
    python_exe = sys.executable
    add_cmd = f"{GEMINI_CLI_CMD} mcp add {MCP_SERVER_NAME} {python_exe} {BRIDGE_SCRIPT}"
    
    print(f"Registering MCP server: {add_cmd}")
    try:
        subprocess.check_call(add_cmd, shell=True)
        print("Successfully registered MCP server.")
    except subprocess.CalledProcessError as e:
        print(f"Failed to register MCP server: {e}")
        sys.exit(1)

def run_interactive():
    """
    Run gemini-cli in interactive mode.
    """
    cmd = f"{GEMINI_CLI_CMD} --prompt-interactive 'Hello, I am running from the fallback script. Please verify you can access my filesystem by listing the current directory.'"
    
    # We might want to pass existing context or history here in the future.
    
    print(f"Launching gemini-cli: {cmd}")
    try:
        # Use simple os.system or subprocess.call for interactive shell
        subprocess.call(cmd, shell=True)
    except Exception as e:
        print(f"Error running gemini-cli: {e}")

if __name__ == "__main__":
    print("Setting up gemini-cli fallback...")
    ensure_mcp_configured()
    run_interactive()
