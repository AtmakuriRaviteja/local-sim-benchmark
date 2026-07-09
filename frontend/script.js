const API_BASE_URL = 'http://127.0.0.1:8000';

let chartInstance = null;
let models = [];
let currentResults = [];
let currentMetric = 'score';
// ── Persistent History (localStorage) ───────────────────────────────────────
let runHistory = JSON.parse(localStorage.getItem('slm_history')) || [];

// ── Benchmark Prompt Presets ──────────────────────────────────────────────────
const BENCHMARK_PROMPTS = {
    speed:      "Explain what machine learning is in exactly 50 words. Be clear and concise.",
    reasoning:  "A farmer has 17 sheep. All but 9 die. How many sheep are left? Explain your reasoning step by step.",
    coding:     "Write a Python function to check if a number is prime. Optimize for performance and explain the time complexity.",
    memory:     "Remember this number: 47291. Now explain what a database is in 3 sentences. After that, repeat the number.",
    stress:     "List 20 advantages of artificial intelligence in bullet points.",
    comparison: "Explain recursion with a simple real-life example in under 100 words."
};

function fillPreset(key) {
    const input = document.getElementById('prompt-input');
    input.value = BENCHMARK_PROMPTS[key];
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active-preset'));
    const activeBtn = document.getElementById(`preset-${key}`);
    if (activeBtn) activeBtn.classList.add('active-preset');

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

// ── Initialization ────────────────────────────────────────────────────────────
window.onload = async () => {
    await fetchModels();
    setupInputHandlers();
    renderHistory(); // Show persisted history immediately
};


async function fetchModels() {
    try {
        const res = await fetch(`${API_BASE_URL}/models`);
        const data = await res.json();
        models = data.models || [];

        const sidebar = document.getElementById('sidebar-models');
        const select  = document.getElementById('model-select');

        sidebar.innerHTML = models.map(m => `<div class="model-tag">${m}</div>`).join('');

        // Build option list — phi3 first if present
        const sorted = [...models].sort((a, b) => {
            if (a.toLowerCase().startsWith('phi')) return -1;
            if (b.toLowerCase().startsWith('phi')) return  1;
            return 0;
        });
        select.innerHTML = sorted.map(m =>
            `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1).split(':')[0]}</option>`
        ).join('');
    } catch (err) {
        console.error("Failed to fetch models", err);
    }
}

function setupInputHandlers() {
    const input = document.getElementById('prompt-input');
    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        // Clear preset highlight when user types their own text
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active-preset'));
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('ask-btn').click();
        }
    });
}

// ── Chat (Ask Model) ──────────────────────────────────────────────────────────
document.getElementById('ask-btn').onclick = async () => {
    const input  = document.getElementById('prompt-input');
    const prompt = input.value.trim();
    const model  = document.getElementById('model-select').value;

    if (!prompt) return;

    appendMessage('user', prompt);
    input.value = '';
    input.style.height = 'auto';

    document.getElementById('analytics-hub').classList.add('hidden');

    showLoader(true);
    try {
        const res  = await fetch(`${API_BASE_URL}/smart-query`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model, prompt })
        });
        const data = await res.json();

        // 1. Handle live movie results (Array)
        if (Array.isArray(data)) {
            let html = `<div style="margin-bottom:0.6rem;font-weight:700;color:var(--accent-primary);display:flex;align-items:center;gap:6px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
                            Latest Movies from OMDb
                        </div>`;
            data.forEach(m => {
                html += `<div class="movie-result-item">
                            <span class="movie-dot">●</span> <strong>${m.title}</strong> <span style="opacity:0.6;">(${m.year})</span>
                         </div>`;
            });
            appendMessage('ai', html, '📡 Live API Data · OMDb');
            return;
        }

        // 2. Handle local model response (Object)
        if (data.offline_warning) {
            appendMessage('system-notice',
                '⚠️ <strong>Offline model:</strong> Knowledge cutoff applies. This local model cannot access real-time information.'
            );
        }

        const meta = `${data.tokens_per_sec} TPS · ${data.response_time}s · ${model}`;
        // Strip backend warning if exists (since we show system-notice above)
        const cleanResponse = data.offline_warning
            ? data.response.replace(/^⚠️.*?real-world events\.\n\n/s, '').replace(/^⚠️.*?applies\.\n\n/s, '')
            : data.response;

        appendMessage('ai', cleanResponse, meta);

    } catch (err) {
        appendMessage('ai', "Sorry, I couldn't connect. Is the backend running?");
    } finally {
        showLoader(false);
    }
};

