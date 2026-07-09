import time

import requests

OLLAMA_URL = "http://localhost:11434/api/generate"


def ask_ollama(model, prompt):
    """Sends a prompt to the Ollama API and measures response time."""
    start_time = time.time()

    try:
        response = requests.post(
            OLLAMA_URL, json={"model": model, "prompt": prompt, "stream": False}
        )
        response.raise_for_status()
        data = response.json()

        end_time = time.time()
        response_time = round(end_time - start_time, 2)

        return {
            "model": model,
            "response": data["response"],
            "response_time": response_time,
            "response_length": len(data["response"]),
        }
    except Exception as e:
        return {"model": model, "error": str(e), "response_time": 0}
