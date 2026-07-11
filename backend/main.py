import concurrent.futures
import json
import os
from datetime import datetime
from typing import List, Optional

import requests
from evaluation_suite import generate_report_content, run_evaluation
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

# Internal imports
from ollama_client import ask_ollama, generate_mock_response, stream_ollama
from pydantic import BaseModel
from utils import (
    get_chat_history,
    get_hardware_metrics,
    get_models,
    get_system_info,
    save_chat_message,
)

app = FastAPI(title="Local SLM Benchmark API")


class SmartQueryRequest(BaseModel):
    model: str
    prompt: str


OMDB_API_KEY = "ae679361"


def get_movie_data(query: str):
    """Fetches top 3 movies from OMDb API."""
    try:
        # Extract title from prompt (simple heuristic)
        # e.g. "latest spider man movie" -> "spider man"
        search_term = (
            query.lower()
            .replace("latest", "")
            .replace("movie", "")
            .replace("newest", "")
            .replace("film", "")
            .strip()
        )
        if not search_term:
            return None

        url = f"http://www.omdbapi.com/?apikey={OMDB_API_KEY}&s={search_term}"
        res = requests.get(url, timeout=5).json()

        if "Search" not in res:
            return None

        movies = res["Search"][:3]  # top 3 results
        return [
            {
                "title": m["Title"],
                "year": m["Year"],
                "poster": m["Poster"] if m["Poster"] != "N/A" else None,
            }
            for m in movies
        ]
    except Exception as e:
        print(f"OMDb Error: {e}")
        return None


# ── Benchmark Suite Configuration ─────────────────────────────────────────────

SUITE_PROMPTS = [
    {
        "id": "speed",
        "type": "Speed",
        "text": "Explain artificial intelligence in exactly 50 words. Be clear and concise.",
        "check": lambda r: len(r.strip()) > 10,  # any real response
    },
    {
        "id": "reasoning",
        "type": "Reasoning",
        "text": "A farmer has 17 sheep. All but 9 die. How many sheep are left? Show your reasoning step by step.",
        "check": lambda r: "9" in r,
    },
    {
        "id": "coding",
        "type": "Coding",
        "text": "Write a Python function to check if a number is prime. Include a docstring and example usage.",
        "check": lambda r: "def " in r,
    },
    {
        "id": "memory",
        "type": "Memory",
        "text": "Remember this number: 47291. Now explain what a database is in 2 sentences. After that, repeat the number you were told to remember.",
        "check": lambda r: "47291" in r,
    },
]


class SuiteRequest(BaseModel):
    models: Optional[List[str]] = None  # None → all installed models


# ── Request Models ─────────────────────────────────────────────────────────────
class BenchmarkRequest(BaseModel):
    model: str
    prompt: str


class CompareRequest(BaseModel):
    models: Optional[List[str]] = None  # if None, use all installed models
    prompt: str


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Existing Endpoints (unchanged) ─────────────────────────────────────────────


@app.get("/models")
def get_models_list():
    """Returns a list of installed Ollama models."""
    return {"models": get_models()}


@app.get("/system")
def get_system_status():
    """Returns real-time system hardware metrics."""
    return get_hardware_metrics()


@app.get("/system-info")
def system_info():
    """Returns static system information."""
    return get_system_info()


@app.get("/ask")
async def ask(prompt: str = Query(...), model: str = Query(...)):
    """
    Streams a response from the specified local Ollama model.
    """
    return StreamingResponse(
        stream_ollama(model, prompt),
        media_type="text/event-stream"
    )


@app.get("/chat/history")
async def chat_history():
    """Returns the conversation history."""
    return get_chat_history()


@app.get("/evaluate")
async def evaluate(models: str = Query(None)):
    """Runs the multi-task evaluation suite."""
    model_list = models.split(",") if models else get_models()
    return run_evaluation(model_list)


@app.get("/evaluate/custom")
async def evaluate_custom(prompt: str = Query(...), models: str = Query(None)):
    """Runs evaluation with a custom prompt."""
    model_list = models.split(",") if models else get_models()
    from evaluation_suite import run_custom_evaluation

    return run_custom_evaluation(model_list, prompt)


@app.get("/report")
async def get_report(format: str = "json"):
    """Downloads the evaluation report."""
    content = generate_report_content(format)
    if not content:
        raise HTTPException(
            status_code=404,
            detail="No evaluation report found. Run an evaluation first.",
        )

    media_types = {"json": "application/json", "csv": "text/csv", "md": "text/markdown"}

    return Response(
        content=content,
        media_type=media_types.get(format, "text/plain"),
        headers={
            "Content-Disposition": f"attachment; filename=benchmark_report.{format}"
        },
    )


# ── NEW: Single-model Benchmark ────────────────────────────────────────────────


