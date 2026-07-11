import json
import logging
import os
import subprocess
from datetime import datetime

import psutil

CHAT_HISTORY_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "chat_history.json"
)


def get_hardware_metrics():
    """
    Returns current CPU and RAM usage.
    """
    try:
        cpu_usage = psutil.cpu_percent(interval=0.1)
        ram_usage = psutil.virtual_memory().percent
        return {"cpu_usage": cpu_usage, "ram_usage": ram_usage}
    except Exception as e:
        logging.error(f"Error getting hardware metrics: {e}")
        return {"cpu_usage": 0, "ram_usage": 0}


def get_system_info():
    """
    Returns real system information: CPU model, RAM size, GPU name, and runtime.
    """
    import platform

    # ── CPU ──────────────────────────────────────────────────────────────────
    try:
        cpu_model = platform.processor()  # e.g. "Intel64 Family 6 Model..."
        if not cpu_model or cpu_model == "":
            cpu_model = f"{psutil.cpu_count(logical=True)}-Core Processor"
        else:
            # Shorten verbose strings: keep brand + core count
            cores = psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)
            # Remove excessive detail, keep the meaningful part
            cpu_model = cpu_model.split(",")[0].strip()
            if len(cpu_model) > 30:
                cpu_model = cpu_model[:30].strip()
            cpu_model = f"{cpu_model} ({cores}C)"
    except Exception:
        cpu_model = f"{psutil.cpu_count(logical=True)}-Core Processor"

    # ── RAM ──────────────────────────────────────────────────────────────────
    try:
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3))
        ram_str = f"{ram_gb} GB RAM"
    except Exception:
        ram_str = "Unknown RAM"

    # ── GPU ──────────────────────────────────────────────────────────────────
    gpu_name = "Unknown GPU"
    try:
        system = platform.system()
        if system == "Windows":
            result = subprocess.run(
                ["wmic", "path", "win32_VideoController", "get", "name"],
                capture_output=True, text=True, timeout=5
            )
            lines = [l.strip() for l in result.stdout.splitlines() if l.strip() and l.strip().lower() != "name"]
            if lines:
                gpu_name = lines[0]
        elif system == "Linux":
            # Try nvidia-smi first
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    gpu_name = result.stdout.strip().splitlines()[0]
                else:
                    raise RuntimeError("no nvidia")
            except Exception:
                result = subprocess.run(
                    ["lspci"], capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.splitlines():
                    if "VGA" in line or "3D" in line or "Display" in line:
                        gpu_name = line.split(":")[-1].strip()
                        break
        elif system == "Darwin":
            result = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True, text=True, timeout=10
            )
            for line in result.stdout.splitlines():
                if "Chipset Model" in line:
                    gpu_name = line.split(":")[-1].strip()
                    break
    except Exception:
        gpu_name = "Unknown GPU"

    return {
        "cpu": cpu_model,
        "ram": ram_str,
        "gpu": gpu_name,
        "runtime": "Ollama",
    }



def get_models():
    """
    Executes 'ollama list' and parses the output to return a list of model names.
    """
    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, check=True
        )
        lines = result.stdout.strip().split("\n")

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
        "response": response,
    }

    history.append(entry)

    # Keep last 100 messages
    try:
        os.makedirs(os.path.dirname(CHAT_HISTORY_FILE), exist_ok=True)
        with open(CHAT_HISTORY_FILE, "w") as f:
            json.dump(history[-100:], f, indent=4)
    except Exception as e:
        logging.error(f"Error saving chat message: {e}")
