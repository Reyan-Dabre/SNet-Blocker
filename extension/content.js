(function () {
    'use strict';

    let fallbackInterval = null; // ✅ FIXED
    let observer = null;
    let debounce = null;

    const SAFE_DOMAINS = [
        "google.com","youtube.com","facebook.com","instagram.com",
        "twitter.com","x.com","linkedin.com","github.com",
        "stackoverflow.com","wikipedia.org","amazon.in","flipkart.com",
        "microsoft.com","apple.com","gmail.com","outlook.com",
        "whatsapp.com","telegram.org","discord.com","localhost", "172.20.188.138"
    ];

    const hostname = window.location.hostname.toLowerCase();

    if (SAFE_DOMAINS.some(s => hostname === s || hostname.endsWith('.' + s))) return;
    if (!hostname || window.location.protocol === 'chrome-extension:') return;

    // ── Keywords ─────────────────────────────────────────

    const WORDS = {
        adult: ["porn","xxx","nude","escort","hentai","nsfw","sex","fetish","bdsm"],
        gambling: ["casino","bet","gambling","poker","roulette","jackpot","1xbet"],
        malware: ["crack","keygen","hack","virus","trojan","free download","click here"]
    };

    function buildRegex(arr) {
        return new RegExp(`\\b(${arr.join('|')})\\b`, 'gi');
    }

    const REGEX = {
        adult: buildRegex(WORDS.adult),
        gambling: buildRegex(WORDS.gambling),
        malware: buildRegex(WORDS.malware)
    };

    let flagged = false;
    let scanCount = 0;
    const MAX_SCANS = 10;

    // ── URL SCAN ─────────────────────────────────────────

    function scanURL() {
        const url = window.location.href.toLowerCase();

        for (let type in REGEX) {
            REGEX[type].lastIndex = 0;
            if (REGEX[type].test(url)) {
                flag(type, ["url match"], "url");
                return true;
            }
        }
        return false;
    }

    // ── MAIN SCAN ───────────────────────────────────────

    function scan() {
        if (flagged || scanCount >= MAX_SCANS) return;
        scanCount++;

        let text = "";

        try {
            text += document.title || "";

            if (document.body) {
                text += document.body.innerText.slice(0, 5000);
            }
        } catch {}

        for (let type in REGEX) {
            REGEX[type].lastIndex = 0;
            const matches = text.match(REGEX[type]) || [];

            const unique = [...new Set(matches)];

            if (unique.length >= 2) {
                flag(type, unique.slice(0, 5), "content");
                return;
            }
        }
    }

    // ── FLAG ────────────────────────────────────────────

    function flag(type, keywords, source) {
        if (flagged) return;
        flagged = true;

        console.log(`[SNet] 🚨 ${type} detected`);

        chrome.runtime.sendMessage({
            action: "content_flagged",
            domain: hostname,
            category: type,
            keywords,
            source
        });

        stopAll();
    }

    // ── CONTROL ─────────────────────────────────────────

    function startObserver() {
        try {
            observer = new MutationObserver(() => {
                if (flagged) return;
                clearTimeout(debounce);
                debounce = setTimeout(scan, 800);
            });

            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        } catch {}
    }

    function stopAll() {
        if (observer) observer.disconnect();
        if (fallbackInterval) clearInterval(fallbackInterval); // ✅ FIXED
    }

    // ── PIPELINE ────────────────────────────────────────

    if (scanURL()) return;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scan);
    } else {
        scan();
    }

    window.addEventListener("load", () => {
        setTimeout(scan, 500);
    });

    startObserver();

    // ✅ FIXED INTERVAL
    fallbackInterval = setInterval(() => {
        if (flagged || scanCount >= MAX_SCANS) {
            clearInterval(fallbackInterval);
            return;
        }
        scan();
    }, 3000);

})();