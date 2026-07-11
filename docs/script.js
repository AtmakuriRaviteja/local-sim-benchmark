const API_BASE_URL = "https://local-sim-benchmark.onrender.com";

const promptInput      = document.getElementById("prompt-input");
const modelSelect      = document.getElementById("model-select");
const askBtn           = document.getElementById("ask-btn");
const benchmarkBtn     = document.getElementById("benchmark-btn");
const compareBtn       = document.getElementById("compare-btn");
const suiteBtn         = document.getElementById("suite-btn");
const datasetBtn       = document.getElementById("dataset-btn");
const resultsContainer = document.getElementById("results-container");

// ════════════════════════════════════════════════════════════════════════════
// ON LOAD: populate models dropdown + live system info
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    fetchModels();
    fetchSystemInfo();
});

async function fetchModels() {
    try {
        const modRes  = await fetch(`${API_BASE_URL}/models`);
        const modData = await modRes.json();
        const modelsList = document.getElementById("sidebar-models-list");
        if (modelsList && modData.models && modData.models.length > 0) {
            modelsList.innerHTML = "";
            modData.models.forEach(m => {
                const div = document.createElement("div");
                div.className = "model-item";
                div.innerHTML = `<div class="model-name"><span class="status-dot"></span>${m}</div><span class="model-size">Loaded</span>`;
                div.onclick = () => {
                    document.querySelectorAll(".model-item").forEach(el => el.classList.remove("active"));
                    div.classList.add("active");
                    modelSelect.value = m;
                };
                modelsList.appendChild(div);
            });
            modelSelect.innerHTML = "";
            modData.models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m.replace(":latest", "");
                modelSelect.appendChild(opt);
            });
            // highlight first
            if (modelsList.firstChild) modelsList.firstChild.classList.add("active");
        }
    } catch (e) { console.warn("Failed to load models", e); }
}

async function fetchSystemInfo() {
    try {
        const sysRes  = await fetch(`${API_BASE_URL}/system-info`);
        const sysData = await sysRes.json();
        const cpuEl = document.getElementById("sys-cpu");
        const ramEl = document.getElementById("sys-ram");
        const osEl  = document.getElementById("sys-os");
        if (cpuEl) cpuEl.textContent = sysData.cpu      || sysData.cpu_model  || "N/A";
        if (ramEl) ramEl.textContent = sysData.ram      || sysData.total_ram  || "N/A";
        if (osEl)  osEl.textContent  = sysData.os       || sysData.platform   || "N/A";
    } catch (e) {
        ["sys-cpu","sys-ram","sys-os"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "Unavailable";
        });
    }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

// Lock / unlock all buttons while a request is in flight
function setButtonsBusy(busy) {
    [askBtn, benchmarkBtn, compareBtn, suiteBtn, datasetBtn].forEach(b => {
        b.disabled    = busy;
        b.style.opacity = busy ? "0.5" : "";
        b.style.cursor  = busy ? "wait" : "";
    });
    document.querySelectorAll(".quick-test-btn").forEach(b => {
        b.disabled    = busy;
        b.style.opacity = busy ? "0.5" : "";
    });
}

