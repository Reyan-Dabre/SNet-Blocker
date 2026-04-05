(function () {
    'use strict';

    /**
     * CORE ENGINE: analyzeContent
     * Scans text for phishing patterns, urgency, and brand impersonation.
     */
    function analyzeContent(text, sender = "", urls = []) {
        let reasons = [];
        let score = 100;
        const lowerText = text.toLowerCase();

        // 1. Check for Urgency/Threat Language
        const urgentFlags = ["urgent", "suspended", "unauthorized", "action required", "blocked", "verify", "security alert"];
        urgentFlags.forEach(flag => {
            if (lowerText.includes(flag)) {
                score -= 15;
                reasons.push(`Urgency: ${flag}`);
            }
        });

        // 2. Check for Brand Impersonation
        const highValueTargets = ["paypal", "bank", "netflix", "amazon", "apple", "microsoft", "google", "meta"];
        highValueTargets.forEach(brand => {
            if (lowerText.includes(brand)) {
                // If brand is mentioned but sender doesn't match the brand domain
                if (sender && !sender.toLowerCase().includes(brand)) {
                    score -= 40;
                    reasons.push(`Possible ${brand} Impersonation`);
                }
            }
        });

        // 3. Link Analysis
        urls.forEach(url => {
            try {
                const u = new URL(url);
                if (u.protocol !== 'https:') {
                    score -= 10;
                    reasons.push("Insecure Link (HTTP)");
                }
                if (url.length > 120) {
                    score -= 10;
                    reasons.push("Suspiciously Long URL");
                }
            } catch(e) {}
        });

        return {
            score: Math.max(score, 0),
            reasons: [...new Set(reasons)]
        };
    }

    /* ─── DASHBOARD LOGIC (Manual Scan) ─── */
    const scanBtn = document.getElementById('scanEmailBtn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            const input = document.getElementById('emailInput').value;
            const resultBox = document.getElementById('emailResult');

            if (!input.trim()) return;

            // Extract links for analysis
            const urlRegex = /https?:\/\/[^\s"']+/g;
            const foundUrls = input.match(urlRegex) || [];
            
            const analysis = analyzeContent(input, "", foundUrls);
            
            let html = `
                <div class="risk-header">
                    <span class="risk-label">Analysis Result</span>
                    <span class="risk-score" style="color: ${analysis.score < 70 ? 'var(--danger)' : 'var(--primary)'}">
                        ${analysis.score}% Safe
                    </span>
                </div>
            `;

            if (analysis.reasons.length > 0) {
                analysis.reasons.forEach(r => {
                    html += `<span class="reason-chip">⚠️ ${r}</span>`;
                });
            } else {
                html += `<div class="safe-status">✅ No immediate phishing signatures detected in the content.</div>`;
            }

            resultBox.innerHTML = html;
        });
    }

    /* ─── GMAIL AUTO-SCAN LOGIC ─── */
    if (location.hostname.includes("mail.google.com")) {
        console.log("[SNet] Gmail Scanner Thread Initialized");

        function scanActiveEmail() {
            try {
                // Find Gmail's active email body and sender
                const bodyEl = document.querySelector('.a3s.aiL') || document.querySelector('.a3s');
                const senderEl = document.querySelector('.gD');

                if (!bodyEl) return;

                const sender = senderEl ? senderEl.getAttribute('email') : "";
                const content = bodyEl.innerText;
                const links = [...bodyEl.querySelectorAll('a')].map(a => a.href);

                const result = analyzeContent(content, sender, links);

                if (result.score < 75) {
                    showGmailBanner(result);
                }
            } catch (e) {}
        }

        function showGmailBanner(res) {
            if (document.getElementById("snet-gmail-alert")) return;

            const banner = document.createElement("div");
            banner.id = "snet-gmail-alert";
            banner.style = `
                background: #ff4757; color: white; padding: 12px; 
                text-align: center; font-weight: bold; font-family: sans-serif;
                border-radius: 8px; margin: 10px; border: 2px solid rgba(0,0,0,0.2);
            `;
            banner.innerText = `🚨 SNet Warning: Suspicious Email Patterns Detected (${res.score}% Safe). Reasons: ${res.reasons.join(", ")}`;
            
            // Inject into Gmail's view
            const target = document.querySelector('.bkK') || document.body;
            target.prepend(banner);
        }

        // Run scan periodically as user clicks emails
        setInterval(scanActiveEmail, 4000);
    }

})();