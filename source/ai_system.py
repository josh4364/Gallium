import os
import logging
import time
import random
import subprocess
from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AI_System")

# Load API Key
# Assuming KEYS_FILE is handled similarly to main.py or environment
# For now, we'll try to load from keys.json if it exists, or env
try:
    import json
    with open("keys.json", "r") as f:
        keys = json.load(f)
        os.environ["GEMINI_API_KEY"] = keys.get("GEMINI_API_KEY", "")
except FileNotFoundError:
    pass

_CLIENT = None

def get_client():
    global _CLIENT
    if _CLIENT is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            logger.warning("GEMINI_API_KEY not found in environment.")
        _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT

def AI_Eval(
    system_prompt: str,
    user_prompt: str,
    context_data: dict = None,
    tools: list = None,
    model_name: str = "gemini-3-flash-preview",
    use_fallback: bool = False
):
    """
    Evaluates the prompt using the configured backend (API or CLI Fallback).
    
    Args:
        system_prompt: The system instruction.
        user_prompt: The main user query.
        context_data: Dictionary of context items to include in the prompt.
        tools: List of tools to make available.
        model_name: The model to use.
        use_fallback: Whether to force use of the CLI fallback.
        
    Returns:
        The text response from the AI.
    """
    
    full_prompt = user_prompt
    if context_data:
        full_prompt += "\n\nCONTEXT DATA:\n"
        for k, v in context_data.items():
            full_prompt += f"--- {k} ---\n{v}\n"

    if use_fallback:
        return _eval_with_cli(system_prompt, full_prompt, tools)
    
    return _eval_with_api(system_prompt, full_prompt, tools, model_name)

def _eval_with_api(system_prompt, full_prompt, tools, model_name):
    client = get_client()
    
    config = types.GenerateContentConfig(
        temperature=0.7, # Lower temperature for decision making?
        top_p=0.95,
        top_k=64,
        max_output_tokens=8192,
        tools=tools,
        system_instruction=system_prompt,
        safety_settings=[
            types.SafetySetting(
                category="HARM_CATEGORY_HATE_SPEECH",
                threshold="BLOCK_NONE",
            ),
             types.SafetySetting(
                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold="BLOCK_NONE",
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_HARASSMENT",
                threshold="BLOCK_NONE",
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold="BLOCK_NONE",
            ),
        ]
    )
    
    max_retries = 3
    attempt = 0
    base_delay = 2.0

    while attempt <= max_retries:
        try:
            # We use chats.create but for a single turn it's effectively generate_content
            # behavior, but maintaining the chat interface used in base_agent might be desired.
            # However, AI_Eval sounds like a single function call.
            # Lets use models.generate_content for pure functional use
            response = client.models.generate_content(
                model=model_name,
                contents=full_prompt,
                config=config
            )
            return response.text
        except Exception as e:
            # Check for 429 Too Many Requests or 503 Service Unavailable
            error_str = str(e)
            is_quota_error = "RESOURCE_EXHAUSTED" in error_str or "429" in error_str
            
            if is_quota_error:
                logger.warning(f"Quota exhausted (429). Switching to CLI fallback immediately.")
                return _eval_with_cli(system_prompt, full_prompt, tools)

            is_retryable = "UNAVAILABLE" in error_str or "503" in error_str

            if is_retryable:
                attempt += 1
                if attempt > max_retries:
                    logger.error(f"Max retries exceeded: {e}")
                    raise e
                
                delay = (base_delay * (2 ** (attempt - 1))) + random.uniform(0, 1)
                logger.warning(f"Retryable error ({e}). Retrying in {delay:.2f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"API Error: {type(e)} {e}")
                # Try fallback for other errors too? Maybe not.
                raise e

                raise e

def _eval_with_cli(system_prompt, full_prompt, tools=None):
    """
    Attempts to use the gemini-cli via nix shell.
    Uses source.fallback module configuration.
    """
    try:
        from source import fallback
    except ImportError:
        import fallback

    # Extract tool names
    allowed_tool_names = None
    if tools:
        # Assuming tools is a list of functions
        try:
            allowed_tool_names = [t.__name__ for t in tools if hasattr(t, '__name__')]
        except Exception as e:
            logger.warning(f"Could not extract tool names: {e}")
            
    # Ensure MCP is configured so the CLI has tools
    try:
        # Pass current CWD (which should be the sandbox root set by main.py)
        fallback.ensure_mcp_configured(allowed_tools=allowed_tool_names, cwd=os.getcwd())
    except Exception as e:
        logger.warning(f"Failed to ensure MCP configured: {e}")

    # Combining system prompt and user prompt
    # Note: CLI might treat them as single prompt anyway via --yolo or --prompt
    combined_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER PROMPT:\n{full_prompt}"
    
    # Escape quotes for shell safety
    import shlex
    quoted_prompt = shlex.quote(combined_prompt)
    
    # Construct command using fallback constant + yolo
    cmd = f"{fallback.GEMINI_CLI_CMD} --yolo --prompt {quoted_prompt}"
    
    logger.info(f"Attempting fallback to gemini-cli: {cmd}")
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        # Log stdout/stderr for debugging
        if result.stdout:
            logger.info(f"CLI STDOUT: {result.stdout[:200]}...")
        if result.stderr:
            logger.warning(f"CLI STDERR: {result.stderr[:200]}...")
            
        if result.returncode != 0:
             if "RESOURCE_EXHAUSTED" in result.stderr:
                 return f"ERROR: CLI Fallback also exhausted: {result.stderr}"
             return f"ERROR: CLI Fallback failed: {result.stderr}"
             
        return result.stdout.strip()
    except Exception as e:
        return f"ERROR: CLI Fallback execution error: {e}"