// Render a non-streaming result card
function createResultCard(data, isBenchmark = false) {
    const card = document.createElement("div");
    card.className = "result-card";
    
    if (data.error) {
        card.innerHTML = `
            <div class="rc-header">
                <div class="rc-header-left">
                    <span class="rc-model-pill">${data.model}</span>
                    <span class="rc-prompt-txt">Error</span>
                </div>
            </div>
            <div class="rc-body"><span class="error">${data.error}</span></div>`;
    } else {
        card.innerHTML = `
            <div class="rc-header">
                <div class="rc-header-left">
                    <span class="rc-model-pill">${data.model}</span>
                    <span class="rc-prompt-txt">${data.prompt ? "Prompt: " + data.prompt : (data.score ? `Score: ${data.score}` : "")}</span>
                </div>
            </div>
            ${data.response ? `<div class="rc-body">${data.response}</div>` : ""}
            <div class="rc-footer">
                ${(data.response_time || data.latency || data.avg_latency) ? `<div class="rc-stat"><div class="rc-stat-val green">${Number(data.response_time || data.latency || data.avg_latency).toFixed(2)}s</div><div class="rc-stat-label">TOTAL</div></div>` : ""}
                ${(data.avg_tps || data.tokens_per_sec) ? `<div class="rc-stat"><div class="rc-stat-val purple">${(data.avg_tps || data.tokens_per_sec).toFixed(1)}</div><div class="rc-stat-label">TOK/S</div></div>` : ""}
                ${(data.response_length || data.tokens) ? `<div class="rc-stat"><div class="rc-stat-val orange">${data.response_length || data.tokens}</div><div class="rc-stat-label">TOKENS</div></div>` : ""}
                ${data.accuracy_pct !== undefined ? `<div class="rc-stat"><div class="rc-stat-val blue">${data.accuracy_pct}%</div><div class="rc-stat-label">ACCURACY</div></div>` : ""}
                ${data.cpu ? `<div class="rc-stat"><div class="rc-stat-val red" style="color: #f87171;">${data.cpu}%</div><div class="rc-stat-label">CPU</div></div>` : ""}
                ${data.ram ? `<div class="rc-stat"><div class="rc-stat-val yellow" style="color: #eab308;">${data.ram}%</div><div class="rc-stat-label">RAM</div></div>` : ""}
            </div>`;
    }
    return card;
}

// Handle a streaming /ask or /benchmark response
async function handleStreamingResponse(response, container, modelName, isBenchmark = false, prompt = "") {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const card = document.createElement("div");
    card.className = "result-card";
    const now = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    card.innerHTML = `
        <div class="rc-header">
            <div class="rc-header-left">
                <span class="rc-model-pill">${modelName}</span>
                <span class="rc-prompt-txt">Chat "${prompt}"</span>
            </div>
            <div class="rc-header-right">
                <span class="rc-time">${now}</span>
                <button class="rc-copy-btn">Copy</button>
            </div>
        </div>
        <div class="rc-body streaming"></div>
        <div class="rc-footer" style="display:none;"></div>
    `;
    container.appendChild(card);

    const textDiv = card.querySelector(".rc-body");
    const metaDiv = card.querySelector(".rc-footer");
    let fullText  = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
                const data = JSON.parse(line.substring(6));
                if (data.type === "error") {
                    textDiv.innerHTML = `<span class="error">Error: ${data.error}</span>`;
                    return;
                } else if (data.type === "chunk") {
                    fullText += data.text;
                    textDiv.textContent = fullText;
                } else if (data.type === "final") {
                    textDiv.classList.remove("streaming");
                    metaDiv.style.display = "flex";
                    metaDiv.innerHTML = `
                        <div class="rc-stat"><div class="rc-stat-val green">${data.response_time || data.latency || "0.0"}s</div><div class="rc-stat-label">TOTAL</div></div>
                        ${data.tokens_per_sec ? `<div class="rc-stat"><div class="rc-stat-val purple">${data.tokens_per_sec}</div><div class="rc-stat-label">TOK/S</div></div>` : ""}
                        <div class="rc-stat"><div class="rc-stat-val orange">${data.response_length || data.token_count || 0}</div><div class="rc-stat-label">TOKENS</div></div>
                        <div class="rc-stat"><div class="rc-stat-val blue">${fullText.split(/\s+/).length}</div><div class="rc-stat-label">WORDS</div></div>
                    `;
                    return { tps: data.tokens_per_sec || 0, time: data.response_time || data.latency || 0 };
                }
            } catch (_) {}
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// QUICK TEST BUTTONS
// ════════════════════════════════════════════════════════════════════════════
// ────────────────────────────────────────────────────────────────────────────
// QUICK CARD BUTTONS (new UI)
// ────────────────────────────────────────────────────────────────────────────
document.querySelectorAll(".qt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        const action = btn.dataset.action || "ask";
        if (!prompt) return;
        document.querySelectorAll(".qt-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        promptInput.value = prompt;
        if      (action === "benchmark") benchmarkBtn.click();
        else if (action === "compare")   compareBtn.click();
        else                             askBtn.click();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// KEYBOARD: Enter submits ask
// ════════════════════════════════════════════════════════════════════════════
promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askBtn.click(); }
});

