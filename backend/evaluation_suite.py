import json
import logging
import os
from datetime import datetime

from ollama_client import ask_ollama

EVAL_TASKS = [
    {
        "id": "explanation",
        "name": "Explanation",
        "prompt": "Explain artificial intelligence in one paragraph.",
    },
    {
        "id": "coding",
        "name": "Coding",
        "prompt": "Write a Python function that calculates Fibonacci numbers.",
    },
    {
        "id": "reasoning",
        "name": "Reasoning",
        "prompt": "Explain why the sky is blue in simple terms.",
    },
    {
        "id": "summarization",
        "name": "Summarization",
        "prompt": "Summarize the theory of relativity in a few sentences.",
    },
]

RESULTS_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "evaluation_results.json"
)
REPORT_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "benchmark_report.json"
)


def run_evaluation(model_names: list):
    """
    Runs the full evaluation suite for the given models.
    """
    all_results = []

    for model in model_names:
        model_metrics = {
            "model": model,
            "tasks": [],
            "avg_latency": 0,
            "avg_tps": 0,
            "avg_cpu": 0,
            "avg_ram": 0,
            "total_tokens": 0,
            "score": 0,
            "timestamp": datetime.now().isoformat(),
        }

        latencies = []
        tps_list = []
        cpus = []
        rams = []

        for task in EVAL_TASKS:
            print(f"Evaluating {model} on {task['name']}...")
            res = ask_ollama(model, task["prompt"])

            if "error" in res:
                logging.error(
                    f"Error evaluating {model} on {task['id']}: {res['error']}"
                )
                continue

            task_result = {
                "task_id": task["id"],
                "task_name": task["name"],
                "prompt": task["prompt"],
                "latency": res["response_time"],
                "tps": res["tokens_per_sec"],
                "tokens": res["token_count"],
                "cpu": res["system_metrics"]["cpu"],
                "ram": res["system_metrics"]["ram"],
                "response": res["response"],
            }

            model_metrics["tasks"].append(task_result)
            latencies.append(res["response_time"])
            tps_list.append(res["tokens_per_sec"])
            cpus.append(res["system_metrics"]["cpu"])
            rams.append(res["system_metrics"]["ram"])
            model_metrics["total_tokens"] += res["token_count"]

        # Calculate Averages
        if latencies:
            model_metrics["avg_latency"] = round(sum(latencies) / len(latencies), 2)
            model_metrics["avg_tps"] = round(sum(tps_list) / len(tps_list), 2)
            model_metrics["avg_cpu"] = round(sum(cpus) / len(cpus), 1)
            model_metrics["avg_ram"] = round(sum(rams) / len(rams), 1)

            # Score formula: score = avg_tps / avg_latency (penalty for high latency)
            # Avoid division by zero
            safe_latency = max(model_metrics["avg_latency"], 0.1)
            model_metrics["score"] = round(model_metrics["avg_tps"] / safe_latency, 2)

        all_results.append(model_metrics)

    save_results(all_results)
    return all_results


def run_custom_evaluation(model_names: list, custom_prompt: str):
    """
    Runs a single-prompt evaluation across models.
    """
    all_results = []

    for model in model_names:
        print(f"Custom Evaluating {model}...")
        res = ask_ollama(model, custom_prompt)

        if "error" in res:
            continue

        model_metrics = {
            "model": model,
            "tasks": [
                {
                    "task_id": "custom",
                    "latency": res["response_time"],
                    "tps": res["tokens_per_sec"],
                    "response": res["response"],
                }
            ],
            "avg_latency": res["response_time"],
            "avg_tps": res["tokens_per_sec"],
            "avg_cpu": res["system_metrics"]["cpu"],
            "avg_ram": res["system_metrics"]["ram"],
            "total_tokens": res["token_count"],
            "score": round(res["tokens_per_sec"] / max(res["response_time"], 0.1), 2),
            "timestamp": datetime.now().isoformat(),
        }
        all_results.append(model_metrics)

    save_results(all_results)
    return all_results


def save_results(results):
    """Saves the latest evaluation results."""
    try:
        os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
        # We append to a history of evaluations
        history = []
        if os.path.exists(RESULTS_FILE):
            with open(RESULTS_FILE, "r") as f:
                try:
                    history = json.load(f)
                except Exception:
                    history = []

        history.append({"timestamp": datetime.now().isoformat(), "results": results})

        with open(RESULTS_FILE, "w") as f:
            json.dump(history[-50:], f, indent=4)  # Keep last 50 evaluation runs

        # Also save as the latest report
        with open(REPORT_FILE, "w") as f:
            json.dump(results, f, indent=4)

    except Exception as e:
        logging.error(f"Failed to save results: {e}")


def generate_report_content(format: str):
    """Generates content for the report in requested format."""
    if not os.path.exists(REPORT_FILE):
        return None

    with open(REPORT_FILE, "r") as f:
        data = json.load(f)

    if format == "json":
        return json.dumps(data, indent=4)

    if format == "csv":
        header = "model,avg_tps,avg_latency,total_tokens,score,avg_cpu,avg_ram\n"
        rows = []
        for r in data:
            rows.append(
                f"{r['model']},{r['avg_tps']},{r['avg_latency']},{r['total_tokens']},{r['score']},{r['avg_cpu']},{r['avg_ram']}"
            )
        return header + "\n".join(rows)

    if format == "md":
        header = "# LLM Evaluation Report\n\n"
        header += f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        table = "| Model | Score | Avg TPS | Avg Latency | CPU | RAM |\n"
        table += "|-------|-------|---------|-------------|-----|-----|\n"
        for r in data:
            table += f"| {r['model']} | {r['score']} | {r['avg_tps']} | {r['avg_latency']}s | {r['avg_cpu']}% | {r['avg_ram']}% |\n"
        return header + table

    return None