@app.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    """Runs a single model benchmark and returns JSON metrics (latency, TPS, tokens, response)."""
    res = ask_ollama(req.model, req.prompt)
    if "error" in res:
        raise HTTPException(status_code=500, detail=res["error"])
    return {
        "model": res["model"],
        "response": res["response"],
        "latency": res["response_time"],
        "tokens_per_sec": res["tokens_per_sec"],
        "tokens": res["token_count"],
        "cpu": res["system_metrics"]["cpu"],
        "ram": res["system_metrics"]["ram"],
    }


# ── NEW: Multi-model Comparison ────────────────────────────────────────────────


@app.post("/compare")
async def compare(req: CompareRequest):
    """Runs a prompt across all (or specified) models; returns results sorted by TPS with a winner field."""
    model_list = req.models if req.models else get_models()
    if not model_list:
        raise HTTPException(
            status_code=404,
            detail="No models found. Install at least one model via Ollama.",
        )

    results = []
    for model in model_list:
        res = ask_ollama(model, req.prompt)
        if "error" in res:
            results.append(
                {
                    "model": model,
                    "error": res["error"],
                    "latency": 0,
                    "tokens_per_sec": 0,
                    "tokens": 0,
                    "response": "",
                }
            )
        else:
            results.append(
                {
                    "model": res["model"],
                    "latency": res["response_time"],
                    "tokens_per_sec": res["tokens_per_sec"],
                    "tokens": res["token_count"],
                    "response": res["response"],
                    "cpu": res["system_metrics"]["cpu"],
                    "ram": res["system_metrics"]["ram"],
                }
            )

    # Sort by highest TPS (fastest model first)
    results.sort(key=lambda r: r["tokens_per_sec"], reverse=True)
    winner = results[0]["model"] if results else None
    return {"results": results, "winner": winner}


# ── NEW: Multi-Prompt Benchmark Suite ─────────────────────────────────────────