// ════════════════════════════════════════════════════════════════════════════
// REVIEW button → open Swagger docs
// ════════════════════════════════════════════════════════════════════════════
const reviewBtn = document.getElementById("review-btn");
if (reviewBtn) {
    reviewBtn.addEventListener("click", () => window.open(`${API_BASE_URL}/docs`, "_blank"));
}

// ════════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ════════════════════════════════════════════════════════════════════════════

// ── Ask (chat) ──────────────────────────────────────────────────────────────
// Helper: switch to results view
function showResultsSection() {
    const hero    = document.getElementById("hero-section");
    const results = document.getElementById("results-section");
    if (hero)    hero.style.display    = "none";
    if (results) results.classList.add("visible");
}

askBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    const model  = modelSelect.value;
    if (!prompt) { promptInput.focus(); return; }
    promptInput.value = ""; // Clear input immediately
    showResultsSection();
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Generating response&hellip;</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/ask?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        resultsContainer.innerHTML = "";
        const stats = await handleStreamingResponse(res, resultsContainer, model, false, prompt);
        saveToHistory("Ask", prompt, model, stats);
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Benchmark ──────────────────────────────────────────────────────────────
benchmarkBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    const model  = modelSelect.value;
    if (!prompt) { promptInput.focus(); return; }
    promptInput.value = ""; // Clear input immediately
    showResultsSection();
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running benchmark on ${model}&hellip;</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/benchmark`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = "";
        data.prompt = prompt;
        resultsContainer.appendChild(createResultCard(data, true));
        saveToHistory("Benchmark", prompt, model, { tps: 0, time: data.latency || 0 });
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Compare All ────────────────────────────────────────────────────────────
compareBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { promptInput.focus(); return; }
    promptInput.value = ""; // Clear input immediately
    showResultsSection();
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Comparing all models&hellip; May take a few minutes.</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/compare`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, models: [] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = "";
        
        data.results.forEach(r => {
            r.prompt = prompt;
            if (r.model === data.winner) r.score = "Fastest \uD83C\uDFC6";
            resultsContainer.appendChild(createResultCard(r, true));
        });
        saveToHistory("Compare", prompt, "All Models", { time: data.results.length ? data.results[0].latency : 0 });
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Run Suite ──────────────────────────────────────────────────────────────
suiteBtn.onclick = async () => {
    showResultsSection();
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running evaluation suite&hellip; Grab a coffee!</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/evaluate`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        let winner = "None";
        let bestScore = -1;
        data.forEach(r => {
            if (r.score > bestScore) { bestScore = r.score; winner = r.model; }
        });

        resultsContainer.innerHTML = `<div class="result-card"><div class="rc-header"><span class="rc-model-pill" style="background:#10b981;color:#fff;">👑 Winner: ${winner}</span></div><div class="rc-body">Multi-task Evaluation Suite Complete.</div></div>`;
        data.forEach(r => {
            // Map avg_* metrics to the standard keys createResultCard expects
            r.cpu = r.avg_cpu;
            r.ram = r.avg_ram;
            r.tokens = r.total_tokens;
            
            // Generate a summary response string from the tasks
            if (r.tasks && r.tasks.length) {
                r.response = r.tasks.map(t => `<b>${t.task_name}</b>: ${t.response.substring(0, 50)}...`).join("<br>");
            }
            resultsContainer.appendChild(createResultCard(r, true));
        });
        saveToHistory("Suite", "Eval Suite", "All Models", {});
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Dataset Benchmark ──────────────────────────────────────────────────────
datasetBtn.onclick = async () => {
    showResultsSection();
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running dataset benchmark&hellip;</p>`;
    try {
        // Fallback since backend doesn't have a dataset-benchmark endpoint
        const datasetPrompt = "Classify this sentiment: 'I absolutely loved this product, it works perfectly!' Options: Positive, Negative, Neutral.";
        const res = await fetch(`${API_BASE_URL}/compare`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: datasetPrompt, models: [] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = `<h3 style="margin-bottom: 1rem; color: var(--text-muted); text-align: center;">Dataset Evaluation Complete</h3>`;
        data.results.forEach(r => {
            r.prompt = datasetPrompt;
            resultsContainer.appendChild(createResultCard(r, true));
        });
        saveToHistory("Dataset", "Dataset Benchmark", "All Models", {});
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ════════════════════════════════════════════════════════════════════════════
// MICROPHONE BUTTON (Web Speech API – type-to-speak)
// ════════════════════════════════════════════════════════════════════════════
const micBtn = document.getElementById("mic-btn");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    if (micBtn) {
        micBtn.title  = "Speech recognition not supported. Try Chrome or Edge.";
        micBtn.style.opacity = "0.4";
        micBtn.style.cursor  = "not-allowed";
    }
} else {
    const recognition        = new SpeechRecognition();
    recognition.lang         = "en-US";
    recognition.continuous   = false;
    recognition.interimResults = true;

    let isListening = false;
    let savedPrompt = "";

    function startListening() {
        isListening = true;
        savedPrompt = promptInput.value;
        micBtn.classList.add("mic-active");
        micBtn.title = "Listening\u2026 click to stop";
        recognition.start();
    }
    function stopListening() {
        isListening = false;
        micBtn.classList.remove("mic-active");
        micBtn.title = "Click to speak";
        recognition.stop();
    }

    micBtn.addEventListener("click", () => isListening ? stopListening() : startListening());

    recognition.addEventListener("result", (event) => {
        let interim = "", final = "";
        for (const r of event.results) {
            if (r.isFinal) final += r[0].transcript;
            else interim += r[0].transcript;
        }
        promptInput.value = (savedPrompt ? savedPrompt + " " : "") + (final || interim);
    });

    recognition.addEventListener("end", () => {
        if (isListening) { isListening = false; micBtn.classList.remove("mic-active"); micBtn.title = "Click to speak"; }
    });

    recognition.addEventListener("error", (event) => {
        stopListening();
        const msgs = { "not-allowed": "Microphone access denied.", "no-speech": "No speech detected. Try again.", "aborted": "" };
        const msg  = msgs[event.error] || ("Speech error: " + event.error);
        if (!msg) return;
        const toast = document.createElement("div");
        toast.textContent = "\uD83C\uDF99\uFE0F " + msg;
        toast.style.cssText = "position:fixed;bottom:5rem;left:50%;transform:translateX(-50%);background:#1a1d27;color:#f87171;border:1px solid #7f1d1d;padding:.75rem 1.5rem;border-radius:8px;font-size:.85rem;z-index:9999";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    });
}

// ════════════════════════════════════════════════════════════════════════════
// VOICE CHAT ENGINE
// Flow: orb tap → STT → /ask stream → TTS → back to idle
// ════════════════════════════════════════════════════════════════════════════
(function () {
    const overlay    = document.getElementById("voice-chat-overlay");
    const launchBtn  = document.getElementById("voice-chat-btn");
    const closeBtn   = document.getElementById("vc-close-btn");
    const orbEl      = document.getElementById("vc-orb");
    const orbIcon    = document.getElementById("vc-orb-icon");
    const statusEl   = document.getElementById("vc-status");
    const transcript = document.getElementById("vc-transcript");
    const mainBtn    = document.getElementById("vc-main-btn");
    const muteBtn    = document.getElementById("vc-mute-btn");
    const stopBtn    = document.getElementById("vc-stop-btn");
    const vcModel    = document.getElementById("vc-model-select");

    let vcState = "idle";
    let isMuted = false;
    let vcRecognition = null;

    function setState(s) {
        vcState = s;
        overlay.classList.remove("vc-listening","vc-thinking","vc-speaking");
        if (s === "listening") {
            overlay.classList.add("vc-listening");
            orbIcon.className = "fa-solid fa-microphone";
            mainBtn.innerHTML = '<i class="fa-solid fa-stop"></i><span>Stop</span>';
            mainBtn.classList.add("listening");
            statusEl.textContent = "Listening\u2026";
        } else if (s === "thinking") {
            overlay.classList.add("vc-thinking");
            orbIcon.className = "fa-solid fa-circle-notch fa-spin";
            mainBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Tap to Speak</span>';
            mainBtn.classList.remove("listening");
            statusEl.textContent = "Thinking\u2026";
        } else if (s === "speaking") {
            overlay.classList.add("vc-speaking");
            orbIcon.className = "fa-solid fa-volume-high";
            mainBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Tap to Speak</span>';
            mainBtn.classList.remove("listening");
            statusEl.textContent = "Speaking\u2026";
        } else {
            orbIcon.className = "fa-solid fa-microphone";
            mainBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Tap to Speak</span>';
            mainBtn.classList.remove("listening");
            statusEl.textContent = "Tap the orb to start";
        }
    }

    function addBubble(role, text) {
        const empty = transcript.querySelector(".vc-transcript-empty");
        if (empty) empty.remove();
        const bubble = document.createElement("div");
        bubble.className = "vc-bubble " + role;
        bubble.innerHTML = `<div class="bubble-label">${role === "user" ? "You" : "AI"}</div><div class="bubble-text">${text}</div>`;
        transcript.appendChild(bubble);
        transcript.scrollTop = transcript.scrollHeight;
        return bubble;
    }
    function updateBubbleText(bubble, text) {
        bubble.querySelector(".bubble-text").textContent = text;
        transcript.scrollTop = transcript.scrollHeight;
    }

    function speak(text, onDone) {
        window.speechSynthesis.cancel();
        if (isMuted) { onDone && onDone(); return; }
        const utt   = new SpeechSynthesisUtterance(text);
        utt.lang    = "en-US";
        utt.rate    = 1.05;
        const voices = window.speechSynthesis.getVoices();
        const pref   = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.localService));
        if (pref) utt.voice = pref;
        utt.onend   = () => onDone && onDone();
        utt.onerror = () => onDone && onDone();
        window.speechSynthesis.speak(utt);
    }

    async function askModel(userText) {
        setState("thinking");
        const model = vcModel.value || document.getElementById("model-select").value;
        const aiBubble = addBubble("ai", "\u22ef");
        let fullText = "";
        try {
            const res     = await fetch(`${API_BASE_URL}/ask?prompt=${encodeURIComponent(userText)}&model=${encodeURIComponent(model)}`);
            const reader  = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const lines = decoder.decode(value, { stream: true }).split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const d = JSON.parse(line.substring(6));
                        if (d.type === "chunk") { fullText += d.text; updateBubbleText(aiBubble, fullText); }
                        else if (d.type === "error") { fullText = "Error: " + d.error; updateBubbleText(aiBubble, fullText); }
                    } catch (_) {}
                }
            }
        } catch (err) {
            fullText = "Could not reach the backend.";
            updateBubbleText(aiBubble, fullText);
        }
        setState("speaking");
        speak(fullText, () => setState("idle"));
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    function startVcListening() {
        if (!SpeechRec) { statusEl.textContent = "Speech recognition not supported. Use Chrome/Edge."; return; }
        window.speechSynthesis.cancel();
        vcRecognition = new SpeechRec();
        vcRecognition.lang = "en-US";
        vcRecognition.continuous = false;
        vcRecognition.interimResults = true;
        let interimBubble = null, finalText = "";
        vcRecognition.onresult = (e) => {
            let interim = "";
            finalText = "";
            for (const r of e.results) {
                if (r.isFinal) finalText += r[0].transcript;
                else interim += r[0].transcript;
            }
            const display = finalText || interim;
            if (!interimBubble) interimBubble = addBubble("user", display);
            else updateBubbleText(interimBubble, display);
        };
        vcRecognition.onend = () => {
            if (vcState !== "listening") return;
            if (finalText.trim()) askModel(finalText.trim());
            else setState("idle");
        };
        vcRecognition.onerror = (e) => {
            if (e.error === "aborted") return;
            statusEl.textContent = "Mic error: " + e.error;
            setState("idle");
        };
        setState("listening");
        vcRecognition.start();
    }

    function stopVcListening() {
        if (vcRecognition) { vcRecognition.abort(); vcRecognition = null; }
        setState("idle");
    }

    function openVoiceChat() {
        const mainSel = document.getElementById("model-select");
        vcModel.innerHTML = mainSel.innerHTML;
        vcModel.value     = mainSel.value;
        overlay.classList.add("vc-open");
        overlay.setAttribute("aria-hidden", "false");
        setState("idle");
    }
    function closeVoiceChat() {
        stopVcListening();
        window.speechSynthesis.cancel();
        overlay.classList.remove("vc-open");
        overlay.setAttribute("aria-hidden", "true");
        setState("idle");
    }

    if (launchBtn) launchBtn.addEventListener("click", openVoiceChat);
    if (closeBtn) closeBtn.addEventListener("click", closeVoiceChat);

    function toggleListen() {
        if      (vcState === "listening") stopVcListening();
        else if (vcState === "idle")      startVcListening();
        else if (vcState === "speaking")  { window.speechSynthesis.cancel(); setState("idle"); }
    }
    
    if (orbEl) orbEl.addEventListener("click", toggleListen);
    if (mainBtn) mainBtn.addEventListener("click", toggleListen);

    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            window.speechSynthesis.cancel();
            if (vcState === "speaking") setState("idle");
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener("click", () => {
            isMuted = !isMuted;
            muteBtn.classList.toggle("active", isMuted);
            muteBtn.title = isMuted ? "Unmute TTS" : "Mute TTS";
            muteBtn.querySelector("i").className = isMuted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
            if (isMuted) window.speechSynthesis.cancel();
        });
    }

    if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeVoiceChat(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay && overlay.classList.contains("vc-open")) closeVoiceChat(); });
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
})();

