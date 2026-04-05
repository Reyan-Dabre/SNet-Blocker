# 🛡️ SNet Blocker - Project Documentation

**Author:** Reyan Dabre

SNet Blocker is a premium Chrome extension providing a Zero-Trust
browsing environment with real-time content filtering and email phishing
detection.

------------------------------------------------------------------------

## 📂 File Structure

    extension/
    │
    ├── app.js
    ├── auth.js
    ├── background.js
    ├── blocked.html
    ├── content.js
    ├── gmailScanner.js
    ├── manifest.json
    ├── menu.html
    ├── rule.js
    ├── style.css

------------------------------------------------------------------------

## 🚀 Installation

1.  Open Chrome → chrome://extensions/\
2.  Enable Developer Mode\
3.  Click Load Unpacked\
4.  Select extension/ folder

------------------------------------------------------------------------

## 🧠 Modules

### 🛡️ content.js

-   DOM scanning\
-   URL keyword detection\
-   Safe domain bypass\
-   MutationObserver

### ⚙️ background.js

-   Domain filtering\
-   Keyword filtering\
-   TLD filtering\
-   IDN detection\
-   Auto-block engine

### 📧 gmailScanner.js

-   Gmail auto scan\
-   "Show Original" analysis\
-   Phishing detection\
-   Risk scoring

### 📊 menu.html

-   Security dashboard\
-   Block / Trust / Auto tabs\
-   Email scanner tab

### 🎯 rule.js

-   Manage block list\
-   Manage trusted list\
-   Auto rules sync
