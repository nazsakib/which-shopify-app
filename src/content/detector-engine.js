/**
 * Shopify App Intelligence - Detector Engine
 */
class DetectorEngine {
  constructor() {
    this.detectedApps = new Map();
    this.confidenceWeights = {
      network: 0.95, cdn: 0.90, proxy: 0.85, script: 0.75,
      mutation: 0.80, webhook: 0.75, global: 0.65, dom: 0.65, appbridge: 0.70
    };
    this.detectionThreshold = 0.5; 
    this.isScanning = false;
    this.apps = [];
    this.globalsChecked = false;
    this.themeInfo = { name: 'Unknown' };
    this.shopDomain = '';
    this.isShopify = false;
    this.scriptWeight = 0;
  }

  async init(appsData) {
    this.apps = Array.isArray(appsData) ? appsData : [];
    this.fingerprintEngine = new FingerprintEngine(this.apps);
    this.mutationDetector = new MutationDetector(this.apps);
    // Instant initial check
    this.isShopify = this.detectIfShopify();
  }

  reset() {
    this.detectedApps.clear();
    this.isScanning = false;
    this.globalsChecked = false;
    this.isShopify = false;
  }

  async startFullScan() {
    // 1. Instant check
    this.isShopify = this.detectIfShopify();
    if (this.isScanning) return this.getResults();
    
    this.detectedApps.clear();
    if (!this.isShopify) {
      this.scanCDNFingerprints();
      this.scanInlineScripts();
      const results = this.getResults();
      results.isShopify = this.isShopify;
      return results;
    }

    this.isScanning = true;
    this.scanAppBlocks();
    this.scanScripts();
    this.scanInlineScripts();
    this.scanDOM();
    this.scanCDNFingerprints();
    this.calculateScriptWeight();
    this.detectTheme();
    
    return new Promise((resolve) => {
      try {
        this.mutationDetector.start((detection) => {
          if (detection && detection.appName) {
            this.recordDetection(detection.appName, 'mutation', this.confidenceWeights.mutation, detection.data || {});
          }
        }, () => {
          this.isScanning = false;
          resolve(this.getResults());
        });
        
        setTimeout(() => {
          this.isScanning = false;
          resolve(this.getResults());
        }, 6000);
      } catch (err) {
        this.isScanning = false;
        resolve(this.getResults());
      }
    });
  }

  detectIfShopify() {
    try {
      // 1. Check for global identifiers
      if (this.shopDomain || (window.Shopify && window.Shopify.shop)) return true;

      // 2. Check for Shopify-specific scripts/CDNs
      const scripts = document.querySelectorAll('script[src]');
      for (const script of scripts) {
        const src = script.src.toLowerCase();
        if (src.includes('cdn.shopify.com') || 
            src.includes('cdn.shopifycdn.net') || 
            src.includes('shopifycloud') || 
            src.includes('shopifysvc.com')) return true;
      }

      // 3. Check for specific Shopify DOM markers
      if (document.querySelector('[data-shopify-section-id]') || 
          document.querySelector('link[href*="cdn.shopify.com"]') ||
          document.querySelector('script[id="shopify-features"]') ||
          document.querySelector('form[action*="/cart/add"]')) return true;

      // 4. Check for Shopify cookies
      if (document.cookie.includes('_shopify_y') || document.cookie.includes('_shopify_s')) return true;

      return false;
    } catch (e) {
      return false;
    }
  }