// ════════════════════════════════════════════════════════════════════════════
// RUN HISTORY AND DRAWER LOGIC
// ════════════════════════════════════════════════════════════════════════════

const drawerToggleBtn = document.getElementById("drawer-toggle-btn");
const modelsDrawer    = document.getElementById("models-drawer");
const historyListEl   = document.getElementById("history-list");
let runHistory = JSON.parse(localStorage.getItem("slmRunHistory") || "[]");

const clearHistoryBtn = document.getElementById("clear-history-btn");

if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
        runHistory = [];
        localStorage.setItem("slmRunHistory", JSON.stringify(runHistory));
        renderHistory();
    });
}

function saveToHistory(type, prompt, model, stats = null) {
    const run = { id: Date.now(), type, prompt, model, date: new Date().toLocaleTimeString(), stats };
    runHistory.unshift(run); // add to top
    if (runHistory.length > 50) runHistory.pop();
    localStorage.setItem("slmRunHistory", JSON.stringify(runHistory));
    renderHistory();
}

function updateSessionStats() {
    const runsEl = document.getElementById("stat-runs");
    const avgEl  = document.getElementById("stat-avg");
    const bestEl = document.getElementById("stat-best");
    
    if (!runsEl || !avgEl || !bestEl) return;
    
    const validRuns = runHistory.filter(r => r.stats && r.stats.tps > 0);
    runsEl.textContent = runHistory.length;
    
    if (validRuns.length > 0) {
        const sumTps = validRuns.reduce((acc, r) => acc + parseFloat(r.stats.tps), 0);
        const avgTps = sumTps / validRuns.length;
        const bestTps = Math.max(...validRuns.map(r => parseFloat(r.stats.tps)));
        
        avgEl.textContent = avgTps.toFixed(1);
        bestEl.textContent = bestTps.toFixed(1);
    } else {
        avgEl.textContent = "0.0";
        bestEl.textContent = "0.0";
    }
}

