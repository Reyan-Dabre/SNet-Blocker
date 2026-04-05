/**
 * app.js — SNet Blocker Dashboard Controller
 * ───────────────────────────────────────────────────────────────────────────
 * Manages the dashboard UI:
 *  - Session guard (redirect to login if not authenticated)
 *  - Threat Radar animation with real-time scoring
 *  - Live stats from server
 *  - Tab navigation
 *  - Block/Trust/Auto list management
 *  - Logout functionality
 */

'use strict';

const API = "http://172.20.188.138:3000";

// ─── Session Guard ───────────────────────────────────────────────────────────
chrome.storage.local.get(["user_id", "user_email"], (res) => {
    if (!res.user_id) {
        window.location.href = "index.html";
        return;
    }
    initDashboard(res.user_id, res.user_email);
});

function initDashboard(userId, userEmail) {

    // ── Set user badge ───────────────────────────────────────────────────────
    const badge = document.getElementById('userBadge');
    if (badge && userEmail) {
        badge.innerText = userEmail.split('@')[0];
    }

    // ── Setup tabs ───────────────────────────────────────────────────────────
    setupTabs();

    // ── Load data ────────────────────────────────────────────────────────────
    loadLists(userId);
    loadStats(userId);
    loadSyncSnapshot(userId);
    updateSecurityUI();

    // ── Periodic updates ─────────────────────────────────────────────────────
    setInterval(() => updateSecurityUI(), 2000);
    setInterval(() => loadStats(userId), 15000);
    setInterval(() => loadSyncSnapshot(userId), 20000);
    setInterval(() => checkServerStatus(), 30000);

    // ── Server status ────────────────────────────────────────────────────────
    checkServerStatus();

    // ── Logout ───────────────────────────────────────────────────────────────
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            chrome.storage.local.remove(["user_id", "user_email", "login_time"], () => {
                window.location.href = "index.html";
            });
        };
    }

    // ── Block/Trust buttons ──────────────────────────────────────────────────
    document.getElementById('addBlockBtn').onclick = () => addRule(userId, 'manual', 'blockInput');
    document.getElementById('addTrustBtn').onclick = () => addRule(userId, 'trusted', 'trustInput');

    // Enter key support for inputs
    document.getElementById('blockInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addRule(userId, 'manual', 'blockInput');
    });
    document.getElementById('trustInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addRule(userId, 'trusted', 'trustInput');
    });
}

// ─── Security Radar UI ──────────────────────────────────────────────────────

async function updateSecurityUI() {
    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            setRadarState(100, "Safe", "New Tab");
            return;
        }

        const urlObj = new URL(tab.url);
        const security = calculateSecurityScore(urlObj);

        setRadarState(security.score, security.status, urlObj.hostname);

    } catch (e) {
        // Silently handle errors
    }
}

function setRadarState(score, status, domain) {
    const statusText  = document.getElementById('statusText');
    const statusLabel = document.getElementById('statusLabel');
    const domainChip  = document.getElementById('currentDomain');
    const radar       = document.querySelector('.radar');

    if (statusText)  statusText.innerText = `${score}%`;
    if (statusLabel) statusLabel.innerText = status;
    if (domainChip)  domainChip.innerText = domain;

    if (radar) {
        radar.classList.remove('state-safe', 'state-warning', 'state-danger');
        if (status === "Danger") {
            radar.classList.add('state-danger');
        } else if (status === "Warning") {
            radar.classList.add('state-warning');
        } else {
            radar.classList.add('state-safe');
        }
    }

    // Update radar center color
    if (statusText) {
        if (status === "Danger") statusText.style.color = "var(--danger)";
        else if (status === "Warning") statusText.style.color = "var(--warning)";
        else statusText.style.color = "var(--primary)";
    }
}

// ─── Live Stats ──────────────────────────────────────────────────────────────

async function loadStats(userId) {
    try {
        const res = await fetch(`${API}/stats/${userId}`);
        const stats = await res.json();

        animateCounter('statToday', stats.blockedToday || 0);
        animateCounter('statTotal', stats.totalBlocked || 0);
        animateCounter('statRules', (stats.manualRules || 0) + (stats.autoRules || 0));

        // Add threat dots to radar
        updateRadarDots(stats.recentThreats || []);

    } catch {
        // Server might be offline
    }
}

function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const current = parseInt(el.innerText, 10) || 0;
    if (current === targetValue) return;

    const diff = targetValue - current;
    const steps = Math.min(Math.abs(diff), 20) || 1;
    const increment = diff / steps;

    let step = 0;
    const timer = setInterval(() => {
        step += 1;
        const next = Math.round(current + increment * step);
        el.innerText = String(step >= steps ? targetValue : next);
        if (step >= steps) {
            clearInterval(timer);
        }
    }, 18);
}

