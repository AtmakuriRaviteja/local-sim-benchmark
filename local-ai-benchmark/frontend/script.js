const API_BASE_URL = "http://localhost:8000";

const promptInput = document.getElementById("prompt-input");
const modelSelect = document.getElementById("model-select");
const askBtn = document.getElementById("ask-btn");
const benchmarkBtn = document.getElementById("benchmark-btn");
const resultsContainer = document.getElementById("results-container");

// Helper function to render a result card
function createResultCard(data, isBenchmark = false) {
    const card = document.createElement("div");
    card.className = `result-card ${isBenchmark ? "benchmark-item" : ""}`;

    if (data.error) {
        card.innerHTML = `
            <h3>${data.model}</h3>
            <p class="error">Error: ${data.error}</p>
        `;
    } else {
        card.innerHTML = `
            <h3>${isBenchmark ? "" : "Model: "}${data.model}</h3>
            <div class="response-text">${data.response}</div>
            <div class="meta">
                <span>Length: ${data.response_length} tokens</span>
                <span class="time-badge">Time: ${data.response_time}s</span>
            </div>
        `;
    }
    return card;
}

// Ask Model Event
askBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value;

    if (!prompt) return alert("Please enter a prompt.");

    resultsContainer.innerHTML = `<p class="placeholder">Waiting for ${model}...</p>`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/ask?prompt=${encodeURIComponent(prompt)}&model=${model}`);
        const data = await response.json();
        
        resultsContainer.innerHTML = "";
        resultsContainer.appendChild(createResultCard(data));
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Failed to connect to backend.</p>`;
    }
};

// Benchmark Mode Event
benchmarkBtn.onclick = async () => {
    const prompt = promptInput.value.trim();

    if (!prompt) return alert("Please enter a prompt.");

    resultsContainer.innerHTML = `<p class="placeholder">Running benchmark across models... This may take a minute.</p>`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/benchmark?prompt=${encodeURIComponent(prompt)}`);
        const results = await response.json();
        
        resultsContainer.innerHTML = `<p><strong>Prompt:</strong> ${prompt}</p><br>`;
        results.forEach(res => {
            resultsContainer.appendChild(createResultCard(res, true));
        });
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Failed to connect to backend.</p>`;
    }
};
