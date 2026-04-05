'use strict';

const API_URL = "http://172.20.188.138:3000";
let isSignup = false;

// ─── SESSION CHECK ─────────────────────────────────────
chrome.storage.local.get(["user_id", "user_email"], async (stored) => {
    if (stored.user_id) {
        try {
            const res = await fetch(`${API_URL}/verify/${stored.user_id}`, {
                signal: AbortSignal.timeout(3000)
            });

            if (res.ok) {
                const data = await res.json();

                if (data.valid) {
                    window.location.href = "menu.html";
                    return;
                }
            }

        } catch (e) {
            // If server is down, still allow user (offline mode)
            window.location.href = "menu.html";
            return;
        }
    }

    initAuthUI();
});

// ─── UI INIT ───────────────────────────────────────────
function initAuthUI() {

    const toggleModeEl   = document.getElementById('toggleMode');
    const signupFieldsEl = document.getElementById('signupFields');
    const actionBtnEl    = document.getElementById('actionBtn');
    const msgEl          = document.getElementById('msg');
    const serverStatus   = document.getElementById('serverStatus');

    // ─── SERVER STATUS ─────────────────────────────────
    checkServerStatus();

    async function checkServerStatus() {
        if (!serverStatus) return;

        try {
            const res = await fetch(`${API_URL}/health`, {
                signal: AbortSignal.timeout(2000)
            });

            if (res.ok) {
                serverStatus.innerText = "🟢 Server Online";
                serverStatus.className = "server-status online";
            } else {
                showOffline();
            }
        } catch {
            showOffline();
        }
    }

    function showOffline() {
        serverStatus.innerText = "🔴 Server Offline";
        serverStatus.className = "server-status offline";
    }

    // ─── TOGGLE LOGIN / SIGNUP ─────────────────────────
    toggleModeEl.onclick = () => {
        isSignup = !isSignup;

        msgEl.innerText = "";

        signupFieldsEl.style.display = isSignup ? "block" : "none";
        actionBtnEl.innerText = isSignup ? "Sign Up" : "Login";

        toggleModeEl.innerText = isSignup
            ? "Already have an account? Login"
            : "Need an account? Sign up";
    };

    // ─── AUTH ACTION ───────────────────────────────────
    actionBtnEl.onclick = async () => {

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('pass').value.trim();

        if (!email || !password) {
            showMessage("Please fill all fields", "error");
            return;
        }

        // Signup validation
        if (isSignup) {
            const confirm = document.getElementById('passConfirm').value.trim();

            if (password !== confirm) {
                showMessage("Passwords do not match", "error");
                return;
            }
        }

        // Loading state
        actionBtnEl.disabled = true;
        actionBtnEl.innerText = isSignup ? "Creating..." : "Logging in...";

        try {
            const res = await fetch(`${API_URL}${isSignup ? "/signup" : "/login"}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },

                body: JSON.stringify({
                    email,
                    password
                })
            });

            let data = {};
            try {
                data = await res.json();
            } catch {
                throw new Error("Invalid server response");
            }

            if (res.ok && data.user_id) {

                showMessage(
                    isSignup ? "Account created!" : "Login successful!",
                    "success"
                );

                chrome.storage.local.set({
                    user_id: data.user_id,
                    user_email: email,
                    login_time: Date.now()
                }, () => {
                    setTimeout(() => {
                        window.location.href = "menu.html";
                    }, 500);
                });

            } else {
                showMessage(data.error || "Authentication failed", "error");
                resetBtn();
            }

        } catch (e) {
            showMessage("Server not reachable", "error");
            resetBtn();
            showOffline();
        }
    };

    // ─── HELPERS ───────────────────────────────────────
    function showMessage(text, type) {
        msgEl.innerText = text;
        msgEl.className = type === "success" ? "msg-success" : "msg-error";
    }

    function resetBtn() {
        actionBtnEl.disabled = false;
        actionBtnEl.innerText = isSignup ? "Sign Up" : "Login";
    }

    // Enter key support
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            actionBtnEl.click();
        }
    });
}