const API_BASE_URL = "http://localhost:8000";

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
    // ── Models ──────────────────────────────────────────────────────────────
    try {
        const modRes  = await fetch(`${API_BASE_URL}/models`);
        const modData = await modRes.json();
        const modelsList = document.querySelector(".models-list");
        if (modelsList && modData.models && modData.models.length > 0) {
            modelsList.innerHTML = "";
            modData.models.forEach(m => {
                const div = document.createElement("div");
                div.className = "model-item";
                div.textContent = m;
                modelsList.appendChild(div);
            });
            modelSelect.innerHTML = "";
            modData.models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m.replace(":latest", "");
                modelSelect.appendChild(opt);
            });
        }
    } catch (e) { console.warn("Failed to load models", e); }

    // ── System Info ─────────────────────────────────────────────────────────
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
});

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
    card.className = `result-card ${isBenchmark ? "benchmark-item" : ""}`;
    if (data.error) {
        card.innerHTML = `<h3>${data.model}</h3><p class="error">Error: ${data.error}</p>`;
    } else {
        card.innerHTML = `
            <h3>${isBenchmark ? "" : "Model: "}${data.model}${data.score ? ` (Score: ${data.score})` : ""}</h3>
            ${data.response ? `<div class="response-text">${data.response}</div>` : ""}
            <div class="meta">
                ${data.response_length || data.tokens ? `<span>Length: ${data.response_length || data.tokens} tokens</span>` : ""}
                ${data.response_time || data.latency || data.avg_latency ? `<span class="time-badge">Time: ${data.response_time || data.latency || data.avg_latency}s</span>` : ""}
                ${data.avg_tps ? `<span>Speed: ${data.avg_tps} TPS</span>` : ""}
                ${data.accuracy_pct !== undefined ? `<span>Accuracy: ${data.accuracy_pct}%</span>` : ""}
            </div>`;
    }
    return card;
}

// Handle a streaming /ask or /benchmark response
async function handleStreamingResponse(response, container, modelName, isBenchmark = false) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const card = document.createElement("div");
    card.className = `result-card ${isBenchmark ? "benchmark-item" : ""}`;
    card.innerHTML = `
        <h3>${isBenchmark ? "" : "Model: "}${modelName}</h3>
        <div class="response-text streaming"></div>
        <div class="meta" style="display:none;"></div>`;
    container.appendChild(card);

    const textDiv = card.querySelector(".response-text");
    const metaDiv = card.querySelector(".meta");
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
                        <span>Length: ${data.response_length || data.token_count} tokens</span>
                        <span class="time-badge">Time: ${data.response_time || data.latency}s</span>`;
                }
            } catch (_) {}
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// QUICK TEST BUTTONS
// ════════════════════════════════════════════════════════════════════════════
document.querySelectorAll(".quick-test-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        const action = btn.dataset.action || "ask";
        if (!prompt) return;
        document.querySelectorAll(".quick-test-btn").forEach(b => b.classList.remove("active"));
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
askBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    const model  = modelSelect.value;
    if (!prompt) { promptInput.focus(); return; }
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Generating response&hellip;</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/ask?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`);
        resultsContainer.innerHTML = "";
        await handleStreamingResponse(res, resultsContainer, model);
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Failed to connect to backend. Is it running?</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Benchmark ──────────────────────────────────────────────────────────────
benchmarkBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    const model  = modelSelect.value;
    if (!prompt) { promptInput.focus(); return; }
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running benchmark&hellip;</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/benchmark`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        resultsContainer.innerHTML = `<p><strong>Prompt:</strong> ${prompt}</p><br>`;
        await handleStreamingResponse(res, resultsContainer, model, true);
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Compare All ────────────────────────────────────────────────────────────
compareBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { promptInput.focus(); return; }
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Comparing all models&hellip; May take a few minutes.</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/compare`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, models: [] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = `<p><strong>Prompt:</strong> ${prompt}</p><br>`;
        data.results.forEach(r => resultsContainer.appendChild(createResultCard(r, true)));
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Run Suite ──────────────────────────────────────────────────────────────
suiteBtn.onclick = async () => {
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running evaluation suite&hellip; Grab a coffee!</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/benchmark-suite`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ models: [] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = `<h3>Suite Winner: 👑 ${data.winner}</h3><p>Tested on ${data.prompt_count} standard prompts</p><br>`;
        data.results.forEach(r => resultsContainer.appendChild(createResultCard(r, true)));
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error">Backend error: ${err.message}</p>`;
    } finally { setButtonsBusy(false); }
};

// ── Dataset Benchmark ──────────────────────────────────────────────────────
datasetBtn.onclick = async () => {
    setButtonsBusy(true);
    resultsContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Running dataset benchmark&hellip;</p>`;
    try {
        const res = await fetch(`${API_BASE_URL}/dataset-benchmark`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ models: [] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        resultsContainer.innerHTML = `<h3>Dataset Winner: 🏆 ${data.winner}</h3><p>Tested on ${data.prompt_count} dataset prompts</p><br>`;
        data.results.forEach(r => resultsContainer.appendChild(createResultCard(r, true)));
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

    launchBtn.addEventListener("click", openVoiceChat);
    closeBtn .addEventListener("click", closeVoiceChat);

    function toggleListen() {
        if      (vcState === "listening") stopVcListening();
        else if (vcState === "idle")      startVcListening();
        else if (vcState === "speaking")  { window.speechSynthesis.cancel(); setState("idle"); }
    }
    orbEl  .addEventListener("click", toggleListen);
    mainBtn.addEventListener("click", toggleListen);

    stopBtn.addEventListener("click", () => {
        window.speechSynthesis.cancel();
        if (vcState === "speaking") setState("idle");
    });

    muteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        muteBtn.classList.toggle("active", isMuted);
        muteBtn.title = isMuted ? "Unmute TTS" : "Mute TTS";
        muteBtn.querySelector("i").className = isMuted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
        if (isMuted) window.speechSynthesis.cancel();
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeVoiceChat(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("vc-open")) closeVoiceChat(); });
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
})();