// ── Single-model Benchmark ────────────────────────────────────────────────────
document.getElementById('benchmark-btn').onclick = async () => {
    const input  = document.getElementById('prompt-input');
    const prompt = input.value.trim();
    const model  = document.getElementById('model-select').value;

    if (!prompt) {
        alert("Please enter a prompt or pick a Quick Test above.");
        return;
    }

    input.value = '';
    input.style.height = 'auto';

    showResultArea('generating', model);
    showLoader(true);

    try {
        const res  = await fetch(`${API_BASE_URL}/benchmark`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model, prompt })
        });
        const data = await res.json();

        if (data.detail) throw new Error(data.detail);

        renderSingleResult(data, prompt);
        addToHistory({ type: 'benchmark', model: data.model, latency: data.latency, tps: data.tokens_per_sec, ts: Date.now() });

    } catch (err) {
        showResultArea('error', model, err.message);
    } finally {
        showLoader(false);
    }
};

// ── Compare All Models ────────────────────────────────────────────────────────
document.getElementById('compare-btn').onclick = async () => {
    const input  = document.getElementById('prompt-input');
    const prompt = input.value.trim();

    if (!prompt) {
        alert("Please enter a prompt or pick a Quick Test above.");
        return;
    }

    if (models.length === 0) {
        alert("No models found. Install at least one model via Ollama.");
        return;
    }

    input.value = '';
    input.style.height = 'auto';

    showResultArea('comparing');
    showLoader(true);

    try {
        const res  = await fetch(`${API_BASE_URL}/compare`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ models, prompt })
        });
        const data = await res.json();

        if (data.detail) throw new Error(data.detail);

        renderComparisonResult(data, prompt);
        addToHistory({ type: 'compare', winner: data.winner, count: data.results.length, ts: Date.now() });

    } catch (err) {
        showResultArea('error', null, err.message);
    } finally {
        showLoader(false);
    }
};

// ── Dataset Benchmark ─────────────────────────────────────────────────────────
document.getElementById('dataset-btn').onclick = async () => {
    if (models.length === 0) {
        alert("No models found. Install at least one model via Ollama.");
        return;
    }

    showResultArea('dataset');
    showLoader(true);

    try {
        const res  = await fetch(`${API_BASE_URL}/dataset-benchmark`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ models })
        });
        const data = await res.json();
        if (data.detail) throw new Error(data.detail);

        renderDatasetResult(data);
        addToHistory({
            type:   'dataset',
            winner: data.winner,
            count:  data.results.length,
            prompts: data.prompt_count,
            ts:     Date.now()
        });

    } catch (err) {
        showResultArea('error', null, err.message);
    } finally {
        showLoader(false);
    }
};