async function loadSyncSnapshot(userId) {
    const el = document.getElementById('syncFootprint');
    if (!el) return;

    try {
        const res = await fetch(`${API}/sync/snapshot/${userId}`);
        if (!res.ok) throw new Error('snapshot unavailable');
        const snap = await res.json();
        el.innerText = `Synced policy: ${snap.totalRules} rules • ${snap.manualRules} blocked • ${snap.trustedRules} trusted • ${snap.autoRules} auto-detected.`;
    } catch {
        el.innerText = 'Sync snapshot unavailable. Start local server to keep extension + mobile app in sync.';
    }
}

function updateRadarDots(threats) {
    const container = document.getElementById('radarDots');
    if (!container) return;

    container.innerHTML = '';

    threats.slice(0, 5).forEach((threat, i) => {
        const dot = document.createElement('div');
        dot.className = 'threat-dot';

        // Position dots randomly on the radar
        const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
        const radius = 25 + Math.random() * 30; // 25-55% from center
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;

        dot.style.left = `${x}%`;
        dot.style.top = `${y}%`;
        dot.style.animationDelay = `${i * 0.1}s`;
        dot.title = `${threat.domain} — ${threat.reason}`;

        container.appendChild(dot);
    });
}

// ─── Server Status ───────────────────────────────────────────────────────────

async function checkServerStatus() {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusBarText');
    if (!bar || !text) return;

    try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            bar.classList.remove('offline');
            text.innerText = 'Server Connected • Firewall Active';
        } else {
            setOffline();
        }
    } catch {
        setOffline();
    }

    function setOffline() {
        bar.classList.add('offline');
        text.innerText = 'Server Offline — Start server.bat as Admin';
    }
}

// ─── List Management ─────────────────────────────────────────────────────────

async function loadLists(userId) {
    if (!userId) {
        chrome.storage.local.get(["user_id"], (res) => {
            if (res.user_id) loadListsInternal(res.user_id);
        });
        return;
    }
    loadListsInternal(userId);
}

async function loadListsInternal(userId) {
    try {
        const [manualRes, trustRes, autoRes] = await Promise.all([
            fetch(`${API}/list/${userId}?type=manual`),
            fetch(`${API}/list/${userId}?type=trusted`),
            fetch(`${API}/autolist/${userId}`)
        ]);

        renderList('blockList', await manualRes.json(), 'manual');
        renderList('trustList', await trustRes.json(), 'trusted');
        renderAutoList('autoBlockList', await autoRes.json());
    } catch {
        // Server might be offline
    }
}

function renderList(elementId, data, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = data.length ? "" : "<li class='empty-msg'>No domains added</li>";

    data.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${type === 'manual' ? '🚫' : '✅'} ${item.domain}</span>
            <button onclick="handleDelete('${item.domain}', '${type}')">Remove</button>
        `;
        el.appendChild(li);
    });
}

function renderAutoList(elementId, data) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = data.length ? "" : "<li class='empty-msg'>No auto blocks yet — the engine will detect threats automatically.</li>";

    data.forEach(item => {
        let icon = "🤖";
        if (item.reason && item.reason.includes("Adult"))          icon = "🔞";
        else if (item.reason && item.reason.includes("Gambling"))  icon = "🎰";
        else if (item.reason && item.reason.includes("Content"))   icon = "📵";
        else if (item.reason && item.reason.includes("Homograph")) icon = "🪤";
        else if (item.reason && item.reason.includes("Malware"))   icon = "☠️";
        else if (item.reason && item.reason.includes("Known"))     icon = "⛔";

        const li = document.createElement('li');
        li.innerHTML = `
            <div class="auto-item-info">
                <div class="auto-item-domain">${icon} ${item.domain}</div>
                <div class="auto-item-reason">${item.reason || 'Auto-detected'}</div>
            </div>
            <button onclick="handleAutoDelete('${item.domain}')">Unblock</button>
        `;
        el.appendChild(li);
    });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

window.handleDelete = async (domain, type) => {
    chrome.storage.local.get(["user_id"], async (res) => {
        if (!res.user_id) return;
        await fetch(`${API}/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: res.user_id, domain, type })
        });
        loadLists(res.user_id);
    });
};

window.handleAutoDelete = async (domain) => {
    chrome.storage.local.get(["user_id"], async (res) => {
        if (!res.user_id) return;
        await fetch(`${API}/unautoblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: res.user_id, domain })
        });
        loadLists(res.user_id);
    });
};

async function addRule(userId, type, inputId) {
    const input = document.getElementById(inputId);
    let domain = input.value.trim();
    if (!domain) return;

    // Clean domain input
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

    const btn = input.nextElementSibling;
    const originalText = btn.innerText;
    btn.innerText = '...';
    btn.disabled = true;

    try {
        await fetch(`${API}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, domain, type })
        });
        input.value = "";
        loadLists(userId);
    } catch {
        // Handle silently
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetView = btn.getAttribute('data-tab');

            // Update buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update views
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const view = document.getElementById(targetView);
            if (view) view.classList.add('active');
        });
    });
}
