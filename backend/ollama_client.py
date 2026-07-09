import requests
import time
import random
from utils import get_hardware_metrics

OLLAMA_API_URL = "http://localhost:11434/api/generate"

MOCK_RESPONSES = [
    "This is a sample response demonstrating the benchmark interface. In a real local deployment, this would be generated live by your Ollama model running on your machine.",
    "Here's a demo answer showing how the chat and benchmarking UI works. Clone this repo and run it locally with Ollama installed to see real model responses and live performance metrics.",
    "Sample output: local language models can run entirely offline once downloaded via Ollama. This response is simulated because the live demo runs on a cloud server without a local model available.",
]

def generate_mock_response(model: str, prompt: str):
    """
    Returns a realistic-looking simulated response when real Ollama
    isn't reachable (e.g. on a cloud deployment with no local model).
    """
    text = random.choice(MOCK_RESPONSES)
    fake_time = round(random.uniform(0.8, 2.5), 2)
    fake_tokens = len(text.split())
    return {
        "model": model,
        "response": text,
        "response_time": fake_time,
        "response_length": len(text),
        "token_count": fake_tokens,
        "tokens_per_sec": round(fake_tokens / fake_time, 2),
        "system_metrics": {
            "cpu": round(random.uniform(15, 45), 1),
            "ram": round(random.uniform(30, 60), 1)
        },
        "mock": True
    }

def ask_ollama(model: str, prompt: str):
    """
    Sends a prompt to the Ollama API and returns the response, timing, and system metrics.
    Falls back to a simulated response if Ollama isn't reachable (e.g. cloud deployment).
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    start_metrics = get_hardware_metrics()
    start_time = time.time()
    try:
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=10)
        response.raise_for_status()
        end_time = time.time()
        end_metrics = get_hardware_metrics()
        data = response.json()
        eval_count = data.get("eval_count", 0)
        eval_duration_ns = data.get("eval_duration", 1)
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
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        # Ollama isn't reachable (expected on cloud deployments) - use mock data
        return generate_mock_response(model, prompt)
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
