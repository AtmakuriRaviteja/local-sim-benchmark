# Local AI Chat 🤖

A lightweight, fully offline AI chat application powered by Ollama and FastAPI.

## Features
- **Privacy First**: Everything runs locally on your machine. No data leaves your system.
- **Auto Model Discovery**: Automatically detects all models installed in your Ollama library.
- **Smart Chat Interface**: Modern, responsive UI with message history and dark theme.
- **Persistent History**: Conversations are saved locally to `data/chat_history.json`.

## Quick Start

### 1. Prerequisites
- [Ollama](https://ollama.com/) installed and running.
- Python 3.8+ installed.

### 2. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### 3. Run the Backend
```bash
cd backend
python main.py
```

### 4. Open the App
Open `frontend/index.html` in any modern web browser.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript.
- **Backend**: FastAPI (Python).
- **LLM Runtime**: Ollama.

## Project Structure
- `backend/`: API server and Ollama client.
- `frontend/`: Clean chat interface.
- `data/`: Local storage for chat history.
