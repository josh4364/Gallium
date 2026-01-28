import time
import random
import logging
from google import genai
from google.genai import types, errors

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Agent")

class Agent:
    def __init__(self, client, model_name="gemini-3-flash-preview", tools=None, system_instruction=None):
        self.client = client
        self.model_name = model_name
        self.config = types.GenerateContentConfig(
            temperature=0.9,
            top_p=1,
            top_k=1,
            max_output_tokens=2048,
            tools=tools,
            system_instruction=system_instruction,
            safety_settings=[
                types.SafetySetting(
                    category="HARM_CATEGORY_HARASSMENT",
                    threshold="BLOCK_MEDIUM_AND_ABOVE",
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_HATE_SPEECH",
                    threshold="BLOCK_MEDIUM_AND_ABOVE",
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold="BLOCK_MEDIUM_AND_ABOVE",
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold="BLOCK_MEDIUM_AND_ABOVE",
                ),
            ]
        )

    def start_chat(self, history=None):
        """Starts a new chat session with optional history."""
        chat = self.client.chats.create(model=self.model_name, config=self.config, history=history)
        return ChatSession(chat)

class ChatSession:
    def __init__(self, chat):
        self.chat = chat

    def prompt(self, text, stream=True, max_retries=5, base_delay=2.0):
        """
        Sends a message to the model with exponential backoff for rate limiting.
        """
        attempt = 0
        while attempt <= max_retries:
            try:
                if stream:
                    return self.chat.send_message_stream(text)
                else:
                    return self.chat.send_message(text)
            
            except Exception as e:
                # Check for 429 Too Many Requests or 503 Service Unavailable
                is_retryable = False
                if hasattr(e, 'code') and (e.code == 429 or e.code == 503):
                    is_retryable = True
                elif hasattr(e, 'status') and (e.status == 'RESOURCE_EXHAUSTED' or e.status == 'UNAVAILABLE'):
                    is_retryable = True
                elif "RESOURCE_EXHAUSTED" in str(e) or "UNAVAILABLE" in str(e) or "429" in str(e) or "503" in str(e):
                     is_retryable = True

                if is_retryable:
                    attempt += 1
                    if attempt > max_retries:
                        logger.error(f"Max retries exceeded: {e}")
                        raise
                    
                    # Exponential backoff with jitter
                    delay = (base_delay * (2 ** (attempt - 1))) + random.uniform(0, 1)
                    logger.warning(f"Retryable error ({e}). Retrying in {delay:.2f} seconds (Attempt {attempt}/{max_retries})...")
                    time.sleep(delay)
                else:
                    logger.error(f"API Error: {type(e)} {e}")
                    raise
