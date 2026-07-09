import requests
import time
from utils import get_hardware_metrics

OLLAMA_API_URL = "http://localhost:11434/api/generate"

def ask_ollama(model: str, prompt: str):
    """
    Sends a prompt to the Ollama API and returns the response, timing, and system metrics.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    
    # Capture metrics BEFORE the run
    start_metrics = get_hardware_metrics()
    start_time = time.time()
    
    try:
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=120)
        response.raise_for_status()
        end_time = time.time()
        
        # Capture metrics AFTER the run
        end_metrics = get_hardware_metrics()
        
        data = response.json()
        
        # Calculate Tokens Per Second (TPS)
        # Ollama returns eval_count (tokens) and eval_duration (nanoseconds)
        eval_count = data.get("eval_count", 0)
        eval_duration_ns = data.get("eval_duration", 1) # avoid div by zero
        tps = round(eval_count / (eval_duration_ns / 1e9), 2) if eval_count > 0 else 0
        
        return {
            "model": model,
            "response": data.get("response", ""),
            "response_time": round(end_time - start_time, 2),
            "response_length": len(data.get("response", "")),
            "token_count": eval_count,
            "tokens_per_sec": tps,
            "system_metrics": {
                "cpu": round((start_metrics["cpu_usage"] + end_metrics["cpu_usage"]) / 2, 1),
                "ram": round((start_metrics["ram_usage"] + end_metrics["ram_usage"]) / 2, 1)
            }
        }
    except Exception as e:
        return {
            "model": model,
            "error": str(e),
            "response_time": 0,
            "response_length": 0,
            "token_count": 0,
            "tokens_per_sec": 0,
            "system_metrics": {"cpu": 0, "ram": 0}
        }
