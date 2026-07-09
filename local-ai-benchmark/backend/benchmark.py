from .ollama_client import ask_ollama
import json
import os

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "../data/benchmark_results.json")

def run_benchmark(prompt):
    """Runs the prompt across all supported models."""
    models = ["phi3", "tinyllama", "mistral"]
    results = []
    
    for model in models:
        print(f"Benchmarking {model}...")
        res = ask_ollama(model, prompt)
        results.append(res)
        
    save_results(results)
    return results

def save_results(results):
    """Saves benchmark results to a local JSON file."""
    try:
        with open(RESULTS_FILE, "w") as f:
            json.dump(results, f, indent=4)
    except Exception as e:
        print(f"Error saving results: {e}")
