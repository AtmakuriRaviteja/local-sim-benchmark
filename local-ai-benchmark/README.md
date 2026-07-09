# Local AI Benchmark 🚀

A full-stack local LLM benchmarking tool. Compare `phi3`, `tinyllama`, and `mistral` performance directly on your machine.

## Prerequisites

1. **Install Ollama**
   Download and install from [ollama.com](https://ollama.com).

2. **Download Models**
   Run the following commands in your terminal:
   ```bash
   ollama pull phi3
   ollama pull tinyllama
   ollama pull mistral
   ```

## Getting Started

### 1. Run the Backend
Navigate to the `backend/` folder and install dependencies:
```bash
pip install -r requirements.txt
```
Start the FastAPI server:
```bash
python main.py
```

### 2. Open the Frontend
Simply open `frontend/index.html` in any modern web browser.

## Features
- **Ask Model**: Query a specific model and get instant feedback with response time.
- **Benchmark Mode**: Run the same prompt through all 3 models to compare speed and quality.
- **Local History**: Results are automatically saved to `data/benchmark_results.json`.

## System Requirements
- Ollama running locally.
- Python 3.8+.
- No internet connection required after initial model download.
