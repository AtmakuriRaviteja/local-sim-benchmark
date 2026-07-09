# Local SLM Benchmark 🤖

A lightweight AI benchmarking tool that compares the performance of Small Language Models (SLMs) running locally via [Ollama](https://ollama.com/) — measuring latency, tokens/sec, and response quality side-by-side.

## 🌐 Live Demo

> **[Try the Live Demo →](https://atmakuriraviteja.github.io/local-sim-benchmark/)**

> [!NOTE]
> The live demo runs in **sample-response mode** — it returns pre-recorded benchmark results so you can explore the UI without needing Ollama installed. To get real benchmark results from your own models, run it locally (see Quick Start below).

---

## ✨ Features

- **Head-to-Head Model Comparison**: Run the same prompt across multiple models and compare results instantly.
- **Live Performance Metrics**: Measures real latency (ms) and tokens/sec for each model response.
- **Privacy First**: Everything runs locally on your machine — no data ever leaves your system.
- **Auto Model Discovery**: Automatically detects all models installed in your Ollama library.
- **Run History**: Keeps a sidebar log of past benchmark sessions for quick reference.
- **Interactive Charts**: Visual bar charts to compare model performance at a glance.

---

## 🚀 Quick Start (Local, with Real Ollama)

### 1. Prerequisites

- [Ollama](https://ollama.com/) installed and running locally.
- Python 3.8+ installed.
- At least one model pulled, e.g.:
  ```bash
  ollama pull llama3.2
  ollama pull phi3
  ```

### 2. Clone the Repo

```bash
git clone https://github.com/AtmakuriRaviteja/local-sim-benchmark.git
cd local-sim-benchmark
```

### 3. Install Dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Run the Backend

```bash
cd backend
python main.py
```

The API server will start at `http://localhost:8000`. You can explore the API docs at `http://localhost:8000/docs`.

### 5. Open the Frontend

Open `docs/index.html` in any modern web browser, or simply visit the [live frontend](https://atmakuriraviteja.github.io/local-sim-benchmark/) — it will automatically connect to your local backend when it's running.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript + Chart.js |
| Backend | FastAPI (Python) |
| LLM Runtime | Ollama |
| Deployment | GitHub Pages (frontend) + Render (backend API) |

---

## 📁 Project Structure

```
local-sim-benchmark/
├── backend/          # FastAPI server & Ollama client
│   ├── main.py       # API entry point
│   └── requirements.txt
├── local-ai-benchmark/  # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/             # Local chat/benchmark history (gitignored)
```

---

## 📡 API

The deployed API is available at **https://local-sim-benchmark.onrender.com**

Interactive docs (Swagger UI): **https://local-sim-benchmark.onrender.com/docs**

> [!NOTE]
> The cloud-deployed API returns sample responses since Ollama requires a local GPU/CPU environment. For live inference, point the frontend to your local backend (`http://localhost:8000`).

---

## 📄 License

MIT