def _run_model_suite(model: str) -> dict:
    """
    Runs all SUITE_PROMPTS for a single model sequentially, then returns
    aggregated metrics. Designed to be called inside a ThreadPoolExecutor
    so that *different models* run in parallel.
    """
    latencies, tps_list = [], []
    correct, total = 0, 0
    tasks_detail = []

    for p in SUITE_PROMPTS:
        res = ask_ollama(model, p["text"])
        if "error" in res:
            tasks_detail.append(
                {"type": p["type"], "error": res["error"], "accuracy": 0}
            )
            total += 1
            continue

        response_text = res.get("response", "")
        acc = 1 if p["check"](response_text) else 0

        latencies.append(res["response_time"])
        tps_list.append(res["tokens_per_sec"])
        correct += acc
        total += 1

        tasks_detail.append(
            {
                "type": p["type"],
                "latency": res["response_time"],
                "tps": res["tokens_per_sec"],
                "accuracy": acc,
                "response": response_text[:300],  # truncate for payload size
            }
        )

    if not latencies:
        return {"model": model, "error": "All prompts failed", "score": 0}

    avg_latency = round(sum(latencies) / len(latencies), 2)
    avg_tps = round(sum(tps_list) / len(tps_list), 2)
    accuracy = round(correct / total, 2) if total else 0

    # Weighted score: speed rewarded, latency penalised, accuracy bonus
    score = round((avg_tps * 3) - (avg_latency * 2) + (accuracy * 50), 2)

    return {
        "model": model,
        "avg_latency": avg_latency,
        "avg_tps": avg_tps,
        "accuracy": accuracy,
        "score": score,
        "tasks": tasks_detail,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/benchmark-suite")
async def benchmark_suite(req: SuiteRequest):
    """
    Runs a rigorous 4-prompt benchmark suite across all (or specified) models.
    Models are evaluated in parallel for speed. Returns ranked leaderboard.
    """
    model_list = req.models if req.models else get_models()
    if not model_list:
        raise HTTPException(
            status_code=404,
            detail="No models found. Install at least one model via Ollama.",
        )

    # Run all models in parallel (each model processes its prompts sequentially)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(model_list)) as executor:
        futures = {executor.submit(_run_model_suite, m): m for m in model_list}
        results = []
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    # Sort by score descending → leaderboard order
    results.sort(key=lambda r: r.get("score", 0), reverse=True)
    winner = results[0]["model"] if results else None
    return {"results": results, "winner": winner, "prompt_count": len(SUITE_PROMPTS)}


# ── Dataset Benchmark ──────────────────────────────────────────────────────────

# Load the external prompts dataset at startup (gracefully handle missing file)
_DATASET_PATH = os.path.join(os.path.dirname(__file__), "benchmark", "prompts.json")
try:
    with open(_DATASET_PATH, "r", encoding="utf-8") as _f:
        BENCHMARK_DATASET = json.load(_f)
except FileNotFoundError:
    BENCHMARK_DATASET = []
    print(
        f"[WARN] Dataset not found at {_DATASET_PATH}. /dataset-benchmark will return empty results."
    )


class DatasetRequest(BaseModel):
    models: Optional[List[str]] = None  # None → all installed models


def _run_model_dataset(model: str) -> dict:
    """
    Runs all BENCHMARK_DATASET prompts for a single model.
    Checks each response against the expected keyword (case-insensitive).
    Uses per-prompt weights for a more meaningful accuracy score.
    """
    latencies, tps_list = [], []
    weighted_correct, total_weight = 0.0, 0.0
    tasks_detail = []

    for item in BENCHMARK_DATASET:
        res = ask_ollama(model, item["prompt"])
        weight = float(item.get("weight", 1.0))
        total_weight += weight

        if "error" in res:
            tasks_detail.append(
                {
                    "id": item["id"],
                    "type": item["type"],
                    "error": res["error"],
                    "correct": False,
                    "weight": weight,
                }
            )
            continue

        response_text = res.get("response", "")
        correct = item["expected"].lower() in response_text.lower()
        if correct:
            weighted_correct += weight

        latencies.append(res["response_time"])
        tps_list.append(res["tokens_per_sec"])

        tasks_detail.append(
            {
                "id": item["id"],
                "type": item["type"],
                "prompt": item["prompt"],
                "expected": item["expected"],
                "correct": correct,
                "weight": weight,
                "latency": res["response_time"],
                "tps": res["tokens_per_sec"],
                "response": response_text[:250],
            }
        )

    if not latencies:
        return {
            "model": model,
            "error": "All prompts failed",
            "score": 0,
            "accuracy_pct": 0,
            "avg_latency": 0,
            "avg_tps": 0,
        }

    avg_latency = round(sum(latencies) / len(latencies), 2)
    avg_tps = round(sum(tps_list) / len(tps_list), 2)
    accuracy_pct = (
        round((weighted_correct / total_weight) * 100, 1) if total_weight else 0.0
    )

    # Industry-style combined score: accuracy heavily weighted, speed matters, latency penalised
    score = round((accuracy_pct * 2) + (avg_tps * 1.5) - avg_latency, 2)

    return {
        "model": model,
        "accuracy_pct": accuracy_pct,
        "avg_latency": avg_latency,
        "avg_tps": avg_tps,
        "score": score,
        "tasks": tasks_detail,
        "prompt_count": len(BENCHMARK_DATASET),
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/dataset-benchmark")
async def dataset_benchmark(req: DatasetRequest):
    """
    Runs the external prompts.json dataset across all (or specified) models.
    Accuracy is measured by keyword matching against expected answers.
    Models run in parallel via ThreadPoolExecutor for speed.
    """
    if not BENCHMARK_DATASET:
        raise HTTPException(
            status_code=500,
            detail="Dataset not loaded. Ensure benchmark/prompts.json exists.",
        )

    model_list = req.models if req.models else get_models()
    if not model_list:
        raise HTTPException(
            status_code=404,
            detail="No models found. Install at least one model via Ollama.",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(model_list)) as executor:
        futures = {executor.submit(_run_model_dataset, m): m for m in model_list}
        results = []
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    results.sort(key=lambda r: r.get("score", 0), reverse=True)
    winner = results[0]["model"] if results else None
    return {
        "results": results,
        "winner": winner,
        "prompt_count": len(BENCHMARK_DATASET),
        "dataset_path": _DATASET_PATH,
    }


@app.get("/dataset")
async def get_dataset():
    """Returns the current benchmark dataset (prompts + metadata, no answers)."""
    return {
        "prompts": [
            {"id": p["id"], "type": p["type"], "prompt": p["prompt"]}
            for p in BENCHMARK_DATASET
        ],
        "count": len(BENCHMARK_DATASET),
    }


@app.get("/movie")
def get_movie(query: str):
    """Returns top 3 movie results for a query."""
    movie_results = get_movie_data(query)
    if not movie_results:
        return {"error": "No results found"}
    return movie_results


@app.post("/smart-query")
async def smart_query(req: SmartQueryRequest):
    """Routes query to OMDb (live) or local model."""
    prompt_lower = req.prompt.lower()

    # 1. Smart Intent Detection: Movie or Latest content
    is_movie_query = any(
        kw in prompt_lower
        for kw in ["movie", "film", "latest", "newest", "spider", "marvel"]
    )

    if is_movie_query:
        movie_data = get_movie_data(req.prompt)
        if movie_data:
            return movie_data  # Returns list directly for frontend Array.isArray check

    # 2. Fallback: Local model processing (Ollama)
    result = ask_ollama(req.model, req.prompt)

    # If Ollama is not reachable, return a graceful mock response
    if "error" in result and "response" not in result:
        result = generate_mock_response(req.model, req.prompt)

    if "error" not in result:
        save_chat_message(req.prompt, req.model, result["response"])
        # Same offline notice logic as /ask
        REALTIME_KEYWORDS = {"today", "now", "current", "news", "breaking"}
        if any(kw in prompt_lower for kw in REALTIME_KEYWORDS):
            warning = "⚠️ **Offline notice:** Knowledge cutoff applies.\n\n"
            result["response"] = warning + result["response"]
            result["offline_warning"] = True

    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
