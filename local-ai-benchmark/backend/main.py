from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .ollama_client import ask_ollama
from .benchmark import run_benchmark

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
def benchmark(prompt: str):
    """Endpoint to run a benchmark across all models."""
    return run_benchmark(prompt)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