function renderDatasetResult(data) {
    const area    = document.getElementById('result-area');
    const results = data.results;
    const winner  = data.winner;
    const nPrompts = data.prompt_count || 8;

    // Leaderboard rows
    const rows = results.map((r, i) => {
        const isWinner = i === 0;
        const accClass = r.accuracy_pct >= 90 ? 'acc-perfect' : r.accuracy_pct >= 60 ? 'acc-good' : 'acc-poor';
        const tpsBar   = Math.min(100, ((r.avg_tps || 0) / 80) * 100);
        return `
        <tr class="${isWinner ? 'winner-row' : ''}">
            <td>
                ${isWinner ? '<span class="trophy">🏆</span>' : `<span class="rank">#${i + 1}</span>`}
                <strong>${r.model.toUpperCase()}</strong>
            </td>
            <td style="color:var(--accent-primary);font-weight:800;font-size:1rem;">${r.score}</td>
            <td><span class="accuracy-badge ${accClass}">${r.accuracy_pct}%</span></td>
            <td>
                <div class="comparison-tps-wrap">
                    <span class="td-tps">${r.avg_tps}</span>
                    <div class="tps-bar-track"><div class="tps-bar-fill" style="width:${tpsBar}%"></div></div>
                </div>
            </td>
            <td class="td-latency">${r.avg_latency}s</td>
        </tr>`;
    }).join('');

    // Per-task breakdown for the winner
    const winnerData = results[0];
    let taskRows = '';
    if (winnerData && winnerData.tasks) {
        taskRows = winnerData.tasks.map(t => {
            const icon = t.correct ? '✅' : (t.error ? '⚠️' : '❌');
            const typeColor = {
                reasoning: '#a78bfa', math: '#34d399', memory: '#fb923c',
                coding: '#38bdf8', factual: '#f472b6'
            }[t.type] || '#94a3b8';
            return `<tr>
                <td style="color:${typeColor};font-size:0.7rem;font-weight:700;text-transform:uppercase;">${t.type}</td>
                <td style="font-size:0.75rem;color:var(--text-mid);max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.prompt || '')}</td>
                <td style="text-align:center;font-size:1rem;">${icon}</td>
                <td style="color:#94a3b8;font-size:0.72rem;font-family:var(--font-mono);">${t.tps || '—'} t/s</td>
            </tr>`;
        }).join('');
    }

    area.innerHTML = `
    <div class="dataset-card">
        <div class="result-card-header">
            <span class="result-model-name">📊 Dataset Benchmark</span>
            <span class="result-badge winner-badge">🏆 Winner: ${winner ? winner.toUpperCase() : '—'}</span>
        </div>
        <div class="suite-meta">
            ${nPrompts} standardized prompts · ${results.length} model${results.length !== 1 ? 's' : ''} · Reasoning · Math · Memory · Coding · Factual
        </div>

        <table class="comparison-table suite-leaderboard">
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Score ↓</th>
                    <th>Accuracy</th>
                    <th>Avg TPS</th>
                    <th>Avg Latency</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="comparison-note">
            Score = (Accuracy% × 2) + (TPS × 1.5) − Latency · Weighted by prompt difficulty
        </div>

        ${winnerData && taskRows ? `
        <details class="result-response-toggle" style="margin-top:1.2rem;">
            <summary style="font-size:0.78rem;color:var(--text-low);">
                🏆 ${winner ? winner.toUpperCase() : ''} — Per-Prompt Results
            </summary>
            <div style="margin-top:0.8rem;overflow-x:auto;">
                <table class="comparison-table" style="font-size:0.8rem;">
                    <thead><tr>
                        <th>Type</th><th>Prompt</th><th>Pass</th><th>Speed</th>
                    </tr></thead>
                    <tbody>${taskRows}</tbody>
                </table>
            </div>
        </details>` : ''}

        <div class="suite-actions">
            <button class="export-btn" onclick="exportDatasetCSV(window._lastDatasetData)">
                ⬇ Export CSV
            </button>
        </div>

        <div class="chart-section">
            <h4 class="chart-title">📊 Accuracy vs Speed Comparison</h4>
            <div class="chart-viewport" style="height:220px;">
                <canvas id="datasetChart"></canvas>
            </div>
        </div>
    </div>`;

    // Animate TPS bars
    setTimeout(() => {
        document.querySelectorAll('.tps-bar-fill').forEach(el => {
            el.style.transition = 'width 0.7s ease';
        });
    }, 50);

    window._lastDatasetData = results;
    renderDatasetChart(results);
}

function renderDatasetChart(results) {
    const ctx = document.getElementById('datasetChart');
    if (!ctx) return;
    if (window._datasetChartInst) window._datasetChartInst.destroy();

    const labels   = results.map(r => r.model.toUpperCase());
    const accArr   = results.map(r => r.accuracy_pct || 0);
    const tpsArr   = results.map(r => r.avg_tps || 0);
    const latArr   = results.map(r => r.avg_latency || 0);

    window._datasetChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Accuracy %',
                    data: accArr,
                    backgroundColor: 'rgba(74,222,128,0.75)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'yAcc'
                },
                {
                    label: 'Avg TPS',
                    data: tpsArr,
                    backgroundColor: 'rgba(6,182,212,0.75)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Latency (s)',
                    data: latArr,
                    backgroundColor: 'rgba(244,63,94,0.7)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true, position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'TPS / Latency', color: '#64748b', font: { size: 10 } }
                },
                yAcc: {
                    beginAtZero: true, max: 100, position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', callback: v => v + '%' },
                    title: { display: true, text: 'Accuracy %', color: '#64748b', font: { size: 10 } }
                },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
                tooltip: { mode: 'index', intersect: false }
            },
            animation: { duration: 900, easing: 'easeOutQuart' }
        }
    });
}

function exportDatasetCSV(data) {
    if (!data || data.length === 0) {
        alert("No dataset results to export. Run the dataset benchmark first.");
        return;
    }
    let csv = "Rank,Model,Score,Accuracy (%),Avg TPS,Avg Latency (s),Prompts Passed\n";
    data.forEach((r, i) => {
        const passed = (r.tasks || []).filter(t => t.correct).length;
        const total  = (r.tasks || []).length;
        csv += `${i + 1},${r.model},${r.score},${r.accuracy_pct},${r.avg_tps},${r.avg_latency},${passed}/${total}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `dataset_benchmark_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Run Suite (Multi-Prompt Benchmark) ────────────────────────────────────────
document.getElementById('suite-btn').onclick = async () => {
    if (models.length === 0) {
        alert("No models found. Install at least one model via Ollama.");
        return;
    }

    showResultArea('suite');
    showLoader(true);

    try {
        const res  = await fetch(`${API_BASE_URL}/benchmark-suite`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ models })
        });
        const data = await res.json();

        if (data.detail) throw new Error(data.detail);

        renderSuiteResult(data);
        addToHistory({
            type:   'suite',
            winner: data.winner,
            count:  data.results.length,
            ts:     Date.now()
        });

    } catch (err) {
        showResultArea('error', null, err.message);
    } finally {
        showLoader(false);
    }
};

// ── Suite Result Rendering ────────────────────────────────────────────────────
function renderSuiteResult(data) {
    const area    = document.getElementById('result-area');
    const results = data.results;
    const winner  = data.winner;
    const prompts = data.prompt_count || 4;

    const rows = results.map((r, i) => {
        const isWinner   = i === 0;
        const accPct     = Math.round((r.accuracy || 0) * 100);
        const accClass   = accPct === 100 ? 'acc-perfect' : accPct >= 75 ? 'acc-good' : 'acc-poor';
        const tpsBar     = Math.min(100, ((r.avg_tps || 0) / 80) * 100);
        return `
        <tr class="${isWinner ? 'winner-row' : ''}">
            <td>
                ${isWinner ? '<span class="trophy">🏆</span>' : `<span class="rank">#${i + 1}</span>`}
                <strong>${r.model.toUpperCase()}</strong>
            </td>
            <td style="color:var(--accent-primary);font-weight:800;font-size:1rem;">${r.score}</td>
            <td>
                <div class="comparison-tps-wrap">
                    <span class="td-tps">${r.avg_tps}</span>
                    <div class="tps-bar-track"><div class="tps-bar-fill" style="width:${tpsBar}%"></div></div>
                </div>
            </td>
            <td class="td-latency">${r.avg_latency}s</td>
            <td><span class="accuracy-badge ${accClass}">${accPct}%</span></td>
        </tr>`;
    }).join('');

    // Task breakdown detail
    const hasTasks = results[0] && results[0].tasks && results[0].tasks.length > 0;
    let taskBreakdown = '';
    if (hasTasks) {
        taskBreakdown = `
        <details class="result-response-toggle" style="margin-top:1rem;">
            <summary style="font-size:0.78rem;color:var(--text-low);">Per-Task Breakdown</summary>
            <div class="task-grid" style="margin-top:0.8rem;">
                ${buildTaskGrid(results)}
            </div>
        </details>`;
    }

    area.innerHTML = `
    <div class="suite-card">
        <div class="result-card-header">
            <span class="result-model-name">🏆 Benchmark Suite</span>
            <span class="result-badge winner-badge">Winner: ${winner ? winner.toUpperCase() : '—'}</span>
        </div>
        <div class="suite-meta">
            ${prompts} prompts × ${results.length} model${results.length !== 1 ? 's' : ''} · Speed + Reasoning + Coding + Memory
        </div>

        <table class="comparison-table suite-leaderboard">
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Score ↓</th>
                    <th>Avg TPS</th>
                    <th>Avg Latency</th>
                    <th>Accuracy</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="comparison-note">
            Score = (Avg TPS × 3) − (Avg Latency × 2) + (Accuracy × 50) · Parallel execution
        </div>

        <div class="suite-actions">
            <button class="export-btn" onclick="exportCSV(window._lastSuiteData)">
                ⬇ Export CSV
            </button>
        </div>

        <div class="chart-section">
            <h4 class="chart-title">📊 Dual-Metric Performance Chart</h4>
            <div class="chart-viewport" style="height:240px;">
                <canvas id="suiteChart"></canvas>
            </div>
        </div>
    </div>`;

    // Animate bar fills
    setTimeout(() => {
        document.querySelectorAll('.tps-bar-fill').forEach(el => {
            el.style.transition = 'width 0.7s ease';
        });
    }, 50);

    // Store for CSV export
    window._lastSuiteData = results;

    // Render dual chart
    renderSuiteChart(results);
}

function buildTaskGrid(results) {
    const types = ['Speed', 'Reasoning', 'Coding', 'Memory'];
    return types.map(type => {
        const modelCells = results.map(r => {
            const task = (r.tasks || []).find(t => t.type === type);
            if (!task) return `<td style="color:var(--text-low);">—</td>`;
            const acc = task.accuracy === 1 ? '✅' : '❌';
            return `<td style="font-size:0.75rem;">${acc} ${task.tps || 0} t/s · ${task.latency || 0}s</td>`;
        }).join('');
        return `<tr>
            <td style="font-size:0.72rem;color:var(--accent-cyan);font-weight:700;width:90px;">${type}</td>
            ${modelCells}
        </tr>`;
    }).join('');
}

function renderSuiteChart(results) {
    const ctx = document.getElementById('suiteChart');
    if (!ctx) return;

    if (window._suiteChartInst) window._suiteChartInst.destroy();

    const labels  = results.map(r => r.model.toUpperCase());
    const tpsArr  = results.map(r => r.avg_tps || 0);
    const latArr  = results.map(r => r.avg_latency || 0);
    const accArr  = results.map(r => Math.round((r.accuracy || 0) * 100));

    window._suiteChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Avg TPS',
                    data: tpsArr,
                    backgroundColor: 'rgba(6,182,212,0.80)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Latency (s)',
                    data: latArr,
                    backgroundColor: 'rgba(244,63,94,0.75)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'y'
                },
                {
                    label: 'Accuracy %',
                    data: accArr,
                    backgroundColor: 'rgba(74,222,128,0.70)',
                    borderRadius: 6, borderSkipped: false,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'TPS / Latency', color: '#64748b', font: { size: 10 } }
                },
                y2: {
                    beginAtZero: true,
                    max: 100,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', callback: v => v + '%' },
                    title: { display: true, text: 'Accuracy %', color: '#64748b', font: { size: 10 } }
                },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
                tooltip: { mode: 'index', intersect: false }
            },
            animation: { duration: 900, easing: 'easeOutQuart' }
        }
    });
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(data) {
    if (!data || data.length === 0) {
        alert("No suite data to export. Run the suite first.");
        return;
    }

    let csv = "Rank,Model,Score,Avg TPS,Avg Latency (s),Accuracy (%)\n";
    data.forEach((r, i) => {
        const accPct = Math.round((r.accuracy || 0) * 100);
        csv += `${i + 1},${r.model},${r.score},${r.avg_tps},${r.avg_latency},${accPct}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `benchmark_suite_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Old benchmark (full suite via GET /evaluate/custom) ───────────────────────
// Kept for backwards-compat with the analytics hub
async function runFullEvaluate(prompt) {
    const route = (prompt.toLowerCase() === 'all')
        ? '/evaluate'
        : `/evaluate/custom?prompt=${encodeURIComponent(prompt)}`;

    const res = await fetch(`${API_BASE_URL}${route}`);
    currentResults = await res.json();

    appendMessage('ai', `Evaluation complete. Analysing ${currentResults.length} models.`);
    document.getElementById('analytics-hub').classList.remove('hidden');
    renderAdvancedUI(currentResults);
    document.getElementById('analytics-hub').scrollIntoView({ behavior: 'smooth' });
}

// ── Result Rendering ──────────────────────────────────────────────────────────
function showResultArea(state, model = '', errMsg = '') {
    const area = document.getElementById('result-area');
    area.classList.remove('hidden');

    if (state === 'generating') {
        area.innerHTML = `
            <div class="result-generating">
                <div class="gen-dots"><span></span><span></span><span></span></div>
                <span>Benchmarking <strong>${model}</strong> — please wait…</span>
            </div>`;
    } else if (state === 'comparing') {
        area.innerHTML = `
            <div class="result-generating">
                <div class="gen-dots"><span></span><span></span><span></span></div>
                <span>Comparing all models — this may take a minute…</span>
            </div>`;
    } else if (state === 'suite') {
        area.innerHTML = `
            <div class="result-generating">
                <div class="gen-dots"><span></span><span></span><span></span></div>
                <span>Running full suite — 4 prompts × ${models.length} model${models.length !== 1 ? 's' : ''} in parallel…</span>
            </div>`;
    } else if (state === 'dataset') {
        area.innerHTML = `
            <div class="result-generating">
                <div class="gen-dots"><span></span><span></span><span></span></div>
                <span>Running dataset benchmark — 8 standardized prompts × ${models.length} model${models.length !== 1 ? 's' : ''} in parallel…</span>
            </div>`;
    } else if (state === 'error') {
        area.innerHTML = `
            <div class="result-error">
                ⚠️ Error: ${errMsg || 'Could not connect to backend.'}
            </div>`;
    }

    const scroll = document.getElementById('main-scroll-area');
    scroll.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Scoring System ────────────────────────────────────────────────────────────
function calculateScore(model) {
    // Higher TPS = better, lower latency = better
    return Math.round((model.tokens_per_sec * 2) - model.latency);
}

// ── Streaming Text Effect ─────────────────────────────────────────────────────
function streamText(text, element) {
    let i = 0;
    const speed = 12; // ms per character — feels snappy
    element.innerHTML = '';

    function type() {
        if (i < text.length) {
            // Flush multiple chars per tick for longer texts
            const chunk = text.slice(i, i + 3);
            element.innerHTML += escHtml(chunk);
            i += 3;
            setTimeout(type, speed);
        }
    }
    type();
}

function renderSingleResult(data, prompt) {
    const area = document.getElementById('result-area');
    const tpsBar = Math.min(100, (data.tokens_per_sec / 80) * 100); // scale to 80 t/s = 100%
    const score = calculateScore({ tokens_per_sec: data.tokens_per_sec, latency: parseFloat(data.latency) });

    area.innerHTML = `
        <div class="result-card">
            <div class="result-card-header">
                <span class="result-model-name">${data.model.toUpperCase()}</span>
                <span class="result-badge">Single Benchmark</span>
            </div>
            <div class="result-prompt-box">${escHtml(prompt)}</div>
            <div class="result-metrics">
                <div class="metric-item">
                    <div class="metric-label">Latency</div>
                    <div class="metric-value latency-val">${data.latency}s</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Tokens / sec</div>
                    <div class="metric-value tps-val">${data.tokens_per_sec}</div>
                    <div class="tps-bar-track"><div class="tps-bar-fill" style="width:${tpsBar}%"></div></div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Output Tokens</div>
                    <div class="metric-value">${data.tokens}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">CPU</div>
                    <div class="metric-value">${data.cpu}%</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Score</div>
                    <div class="metric-value" style="color:var(--accent-primary);">${score}</div>
                </div>
            </div>
            <details class="result-response-toggle" open>
                <summary>Model Response <span style="font-size:0.7rem;color:var(--text-low);">(streaming...)</span></summary>
                <div class="result-response-body" id="stream-output"></div>
            </details>
        </div>`;

    // Kick off streaming
    const streamEl = document.getElementById('stream-output');
    if (streamEl && data.response) {
        streamText(data.response, streamEl);
    }
}

function renderComparisonResult(data, prompt) {
    const area    = document.getElementById('result-area');
    let results   = data.results;
    const winner  = data.winner;

    // ── Scoring ──
    results.forEach(r => {
        r.score = calculateScore({ tokens_per_sec: r.tokens_per_sec, latency: parseFloat(r.latency || 0) });
    });
    results.sort((a, b) => b.score - a.score);

    const rows = results.map((r, i) => {
        const isWinner = i === 0; // top scorer after sort
        const tpsBar   = Math.min(100, (r.tokens_per_sec / 80) * 100);
        return `
            <tr class="${isWinner ? 'winner-row' : ''}">
                <td>
                    ${isWinner ? '<span class="trophy">🏆</span>' : `<span class="rank">#${i + 1}</span>`}
                    <strong>${r.model.toUpperCase()}</strong>
                </td>
                <td class="td-latency">${r.latency || '—'}s</td>
                <td>
                    <div class="comparison-tps-wrap">
                        <span class="td-tps">${r.tokens_per_sec}</span>
                        <div class="tps-bar-track"><div class="tps-bar-fill" style="width:${tpsBar}%"></div></div>
                    </div>
                </td>
                <td class="td-tokens">${r.tokens}</td>
                <td style="color:var(--accent-primary);font-weight:700;">${r.score}</td>
            </tr>`;
    }).join('');

    const topModel = results[0];

    area.innerHTML = `
        <div class="comparison-card">
            <div class="result-card-header">
                <span class="result-model-name">Model Comparison</span>
                <span class="result-badge winner-badge">🏆 Winner: ${topModel ? topModel.model.toUpperCase() : '—'}</span>
            </div>
            <div class="result-prompt-box">${escHtml(prompt)}</div>
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>Latency</th>
                        <th>Tokens / sec</th>
                        <th>Tokens</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="comparison-note">Ranked by Score (TPS×2 − Latency) · ${results.length} model${results.length !== 1 ? 's' : ''} tested</div>
            <div class="chart-section">
                <h4 class="chart-title">📊 Performance Chart</h4>
                <div class="chart-viewport" style="height:220px;">
                    <canvas id="compareChart"></canvas>
                </div>
            </div>
        </div>`;

    // Animate bar fills
    setTimeout(() => {
        document.querySelectorAll('.tps-bar-fill').forEach(el => {
            el.style.transition = 'width 0.7s ease';
        });
    }, 50);

    // ── Render Chart ──
    renderComparisonChart(results);
}

function renderComparisonChart(results) {
    const ctx = document.getElementById('compareChart');
    if (!ctx) return;

    // Destroy previous instance if any
    if (window._compareChartInst) window._compareChartInst.destroy();

    const labels = results.map(r => r.model.toUpperCase());
    const scores = results.map(r => r.score);
    const tpsArr = results.map(r => r.tokens_per_sec);
    const latArr = results.map(r => parseFloat(r.latency || 0));

    // Gradient colours per bar
    const barColors = results.map((_, i) =>
        i === 0 ? '#a855f7' : `rgba(99,102,241,${0.8 - i * 0.1})`
    );

    window._compareChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Score',       data: scores, backgroundColor: barColors, borderRadius: 6, borderSkipped: false },
                { label: 'TPS',         data: tpsArr,  backgroundColor: 'rgba(6,182,212,0.7)',  borderRadius: 6, borderSkipped: false },
                { label: 'Latency (s)', data: latArr,  backgroundColor: 'rgba(244,63,94,0.7)',  borderRadius: 6, borderSkipped: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { mode: 'index', intersect: false }
            },
            animation: { duration: 800, easing: 'easeOutQuart' }
        }
    });
}

// ── Persistent History Strip ──────────────────────────────────────────────────
function addToHistory(entry) {
    runHistory.unshift(entry);
    // Keep at most 50 entries in storage
    if (runHistory.length > 50) runHistory = runHistory.slice(0, 50);
    localStorage.setItem('slm_history', JSON.stringify(runHistory));
    renderHistory();
}

function renderHistory() {
    const el = document.getElementById('history-list');
    if (runHistory.length === 0) {
        el.innerHTML = '<div class="history-empty">No runs yet</div>';
        return;
    }
    const clearBtn = `<button class="history-clear-btn" onclick="clearHistory()" title="Clear all history">✕ Clear</button>`;
    el.innerHTML = clearBtn + runHistory.slice(0, 8).map(e => {
        const timeStr = e.ts ? new Date(e.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
        if (e.type === 'benchmark') {
            return `<div class="history-item">
                <span class="history-model">${e.model}</span>
                <span class="history-meta">${e.latency}s · ${e.tps} t/s${timeStr ? ' · ' + timeStr : ''}</span>
            </div>`;
        } else if (e.type === 'suite') {
            return `<div class="history-item history-suite">
                <span class="history-model">🧪 Suite · 🏆 ${e.winner || '?'}</span>
                <span class="history-meta">${e.count} model${e.count !== 1 ? 's' : ''} · 4 prompts${timeStr ? ' · ' + timeStr : ''}</span>
            </div>`;
        } else if (e.type === 'dataset') {
            return `<div class="history-item" style="border-color:rgba(251,146,60,0.3);">
                <span class="history-model">📊 Dataset · 🏆 ${e.winner || '?'}</span>
                <span class="history-meta">${e.count} model${e.count !== 1 ? 's' : ''} · ${e.prompts || 8} prompts${timeStr ? ' · ' + timeStr : ''}</span>
            </div>`;
        } else {
            return `<div class="history-item">
                <span class="history-model">🏆 ${e.winner || '?'}</span>
                <span class="history-meta">Compare (${e.count} models)${timeStr ? ' · ' + timeStr : ''}</span>
            </div>`;
        }
    }).join('');
}


function clearHistory() {
    runHistory = [];
    localStorage.removeItem('slm_history');
    renderHistory();
}

// ── Chat Message Bubbles ──────────────────────────────────────────────────────
function appendMessage(role, text, meta = null) {
    const history       = document.getElementById('chat-history');
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `message-wrapper ${role}-wrapper`;
    bubbleWrapper.style.cssText = 'display:flex;flex-direction:column;width:100%';

    const bubble = document.createElement('div');
    bubble.className = role === 'user' ? 'user-bubble' : (role === 'system-notice' ? 'system-notice-bubble' : 'ai-bubble');

    let content = `<div>${text}</div>`;

    if (role === 'ai') {
        const copyBtn = `
            <button class="copy-btn" title="Copy" onclick="copyToClipboard(this, \`${text.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>`;
        content = copyBtn + content;
    }

    if (meta) content += `<div class="ai-meta">${meta}</div>`;

    bubble.innerHTML = content;
    bubbleWrapper.appendChild(bubble);
    history.appendChild(bubbleWrapper);

    const scrollArea = document.getElementById('main-scroll-area');
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
}

async function copyToClipboard(btn, text) {
    try {
        await navigator.clipboard.writeText(text);
        const orig = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 2000);
    } catch (_) {}
}