function renderHistory() {
    updateSessionStats();
    if (runHistory.length === 0) {
        historyListEl.innerHTML = `<div class="history-empty">No runs yet</div>`;
        return;
    }
    historyListEl.innerHTML = "";
    runHistory.forEach(run => {
        const item = document.createElement("div");
        item.className = "history-item";
        item.innerHTML = `
            <div class="history-item-title" title="${run.prompt}">${run.prompt}</div>
            <div class="history-item-meta">
                <span>${run.type}</span>
                <span>${run.model} • ${run.date}</span>
            </div>
        `;
        item.addEventListener("click", () => {
            promptInput.value = run.prompt === "Evaluation Suite" || run.prompt === "Dataset Benchmark" ? "" : run.prompt;
            promptInput.focus();
        });
        historyListEl.appendChild(item);
    });
}
// Render history on startup
renderHistory();

// ════════════════════════════════════════════════════════════════════════════
// LEFT ICON BAR LOGIC
// ════════════════════════════════════════════════════════════════════════════
const icons = {
    eye: document.getElementById("icon-eye"),
    plus: document.getElementById("icon-plus"),
    search: document.getElementById("icon-search"),
    archive: document.getElementById("icon-archive"),
    cubes: document.getElementById("icon-cubes"),
    print: document.getElementById("icon-print"),
    code: document.getElementById("icon-code"),
    palette: document.getElementById("icon-palette"),
    download: document.getElementById("icon-download"),
};

