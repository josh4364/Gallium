import subprocess
import sys
try:
    from source import fallback
except ImportError:
    import fallback

def run_headless_demo():
    print("=== Starting Headless Demo ===")
    
    # Ensure bridge is ready
    print("Checking MCP configuration...")
    fallback.ensure_mcp_configured()
    
    # The prompt
    query = "Calculate 12345 * 67890 using the calculate tool and tell me the result."
    
    # Construct command: gemini-cli [query]
    # Reusing the command base from fallback
    cmd = f"{fallback.GEMINI_CLI_CMD} --yolo '{query}'"
    
    print(f"\nRunning command: {cmd}")
    print("Waiting for output...\n")
    
    try:
        # Run and capture output
        # Using subprocess.run to capture stdout/stderr easily
        result = subprocess.run(
            cmd, 
            shell=True, 
            text=True, 
            capture_output=True
        )
        
        print("--- STDOUT ---")
        print(result.stdout)
        print("--- STDERR ---")
        print(result.stderr)
        print("--- END ---")
        
        if result.returncode != 0:
            print(f"Command failed with exit code: {result.returncode}")
            sys.exit(result.returncode)
            
    except Exception as e:
        print(f"Error running demo: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_headless_demo()
