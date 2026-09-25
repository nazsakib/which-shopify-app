# Which Shopify App 🛡️

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/which-shopify-app)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Shopify Apps](https://img.shields.io/badge/Apps%20Database-27%2C000%2B-green?logo=shopify&logoColor=white)](https://apps.shopify.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Privacy Friendly](https://img.shields.io/badge/Privacy-100%25%20Client--Side-informational)](#privacy--security)

> **Inspect any Shopify store's tech stack in seconds.** Detect active apps, third-party script integrations, and orphaned residual code left behind by uninstalled apps with multi-signal precision.

---

## 🌟 Overview

**Which Shopify App** is a high-performance open-source Chrome Extension designed for ecommerce developers, agency auditors, store owners, and competitive analysts.

When auditing a Shopify store, it is often difficult to distinguish between apps that are actively installed and legacy code snippets that were left behind after uninstallation. This extension analyzes the live storefront in real-time, categorizing every trace of third-party software into three dedicated intelligence columns.

---

## 🚀 Key Features

### 1. 🔍 Multi-Signal Precision Detection
Rather than relying on naive text matching, the detector cross-references multiple independent layers of storefront data:
* **Shopify Theme App Extensions (OS 2.0)**: Tracks native App Blocks (`shopify://apps/...`) and theme embed markers.
* **Network & CDN Fingerprints**: Intercepts third-party script requests, API calls, and proxy endpoints (`/apps/*`, `/a/*`).
* **DOM Mutation Monitoring**: Watches for late-injected scripts, delayed iframes, and dynamic widget renders.
* **Main-World JavaScript Globals**: Safely checks runtime window variables (e.g. `window.Shopify`, `window.klaviyo`, `window.Loox`) via an isolated script bridge.
* **Inline Snippet Inspection**: Analyzes inline script tags and theme configuration objects.

### 2. 📊 3-Column Intelligence Dashboard
* **Active Apps**: Verified installations actively rendering through official Shopify App Blocks, custom widgets, or corroborated DOM structures.
* **Apps Using Scripts**: Background scripts, tracking tags, and external CDN dependencies executing on the storefront.
* **Residual App Code ("Ghosts")**: Orphaned Liquid snippets, abandoned container elements, and dead script tags remaining in the theme after an app has been uninstalled.

### 3. 🏪 Store Architecture & Theme Intelligence
* **Theme Detection**: Identifies the active Shopify theme name and version directly from store metadata.
* **MyShopify Identifier Tracker**: Instantly uncovers the underlying `myshopify.com` domain for custom-domain storefronts with 1-click clipboard copy.
* **Performance Stack Insight**: Identifies high-conversion stacks, subscription architectures, and script payload impact.

### 4. 📚 Comprehensive 27,000+ App Catalog
The official production extension distributed on the Chrome Web Store bundles detection signatures for the entire catalog of over **27,000 official Shopify App Store applications**, providing instant recognition for apps across all categories: Marketing, Reviews, Fulfillment, Subscriptions, SEO, and Page Builders. *(Note: The open-source repository provides `apps-database.sample.json` as a schema template for contributors).*

### 5. 🔒 100% Private & Client-Side
* No tracking, telemetry, or external server calls.
* All detection and analysis happen entirely inside your local browser tab.
* Zero data collection of merchant store data or user activity.

---

## 📥 Installation

Install the extension directly from the official **Chrome Web Store**:

[![Download on Chrome Web Store](https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png)](https://chromewebstore.google.com/detail/which-shopify-app)

👉 **[Download on Chrome Web Store](https://chromewebstore.google.com/detail/which-shopify-app)**

*(Chrome Web Store provides verified security sandboxing and automated background updates.)*

---

## 🛠️ How It Works

```
                       ┌──────────────────────────────────────────────┐
                       │           Merchant Shopify Store             │
                       └──────────────────────┬───────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
       ┌──────────────────────────┐                        ┌──────────────────────────┐
       │   Static DOM & Comments  │                        │  Dynamic Network & Hooks │
       │  - OS 2.0 App Blocks     │                        │  - Script tags & CDNs    │
       │  - Inline Liquid tags    │                        │  - Mutation Observer     │
       │  - Residual HTML markers │                        │  - Main-world Globals    │
       └────────────┬─────────────┘                        └────────────┬─────────────┘
                    │                                                   │
                    └─────────────────────────┬─────────────────────────┘
                                              ▼
                               ┌─────────────────────────────┐
                               │   Multi-Layer Verifier      │
                               │  Cross-referenced against   │
                               │  27,000+ App Signatures     │
                               └──────────────┬──────────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
            ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
            │    Active Apps    │   │ Apps Using Scripts│   │ Residual "Ghosts" │
            │ (Confirmed Active)│   │  (CDN / Network)  │   │  (Dead leftovers) │
            └───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## 💡 Use Cases

* **Ecommerce Agencies**: Perform rapid theme audits for new clients to identify leftover app bloat slowing down store load times.
* **Merchants**: Identify abandoned scripts left behind by previously removed apps to clean up your Liquid theme templates.
* **Competitive Analysis**: Discover the exact software stack, review provider, search engine, and marketing automation driving any competitor store.
* **App Developers**: Verify how your theme app extensions and embeds render across diverse store themes.

---

## 🤝 Contributing

We welcome contributions from the ecommerce community!

* **Report Missing Apps or False Positives**: Open an issue with the store URL and the app name.
* **Improve Signatures**: Submit a PR to enhance detection signatures in `apps-database.json` or improve heuristics in `detector-engine.js`.
* **Feature Requests**: Suggest new intelligence metrics via GitHub Discussions.

### Contribution Guidelines
1. Fork the repository and create your feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes: `git commit -am 'Add new app detection signature'`
3. Push to the branch: `git push origin feature/my-new-feature`
4. Open a Pull Request.

---

## 🛡️ Privacy & Security

* **Permissions Used**:
  * `activeTab`: Used solely to analyze the DOM of the active browser tab when opened.
  * `storage`: Caches scan results locally on your machine to deliver instant audits upon revisiting stores.
  * `scripting`: Executes the lightweight detection bridge in the main page world.
* **Zero Telemetry**: We do not operate external logging servers or collect analytics.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the LICENSE file for details.