// ── Analytics Hub (full evaluate suite) ──────────────────────────────────────
function renderAdvancedUI(results) {
    const leaderboardBody = document.getElementById('leaderboard-body');
    leaderboardBody.innerHTML = results.sort((a,b) => b.score - a.score).map((r, i) => `
        <tr>
            <td>
                <div style="font-weight:700">${r.model.toUpperCase()}</div>
                <div style="font-size:0.7rem;color:var(--text-low)">Rank #${i+1}</div>
            </td>
            <td style="color:var(--accent-primary);font-weight:800;font-size:1.1rem">${r.score}</td>
            <td>${r.avg_tps}</td>
            <td><button class="metric-btn" onclick="showModelDetails()">VIEW</button></td>
        </tr>`).join('');

    // Tasks
    const tasksMap = {};
    results.forEach(mr => {
        mr.tasks.forEach(task => {
            if (!tasksMap[task.task_id]) tasksMap[task.task_id] = { name: task.task_name || 'Custom', prompt: task.prompt, results: [] };
            tasksMap[task.task_id].results.push({ model: mr.model, response: task.response, latency: task.latency, tps: task.tps, tokens: task.tokens });
        });
    });

    document.getElementById('tasks-container').innerHTML = Object.values(tasksMap).map(task => `
        <div class="task-block">
            <h4 style="color:white;margin-bottom:0.5rem">Task: ${task.name}</h4>
            <div class="task-prompt-box">${task.prompt}</div>
            <div class="task-model-results">
                ${task.results.map(res => `
                    <div class="model-task-card">
                        <div style="font-size:0.7rem;color:var(--accent-cyan);margin-bottom:0.4rem;font-weight:800">${res.model.toUpperCase()}</div>
                        <div class="task-response-scroll">${res.response}</div>
                        <div style="font-size:0.65rem;color:var(--text-low);margin-top:0.5rem">${res.latency}s | ${res.tps} TPS</div>
                    </div>`).join('')}
            </div>
        </div>`).join('');

    updateChart(results);
}

function updateChartMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === metric);
    });
    if (currentResults.length > 0) updateChart(currentResults);
}

function updateChart(results) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const labels = results.map(r => r.model.toUpperCase());
    let data, label, color = '#7c3aed';

    if (currentMetric === 'score')   { data = results.map(r => r.score);       label = 'Score'; }
    else if (currentMetric === 'tps'){ data = results.map(r => r.avg_tps);     label = 'TPS';   color = '#06b6d4'; }
    else                             { data = results.map(r => r.avg_latency);  label = 'Latency'; color = '#f43f5e'; }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{ label, data, borderColor: color, backgroundColor: `${color}1a`, fill: true, tension: 0.4, pointRadius: 4 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function showModelDetails() {
    document.getElementById('tasks-panel').scrollIntoView({ behavior: 'smooth' });
}

// ── Loader ─────────────────────────────────────────────────────────────────────
function showLoader(show) {
    const askBtn  = document.getElementById('ask-btn');
    const stopBtn = document.getElementById('stop-btn');
    const input   = document.getElementById('prompt-input');
    const benchBtn  = document.getElementById('benchmark-btn');
    const cmpBtn    = document.getElementById('compare-btn');
    const suiteBtn  = document.getElementById('suite-btn');
    const datasetBtn = document.getElementById('dataset-btn');

    if (show) {
        askBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        input.setAttribute('disabled', 'true');
        input.style.opacity = '0.5';
        benchBtn.disabled  = true;
        cmpBtn.disabled    = true;
        suiteBtn.disabled  = true;
        datasetBtn.disabled = true;
    } else {
        askBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        input.removeAttribute('disabled');
        input.style.opacity = '1';
        benchBtn.disabled  = false;
        cmpBtn.disabled    = false;
        suiteBtn.disabled  = false;
        datasetBtn.disabled = false;
        input.focus();
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
