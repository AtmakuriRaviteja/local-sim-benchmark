from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from benchmark import run_benchmark
from ollama_client import ask_ollama

app = FastAPI(title="Local AI Benchmark API")

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ask")
def ask(prompt: str, model: str):
    """Endpoint to ask a specific model a question."""
    return ask_ollama(model, prompt)


@app.get("/benchmark")
def benchmark(prompt: str, model: str = None):
    """Endpoint to run a benchmark across all models or a single model if specified."""
    return run_benchmark(prompt, model)

@app.get("/suite")
def suite(model: str):
    """Run an evaluation suite on a specific model."""
    from benchmark import run_suite
    return run_suite(model)

@app.get("/dataset")
def dataset(model: str):
    """Run a dataset evaluation on a specific model."""
    from benchmark import run_dataset
    return run_dataset(model)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