  processExtractedHandle(handle, method, url = '') {
    if (!handle) return;
    let cleanHandle = handle.toLowerCase().replace(/[0-9]/g, '').replace(/-app$/, '').replace(/[^a-z-_]/g, '').replace(/[-_]+$/, '').trim();
    const exactBlacklist = ['assets', 'scripts', 'files', 'shop', 'storefront', 'perf', 'monorail', 'site-declaration', 'shopify-pay', 'shopify-cloud', 'app-bridge', 'jquery', 'analytics', 'vitals'];
    if (cleanHandle.length < 3 || exactBlacklist.includes(cleanHandle)) return;

    const brandMap = {
      'cart-drawer-cart-upsell': 'Boostly', 'zepto-product-personalizer': 'Zepto Product Personalizer',
      'zeptoapps': 'Zepto Product Personalizer', 'pplr-common': 'Zepto Product Personalizer',
      'zepto-common': 'Zepto Product Personalizer',
      'tinyseo': 'Tiny: SEO Image Optimizer', 'infinseo-seo-image-optimizer': 'InfinSEO',
      'avada': 'Avada', 'popman-popups-social': 'Popman', 'blockify-fraud-filter': 'Blockify Fraud Filter',
      'seoant': 'SEO Ant'
    };
    
    let finalName = brandMap[cleanHandle] || '';
    if (!finalName) {
      // 1. Direct slug match (100% precision)
      const foundBySlug = this.apps.find(a => a.slug && a.slug.toLowerCase() === cleanHandle);
      if (foundBySlug) finalName = foundBySlug.name;
    }

    if (!finalName) {
      const searchHandle = cleanHandle.replace(/[-_.]/g, '');
      // 2. Exact normalized handle match
      let foundApp = this.apps.find(app => {
        if (!app || !app.name) return false;
        const dbHandle = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return dbHandle === searchHandle;
      });

      // 3. High-confidence prefix match (minimum 4 characters, max 4 character length diff)
      if (!foundApp && searchHandle.length >= 4) {
        foundApp = this.apps.find(app => {
          if (!app || !app.name) return false;
          const dbHandle = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (dbHandle.length < 4) return false;
          return (dbHandle.startsWith(searchHandle) || searchHandle.startsWith(dbHandle)) && 
                 Math.abs(dbHandle.length - searchHandle.length) <= 4;
        });
      }
      if (foundApp) finalName = foundApp.name;
    }
    if (!finalName) finalName = cleanHandle.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    let existingMaster = null;
    for (let [name, data] of this.detectedApps) {
      const n1 = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const n2 = finalName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n1 === n2 || (n1.length >= 5 && n2.length >= 5 && Math.abs(n1.length - n2.length) <= 3 && (n1.includes(n2) || n2.includes(n1)))) {
        existingMaster = name;
        break;
      }
    }

