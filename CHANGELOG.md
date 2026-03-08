# Changelog

All notable changes to the **Which Shopify App** extension project are documented in this file.

This project was established on **March 8, 2026** and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.2.1] — 2026-09-26
### Added
- Official Shopify App Store logos and direct slug resolutions for 20+ top ghost/script apps including GA4, Google Tag Manager, Klaviyo SMS, Stamped.io, Attentive, Meta Pixel, and TikTok Pixel.
- Two-row layout with store info header (Theme, Store URL, MyShopify handle) and sidebar category navigation.
- Verified test suite with 11 automated test suites validating subsumption, alias resolution, and logo coverage.

### Optimized
- Pre-indexed dictionary and Map-based lookups reducing storefront scan time from ~5,500ms to ~23ms.
- Sub-second instant cache-first rendering (<5ms) when opening the extension popup on already-audited pages.

### Refactored
- Cleaned open-source architecture with human-readable variable names, removing single-letter abbreviations and prompt remnants.

---

## [v1.2.0] — 2026-09-25
### Added
- Open-source public release with MIT License.
- Pre-populated offline database catalog covering 24,000+ Shopify applications with official CDN icons.
- Subsumption algorithm preventing component fragmentation (e.g. Zepto Product Personalizer).
- Polaris-inspired design system with strict 100% client-side privacy guarantees.

### Changed
- Restructured project tree into modern `src/` and `assets/` modular architecture.

---

## [v1.1.3] — 2026-03-09
### Added
- Immersive Shopify-only gateway overlay with backdrop blur for non-Shopify domains.
- Precision fingerprint rules for script tags and proxy routes.

---

## [v1.1.2] — 2026-03-09
### Added
- 3-column triage dashboard (Active Apps, Apps w/ Scripts, Residual Ghosts).
- Multi-Signal Verification engine corroborating DOM elements, script handles, and window globals.
- MyShopify domain resolution and active theme detection.

---

## [v1.1.1] — 2026-03-08
### Added
- Initial project release: Shopify App Intelligence Detector.
- Core multi-signal heuristic engine scanning storefront scripts, CDNs, and App Blocks.
- Basic popup interface with clipboard export capabilities.
