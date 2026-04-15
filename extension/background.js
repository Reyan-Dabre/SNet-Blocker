'use strict';

/**
 * SNet Blocker — FULL ENGINE (MERGED)
 */

const API = 'http://172.20.188.138:3000';

// ─────────────────────────────────────────
// 🔥 FULL RULE ENGINE
// ─────────────────────────────────────────

const KNOWN_DANGEROUS_DOMAINS = [
"bet365.com","betway.com","888casino.com","pokerstars.com",
"1xbet.com","stake.com","roobet.com","bc.game","fantasy",
 "dream11","mpl","myteam11","howzat",
"4rabet.com","dafabet.com","mostbet.com","parimatch.comdrea",
"22bet.com","melbet.com","fun88.com",
"rajabets.com","puntit.com","batery.com","biggerz.com",
"fairplay.in","fairplay.club","jeetwin.com","jeetwin.club",
"yolo247.com","yolo247.in",
"1xbat.com","1xbet.in","parimatch.in","fairplay.bet",
"jeetwin.bet","rajabets.in","stake.bet","stake.games",
"pornhub.com","xvideos.com","xnxx.com","xhamster.com",
"redtube.com","youporn.com","spankbang.com",
"onlyfans.com","stripchat.com","chaturbate.com",
"thepiratebay.org","1337x.to","yts.mx",
"grabify.link","iplogger.org","redgifs.com","masa49.it.com","masa49.it"
];

const FORBIDDEN_KEYWORDS = {
    gambling: ["casino","slots","jackpot","betting","poker","roulette","lottery","play",
                "gamble","wager","bookmaker","sportsbook","bet365","betway","draftkings",
                "fanduel","1xbet","team","fantasy","dream11","mpl","myteam11","howzat"],
    adult: ["porn","xxx","nude","escort","hentai","nsfw","sex","fetish"],
    malware: ["crack","keygen","hack","trojan","virus","ransomware"]
};

const HIGH_RISK_TLDS = [
    ".onion",".zip",".mov",".top",".gdn",".buzz",".tk",".ml",
    ".ga",".cf",".xyz",".pw",".cc",".icu",".cam",".xxx",".porn"
];

// ─── SECURITY ENGINE ─────────────────────

function calculateSecurityScore(urlObj) {
    let score = 100;
    let flags = [];
    let category = null;

    const hostname = urlObj.hostname.toLowerCase();
    const fullUrl = urlObj.href.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // 🚨 Known dangerous
    if (KNOWN_DANGEROUS_DOMAINS.some(d =>
        hostname === d || hostname.endsWith('.' + d)
    )) {
        return {
            score: 0,
            reasons: ["Known dangerous domain"],
            status: "Danger",
            category: "Restricted"
        };
    }

    // 🚨 IDN attack
    if (hostname.includes("xn--") || /[^\x00-\x7F]/.test(hostname)) {
        score = 0;
        flags.push("IDN Homograph Attack");
        category = "Phishing";
    }

    // ⚠️ High-risk TLD
    if (HIGH_RISK_TLDS.some(tld => hostname.endsWith(tld))) {
        score -= 50;
        flags.push("High-risk TLD");
    }

    // 🔍 Keyword scan
    const text = hostname + " " + pathname;

    for (const [cat, words] of Object.entries(FORBIDDEN_KEYWORDS)) {
        const matched = words.filter(w => text.includes(w));
        if (matched.length) {
            score -= Math.min(matched.length * 20, 80);
            flags.push(`${cat}: ${matched.slice(0, 3).join(', ')}`);
            if (!category) category = cat;
        }
    }

    // ⚠️ Suspicious patterns
    if (/\d{4,}/.test(hostname)) {
        score -= 15;
        flags.push("Numeric domain");
    }

    if (hostname.split('.').length > 4) {
        score -= 10;
        flags.push("Too many subdomains");
    }

    if (fullUrl.includes('@')) {
        score -= 30;
        flags.push("@ redirect trick");
    }

    return {
        score: Math.max(0, score),
        reasons: flags,
        status: score > 70 ? "Safe" : score > 40 ? "Warning" : "Danger",
        category
    };
}

// ─────────────────────────────────────────
// 🔧 HELPERS
// ─────────────────────────────────────────

function blockedPageURL(domain, reason) {
    return chrome.runtime.getURL('blocked.html') +
        `?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(reason)}`;
}

async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        return await res.json();
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────
// 🚫 MAIN BLOCK ENGINE
// ─────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'loading' || !tab.url) return;

    let url;
    try { url = new URL(tab.url); } catch { return; }

    if (url.protocol.startsWith('chrome')) return;

    const hostname = url.hostname.toLowerCase();

    chrome.storage.local.get(['user_id'], async (res) => {
        if (!res.user_id) return;

        try {
            const trusted = await safeFetch(`${API}/list/${res.user_id}?type=trusted`);
            if (Array.isArray(trusted) && trusted.some(r =>
                r.domain === hostname || hostname.endsWith('.' + r.domain)
            )) {
                return;
            }

            const security = calculateSecurityScore(url);

            if (security.score <= 40) {
                await safeFetch(`${API}/autoblock`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        userId: res.user_id,
                        domain: hostname,
                        reason: security.reasons.join(', ') || "Blocked"
                    })
                });

                chrome.tabs.update(tabId, {
                    url: blockedPageURL(
                        hostname,
                        security.reasons.join(', ') || "Blocked"
                    )
                });
            }

        } catch (e) {
            console.error('[SNet ERROR]', e);
        }
    });
});

// ─────────────────────────────────────────
// 📩 CONTENT SCRIPT SIGNAL
// ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action !== 'content_flagged' || !sender.tab) return;

    chrome.storage.local.get(['user_id'], async (res) => {
        if (!res.user_id) return;

        chrome.tabs.update(sender.tab.id, {
            url: blockedPageURL(msg.domain, msg.category)
        });
    });
});

// ─────────────────────────────────────────
// 🚀 SERVER AUTO START
// ─────────────────────────────────────────

async function tryStartServer() {
    try {
        const port = chrome.runtime.connectNative('com.snet.launcher');
        port.postMessage({ command: 'start_server' });
    } catch {
        console.warn('[SNet] Native messaging failed');
    }
}

chrome.runtime.onInstalled.addListener(tryStartServer);
chrome.runtime.onStartup.addListener(tryStartServer);
