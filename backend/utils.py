import psutil
import subprocess
import json
import logging
import os
from datetime import datetime

CHAT_HISTORY_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "chat_history.json")

def get_hardware_metrics():
    """
    Returns current CPU and RAM usage.
    """
    try:
        cpu_usage = psutil.cpu_percent(interval=0.1)
        ram_usage = psutil.virtual_memory().percent
        return {
            "cpu_usage": cpu_usage,
            "ram_usage": ram_usage
        }
    except Exception as e:
        logging.error(f"Error getting hardware metrics: {e}")
        return {"cpu_usage": 0, "ram_usage": 0}

def get_models():
    """
    Executes 'ollama list' and parses the output to return a list of model names.
    """
    try:
        result = subprocess.run(['ollama', 'list'], capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')
        
        # Skip header and extract model names
        models = []
        for line in lines[1:]:
            if line.strip():
                parts = line.split()
                if parts:
                    models.append(parts[0])
        return models
    except Exception as e:
        logging.error(f"Error listing ollama models: {e}")
        return []

def get_chat_history():
    """
    Returns the chat history from the JSON file.
    """
    if not os.path.exists(CHAT_HISTORY_FILE):
        return []
    try:
        with open(CHAT_HISTORY_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        logging.error(f"Error reading chat history: {e}")
        return []

def save_chat_message(prompt, model, response):
    """
    Saves a chat message and response to the history file.
    """
    history = get_chat_history()
    
    entry = {
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "model": model,
        "response": response
    }
    
    history.append(entry)
    
    # Keep last 100 messages
    try:
        os.makedirs(os.path.dirname(CHAT_HISTORY_FILE), exist_ok=True)
        with open(CHAT_HISTORY_FILE, "w") as f:
            json.dump(history[-100:], f, indent=4)
    except Exception as e:
        logging.error(f"Error saving chat message: {e}")