const refreshModelsBtn = document.getElementById("refresh-models-btn");
if (refreshModelsBtn) refreshModelsBtn.onclick = () => fetchModels();

const userAvatar = document.getElementById("icon-user");
if (userAvatar) userAvatar.onclick = () => alert("User Profile: Logged in as Local User");

if (icons.eye) icons.eye.onclick = () => document.body.classList.toggle("compact-mode");
if (icons.plus) icons.plus.onclick = () => { promptInput.value = ""; resultsContainer.innerHTML = ""; promptInput.focus(); };
if (icons.search) icons.search.onclick = () => promptInput.focus();
if (icons.archive) icons.archive.onclick = () => {
    const hist = document.querySelector(".history-section");
    if (hist) hist.style.display = hist.style.display === "none" ? "block" : "none";
};
if (icons.cubes) icons.cubes.onclick = () => fetchModels();
if (icons.print) icons.print.onclick = () => window.print();
if (icons.code) icons.code.onclick = () => window.open(`${API_BASE_URL}/docs`, "_blank");
if (icons.palette) {
    const accents = ["#8b5cf6", "#3b82f6", "#10b981", "#f97316"];
    let aIdx = 0;
    icons.palette.onclick = () => {
        aIdx = (aIdx + 1) % accents.length;
        document.documentElement.style.setProperty("--accent-purple", accents[aIdx]);
        document.documentElement.style.setProperty("--accent-purple-light", accents[aIdx]);
    };
}
if (icons.download) icons.download.onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(runHistory, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "slm_benchmark_history.json");
    dlAnchorElem.click();
};