    if (existingMaster) {
      const masterName = (finalName.length >= existingMaster.length) ? finalName : existingMaster;
      if (masterName !== existingMaster) {
        const data = this.detectedApps.get(existingMaster);
        this.detectedApps.delete(existingMaster);
        this.detectedApps.set(masterName, data);
      }
      this.recordDetection(masterName, method, 0.99, { handle: cleanHandle, url });
    } else {
      this.recordDetection(finalName, method, 0.85, { handle: cleanHandle, url });
    }
  }

  scanAppBlocks() {
    try {
      const iterator = document.createNodeIterator(document, NodeFilter.SHOW_COMMENT, null, false);
      let node;
      while (node = iterator.nextNode()) {
        const comment = node.nodeValue;
        if (!comment) continue;
        const blockMatch = comment.match(/BEGIN app (?:block|snippet|embed):\s*(?:shopify:\/\/apps\/)?([a-z0-9-_.]+)/i);
        if (blockMatch && blockMatch[1]) {
          const handle = blockMatch[1].split('/')[0];
          this.processExtractedHandle(handle, 'App Block');
        }
      }
    } catch (e) {}

    try {
      const elements = document.querySelectorAll('[data-shopify-app-block], [id^="shopify-block-"], [class*="shopify-app-block"], script[data-app-id], script[data-handle]');
      elements.forEach(el => {
        const appId = el.getAttribute('data-app-id') || el.getAttribute('data-handle') || el.getAttribute('data-shopify-app-block') || '';
        if (appId) this.processExtractedHandle(appId, 'App Block');
      });
    } catch (e) {}

    try {
      const assets = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
      assets.forEach(asset => {
        const url = asset.src || asset.href;
        if (!url) return;
        const patterns = [/\/extensions\/[a-f0-9-]+\/([a-z0-9-_.]+)\//i, /\/apps\/([a-z0-9-_.]+)\//i, /\/shopifycloud\/([a-z0-9-_.]+)\//i, /cdn\.shopify\.com\/s\/files\/.*\/apps\/([a-z0-9-_.]+)/i, /cdn-([a-z0-9-]+)\.com/i, /([a-z0-9-]+)cdn\.com/i];
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) { this.processExtractedHandle(match[1].split('/')[0], 'App CDN', url); break; }
        }
      });
    } catch (e) {}
  }

  checkNetwork(url) {
    if (!url || !this.isShopify) return;
    const urlLower = url.toLowerCase();
    this.apps.forEach(app => {
      if (!app) return;
      
      if (Array.isArray(app.cdn_fingerprints)) {
        for (const fp of app.cdn_fingerprints) {
          if (fp && urlLower.includes(fp.toLowerCase())) {
            this.recordDetection(app.name, 'network', this.confidenceWeights.network, { url });
            return;
          }
        }
      }
      
      if (Array.isArray(app.proxy_paths)) {
        for (const path of app.proxy_paths) {
          if (path && urlLower.includes(path.toLowerCase())) {
            this.recordDetection(app.name, 'network', this.confidenceWeights.proxy, { url });
            return;
          }
        }
      }
      
      if (Array.isArray(app.webhook_patterns)) {
        for (const pattern of app.webhook_patterns) {
          if (pattern && urlLower.includes(pattern.toLowerCase())) {
            this.recordDetection(app.name, 'network', this.confidenceWeights.webhook, { url });
            return;
          }
        }
      }
      
      if (Array.isArray(app.domains)) {
        for (const domain of app.domains) {
          if (domain && urlLower.includes(domain.toLowerCase())) {
            this.recordDetection(app.name, 'network', this.confidenceWeights.network, { url });
            return;
          }
        }
      }
      
      if (Array.isArray(app.scripts)) {
        for (const script of app.scripts) {
          if (script && urlLower.includes(script.toLowerCase())) {
            this.recordDetection(app.name, 'network', this.confidenceWeights.script, { url });
            return;
          }
        }
      }
    });
  }

  scanScripts() {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      if (script.src) this.apps.forEach(app => { if (this.matchScript(app, script.src)) this.recordDetection(app.name, 'script', this.confidenceWeights.script, { url: script.src }); });
    });
  }

  matchScript(app, url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    if (Array.isArray(app.domains)) for (const domain of app.domains) if (domain && urlLower.includes(domain.toLowerCase())) return true;
    if (Array.isArray(app.scripts)) for (const script of app.scripts) {
      if (!script) continue;
      const scriptLower = script.toLowerCase();
      if (urlLower.includes(scriptLower)) return true;
    }
    return false;
  }

  scanInlineScripts() {
    const scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
      const content = script.textContent;
      if (content) this.apps.forEach(app => { if (app.globals) app.globals.forEach(global => { if (content.includes(global)) this.recordDetection(app.name, 'Script Code', 0.85, { variable: global }); }); });
    });
  }

  scanDOM() {
    this.apps.forEach(app => {
      if (Array.isArray(app.dom)) app.dom.forEach(selector => {
        try { const elements = document.querySelectorAll(selector); if (elements && elements.length > 0) this.recordDetection(app.name, 'dom', this.confidenceWeights.dom, { selector, count: elements.length }); } catch (e) {}
      });
    });
  }

  scanCDNFingerprints() {
    document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach(el => {
      const url = el.src || el.href;
      if (url && this.fingerprintEngine) {
        const matches = this.fingerprintEngine.match(url);
        if (matches) matches.forEach(match => this.recordDetection(match.app, match.type, 0.90, { url }));
      }
    });
  }

  detectTheme() {
    try {
      document.querySelectorAll('script:not([src])').forEach(script => {
        if (script.textContent.includes('Shopify.theme')) {
          const match = script.textContent.match(/"name":"([^"]+)"/);
          if (match) this.themeInfo.name = match[1];
        }
      });
    } catch (e) {}
  }

  calculateScriptWeight() {
    try {
      let totalBytes = 0;
      performance.getEntriesByType('resource').forEach(r => { if (r.initiatorType === 'script' || r.name.endsWith('.js')) totalBytes += (r.encodedBodySize || r.transferSize || 0); });
      this.scriptWeight = totalBytes;
    } catch (e) {}
  }

  recordDetection(appName, method, baseConfidence, data = {}) {
    if (!appName) return;
    if (!this.detectedApps.has(appName)) this.detectedApps.set(appName, { name: appName, methods: [], totalScore: 0, appData: this.apps.find(a => a && a.name.toLowerCase() === appName.toLowerCase()) || null });
    const app = this.detectedApps.get(appName);
    if (!app.methods.find(m => m.method === method)) { app.methods.push({ method, confidence: baseConfidence, data }); app.totalScore += baseConfidence; }
  }

  handleGlobals(globalsList, shopifyObject) {
    if (this.globalsChecked) return;
    this.globalsChecked = true;
    if (shopifyObject) {
      if (shopifyObject.theme) this.themeInfo.name = shopifyObject.theme.name || this.themeInfo.name;
      if (shopifyObject.shop) this.shopDomain = shopifyObject.shop;
    }
    if (!Array.isArray(globalsList)) return;
    const globalsSet = new Set(globalsList);
    const commonGlobals = ['analytics', 'dataLayer', 'google_tag_manager', 'Shopify'];
    this.apps.forEach(app => {
      if (app.globals) app.globals.forEach(global => {
        const topLevel = global.split('.')[0];
        if (!commonGlobals.includes(topLevel) && globalsSet.has(topLevel)) this.recordDetection(app.name, 'global', this.confidenceWeights.global, { variable: global });
      });
    });
  }

  getResults() {
    const active = [], scripts = [], ghosts = [];
    this.detectedApps.forEach((app, name) => {
      const methods = app.methods.map(m => m.method);
      const res = { name, category: app.appData?.category || 'Ecommerce', methods, alternative: this.getAlternative(name) };
      const hasDirectEvidence = methods.includes('App Block') || methods.includes('App Snippet') || methods.includes('App Config');
      const hasStrongProof = methods.length >= 3;
      if (hasDirectEvidence || (hasStrongProof && methods.includes('dom'))) active.push(res);
      else if (methods.includes('App CDN') || (methods.includes('script') && app.totalScore > 0.8)) scripts.push(res);
      else ghosts.push(res);
    });
    const activeApps = active.sort((a,b) => a.name.localeCompare(b.name));
    const names = activeApps.map(a => a.name.toLowerCase());
    let stack = "Standard Stack";
    if (names.includes('klaviyo') && (names.includes('loox') || names.includes('judgeme'))) stack = "High-Conversion Stack";
    if (names.includes('recharge') || names.includes('bold')) stack = "Subscription Stack";
    return { active: activeApps, scripts: scripts.sort((a,b) => a.name.localeCompare(b.name)), ghosts: ghosts.sort((a,b) => a.name.localeCompare(b.name)), growthStack: stack, isShopify: this.isShopify };
  }

  getAlternative(appName) {
    const alternatives = { 'Yotpo': { name: 'Judge.me', reason: 'Faster & lower cost' }, 'Loox': { name: 'Okendo', reason: 'Better for high-volume stores' }, 'Klaviyo': { name: 'Omnisend', reason: 'Simplified automation workflow' }, 'PageFly': { name: 'Instant Page', reason: 'Modern OS 2.0 optimized' }, 'Privy': { name: 'Seguno', reason: 'Native Shopify experience' }, 'Zendesk': { name: 'Gorgias', reason: 'Shopify-first helpdesk' } };
    return alternatives[appName] || null;
  }

  getStoreInfo() {
    return { domain: window.location.hostname, url: window.location.href, timestamp: new Date().toISOString(), theme: this.themeInfo.name, shop: this.shopDomain, isShopify: this.isShopify, scriptWeight: this.scriptWeight };
  }

  getPerformanceWarning(results) { return null; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DetectorEngine };
}
