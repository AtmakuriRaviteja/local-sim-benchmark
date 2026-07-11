import json
import os

from ollama_client import ask_ollama

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "../data/benchmark_results.json")


def run_benchmark(prompt, model=None):
    """Runs the prompt across all supported models or a single model."""
    if model:
        models = [model]
    else:
        models = ["phi3", "tinyllama", "mistral"]
    results = []

    for m in models:
        print(f"Benchmarking {m}...")
        res = ask_ollama(m, prompt)
        results.append(res)

    save_results(results)
    
    if model:
        return results[0]
    return results

def run_suite(model):
    """Runs a predefined suite of prompts on the model."""
    prompts = [
        "Provide a 1 paragraph summary of the history of computing.",
        "Write a python script to reverse a string.",
        "Explain quantum mechanics to a 5 year old."
    ]
    results = []
    for prompt in prompts:
        res = ask_ollama(model, prompt)
        res["prompt"] = prompt
        results.append(res)
    return results

def run_dataset(model):
    """Runs a dataset classification benchmark on the model."""
    prompts = [
        "Classify this sentiment: 'I absolutely loved this product, it works perfectly!' Options: Positive, Negative, Neutral.",
        "Classify this sentiment: 'It was okay, nothing special.' Options: Positive, Negative, Neutral.",
        "Classify this sentiment: 'This is the worst experience I have ever had.' Options: Positive, Negative, Neutral."
    ]
    results = []
    for prompt in prompts:
        res = ask_ollama(model, prompt)
        res["prompt"] = prompt
        results.append(res)
    return results


def save_results(results):
    """Saves benchmark results to a local JSON file."""
    try:
        with open(RESULTS_FILE, "w") as f:
            json.dump(results, f, indent=4)
    except Exception as e:
        print(f"Error saving results: {e}")