// ════════════════════════════════════════════════════════════════════════════
// TEMP SLIDER LOGIC
// ════════════════════════════════════════════════════════════════════════════
const tempWrap = document.getElementById("temp-slider-wrap");
const tempTrack = document.getElementById("temp-track");
const tempFill = document.getElementById("temp-fill");
const tempThumb = document.getElementById("temp-thumb");
const tempVal = document.getElementById("temp-val-display");

let currentTemp = 0.7; // Global temp that could be sent to backend later

if (tempWrap && tempTrack && tempFill && tempThumb && tempVal) {
    let isDragging = false;

    function updateTempFromEvent(e) {
        const rect = tempTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        
        currentTemp = (pct * 2.0).toFixed(1); // Scale 0 to 2.0
        
        tempFill.style.width = (pct * 100) + "%";
        tempThumb.style.left = (pct * 100) + "%";
        tempThumb.style.transform = "translateX(-50%)";
        tempVal.textContent = currentTemp;
    }

    tempWrap.addEventListener("mousedown", (e) => {
        isDragging = true;
        updateTempFromEvent(e);
    });

    document.addEventListener("mousemove", (e) => {
        if (isDragging) updateTempFromEvent(e);
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });
    
    // Initial setup
    const initialPct = currentTemp / 2.0;
    tempFill.style.width = (initialPct * 100) + "%";
    tempThumb.style.left = (initialPct * 100) + "%";
    tempThumb.style.transform = "translateX(-50%)";
}
