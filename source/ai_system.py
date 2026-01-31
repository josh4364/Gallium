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
KEY_FILE = os.path.join(os.path.dirname(__file__), "..", "keys.json")
try:
    if os.path.exists(KEY_FILE):
        import json
        with open(KEY_FILE, "r") as f:
            keys = json.load(f)
            # Try both casings
            api_key = keys.get("gemini_api_key") or keys.get("GEMINI_API_KEY")
            if api_key:
                os.environ["GEMINI_API_KEY"] = api_key
                logger.info("Loaded API Key from keys.json")
except Exception as e:
    logger.warning(f"Failed to load keys.json: {e}")

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
    use_fallback: bool = False,
    response_mime_type: str = None
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
        response_mime_type: Optional MIME type for the response (e.g., 'application/json').
        
    Returns:
        The text response from the AI.
    """
    
    full_prompt = user_prompt
    if context_data:
        full_prompt += "\n\nCONTEXT DATA:\n"
        for k, v in context_data.items():
            full_prompt += f"--- {k} ---\n{v}\n"

    if use_fallback:
        return _eval_with_cli(system_prompt, full_prompt, tools, response_mime_type)
    
    return _eval_with_api(system_prompt, full_prompt, tools, model_name, response_mime_type)

def AI_Eval_to_json(
    system_prompt: str,
    user_prompt: str,
    context_data: dict = None,
    tools: list = None,
    model_name: str = "gemini-3-flash-preview",
    use_fallback: bool = False
):
    """
    Variant of AI_Eval that requests a JSON response.
    """
    return AI_Eval(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        context_data=context_data,
        tools=tools,
        model_name=model_name,
        use_fallback=use_fallback,
        response_mime_type="application/json"
    )

def _eval_with_api(system_prompt, full_prompt, tools, model_name, response_mime_type=None):
    client = get_client()
    
    config = types.GenerateContentConfig(
        temperature=0.7, 
        top_p=0.95,
        top_k=64,
        max_output_tokens=8192,
        tools=tools,
        system_instruction=system_prompt,
        response_mime_type=response_mime_type,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False),
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
                return _eval_with_cli(system_prompt, full_prompt, tools, response_mime_type)

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

def _eval_with_cli(system_prompt, full_prompt, tools=None, response_mime_type=None):
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
        try:
            allowed_tool_names = [t.__name__ for t in tools if hasattr(t, '__name__')]
        except Exception as e:
            logger.warning(f"Could not extract tool names: {e}")
            
    # Ensure MCP is configured so the CLI has tools
    try:
        fallback.ensure_mcp_configured(allowed_tools=allowed_tool_names, cwd=os.getcwd())
    except Exception as e:
        logger.warning(f"Failed to ensure MCP configured: {e}")

    # Combining system prompt and user prompt
    combined_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER PROMPT:\n{full_prompt}"
    
    # Use shlex to split the base command safely
    import shlex
    cmd_base = shlex.split(fallback.GEMINI_CLI_CMD)
    
    # Construct full argument list
    cmd_args = cmd_base + ["--yolo", "--model", "gemini-3-flash-preview"]
    
    if response_mime_type == "application/json":
        cmd_args += ["--output-format", "json"]
    
    cmd_args += ["--prompt", combined_prompt]
    
    logger.info(f"Attempting fallback to gemini-cli: {' '.join(shlex.quote(a) for a in cmd_args)}")
    
    try:
        # Using shell=False with a list of arguments is much safer and avoids shell evaluation issues.
        result = subprocess.run(cmd_args, capture_output=True, text=True)
        
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
