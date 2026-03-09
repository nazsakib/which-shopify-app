/**
 * Shopify App Intelligence - Detector Engine
 * Universal Detection for Blocks, Embeds, and Snippets.
 */
class DetectorEngine {
  constructor() {
    this.detectedApps = new Map();
    this.confidenceWeights = {
      network: 0.95,
      cdn: 0.90,
      proxy: 0.85,
      script: 0.75,
      mutation: 0.80,
      webhook: 0.75,
      global: 0.65,
      dom: 0.65,
      appbridge: 0.70
    };
    this.detectionThreshold = 0.5; 
    this.isScanning = false;
    this.apps = [];
    this.globalsChecked = false;
    this.themeInfo = { name: 'Unknown' };
    this.shopDomain = '';
    this.scriptWeight = 0;
  }

  async init(appsData) {
    this.apps = Array.isArray(appsData) ? appsData : [];
    this.fingerprintEngine = new FingerprintEngine(this.apps);
    this.mutationDetector = new MutationDetector(this.apps);
  }

  reset() {
    this.detectedApps.clear();
    this.isScanning = false;
    this.globalsChecked = false;
    this.scriptWeight = 0;
    this.shopDomain = '';
  }

  async startFullScan() {
    if (this.isScanning) return this.getResults();
    this.isScanning = true;
    
    // Reset detections for a fresh scan
    this.detectedApps.clear();
    
    this.scanAppBlocks();
    this.scanScripts();
    this.scanInlineScripts();
    this.scanDOM();
    this.scanCDNFingerprints();
    this.scanAppBridge();
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
        }, 2000);
      } catch (err) {
        this.isScanning = false;
        resolve(this.getResults());
      }
    });
  }

  scanAppBlocks() {
    // Universal Comment Scanner - Highest Precision
    try {
      const iterator = document.createNodeIterator(document, NodeFilter.SHOW_COMMENT, null, false);
      let node;
      while (node = iterator.nextNode()) {
        const comment = node.nodeValue;
        if (!comment) continue;
        
        // Capture ANY app block, snippet, or embed path
        const blockMatch = comment.match(/BEGIN app (?:block|snippet|embed):\s*(?:shopify:\/\/apps\/)?([a-z0-9-_.]+)/i);
        if (blockMatch && blockMatch[1]) {
          const handle = blockMatch[1].split('/')[0];
          this.processExtractedHandle(handle, 'App Block');
        }
      }
    } catch (e) {}

    // DOM Attribute Scanner
    try {
      const elements = document.querySelectorAll('[data-shopify-app-block], [id^="shopify-block-"], [class*="shopify-app-block"], script[data-app-id], script[data-handle]');
      elements.forEach(el => {
        const appId = el.getAttribute('data-app-id') || el.getAttribute('data-handle') || el.getAttribute('data-shopify-app-block') || '';
        if (appId) {
          this.processExtractedHandle(appId, 'App Block');
        }
      });
    } catch (e) {}
  }

  processExtractedHandle(handle, method, url = '') {
    if (!handle) return;
    
    // 1. Initial Clean: Remove numbers and technical characters
    let cleanHandle = handle.toLowerCase()
      .replace(/[0-9]/g, '')
      .replace(/[^a-z-_]/g, '')
      .replace(/[-_]+$/, '') 
      .replace(/^[-_]+/, '') 
      .trim();

    // 2. Technical Suffix Strip (avada-app -> avada)
    const techSuffixes = ['-app', '_app', '-js', '_js', '-plugin', '_plugin', '-block', '_block'];
    techSuffixes.forEach(s => {
      if (cleanHandle.endsWith(s)) cleanHandle = cleanHandle.substring(0, cleanHandle.length - s.length);
    });

    // 3. System Blacklist
    const systemBlacklist = ['assets', 'scripts', 'files', 'shop', 'storefront', 'perf', 'monorail', 'site-declaration', 'shopify-pay', 'shopify-cloud', 'app-bridge', 'jquery', 'analytics', 'vitals'];
    if (cleanHandle.length < 3 || systemBlacklist.some(b => cleanHandle.includes(b))) return;

    // 4. Precision Brand Mapping
    const brandMap = {
      'cart-drawer-cart-upsell': 'Boostly',
      'zepto-product-personalizer': 'Zepto Product Personalizer',
      'zeptoapps': 'Zepto Product Personalizer',
      'pplr-common': 'Zepto Product Personalizer',
      'tinyseo': 'Tiny: SEO Image Optimizer',
      'infinseo-seo-image-optimizer': 'InfinSEO',
      'avada': 'Avada',
      'popman-popups-social': 'Popman',
      'blockify-fraud-filter': 'Blockify Fraud Filter'
    };
    
    let finalName = brandMap[cleanHandle] || '';

    // 5. Database Search Fallback
    if (!finalName) {
      const searchHandle = cleanHandle.replace(/[-_.]/g, '');
      const foundApp = this.apps.find(app => {
        if (!app || !app.name) return false;
        const dbHandle = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return dbHandle.includes(searchHandle) || searchHandle.includes(dbHandle);
      });
      if (foundApp) finalName = foundApp.name;
    }

    // 6. Heuristic Fallback
    if (!finalName) {
      finalName = cleanHandle.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // 7. Intelligent Deduplication & Merging
    let existingMaster = null;
    for (let [name, data] of this.detectedApps) {
      const n1 = name.toLowerCase().replace(/[^a-z]/g, '');
      const n2 = finalName.toLowerCase().replace(/[^a-z]/g, '');
      if (n1.includes(n2) || n2.includes(n1)) {
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
      this.recordDetection(finalName, method, 0.95, { handle: cleanHandle, url });
    }
  }

  scanScripts() {
    try {
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach(script => {
        const src = script.src;
        if (!src) return;
        this.apps.forEach(app => {
          if (!app) return;
          if (this.matchScript(app, src)) {
            this.recordDetection(app.name, 'script', this.confidenceWeights.script, { url: src });
          }
        });
      });
    } catch (e) {}
  }

  matchScript(app, url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    
    // Signature Hardening: Ignore generic keywords in common paths
    const genericKeywords = ['analytics', 'theme', 'common', 'jquery', 'widget', 'loader', 'main', 'app'];
    
    if (Array.isArray(app.domains)) {
      for (const domain of app.domains) {
        if (domain && urlLower.includes(domain.toLowerCase())) return true;
      }
    }
    if (Array.isArray(app.scripts)) {
      for (const script of app.scripts) {
        if (!script) continue;
        const scriptLower = script.toLowerCase();
        // Skip generic scripts unless we have a domain match already
        if (genericKeywords.includes(scriptLower.replace(/\.js$/, '')) && !urlLower.includes(app.name.toLowerCase())) {
          continue;
        }
        if (urlLower.includes(scriptLower)) return true;
      }
    }
    return false;
  }

  scanInlineScripts() {
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      scripts.forEach(script => {
        const content = script.textContent;
        if (!content) return;
        this.apps.forEach(app => {
          if (!app || !Array.isArray(app.globals)) return;
          app.globals.forEach(global => {
            if (global && content.includes(global)) {
              this.recordDetection(app.name, 'Script Code', 0.85, { variable: global });
            }
          });
        });
      });
    } catch (e) {}
  }

  scanDOM() {
    this.apps.forEach(app => {
      if (!app || !Array.isArray(app.dom)) return;
      app.dom.forEach(selector => {
        if (!selector) return;
        try {
          const elements = document.querySelectorAll(selector);
          if (elements && elements.length > 0) {
            this.recordDetection(app.name, 'dom', this.confidenceWeights.dom, { selector, count: elements.length });
          }
        } catch (e) {}
      });
    });
  }

  scanCDNFingerprints() {
    try {
      const scripts = document.querySelectorAll('script[src], link[rel="stylesheet"]');
      scripts.forEach(el => {
        const url = el.src || el.href;
        if (!url) return;
        if (this.fingerprintEngine && typeof this.fingerprintEngine.match === 'function') {
          const matches = this.fingerprintEngine.match(url);
          if (Array.isArray(matches)) {
            matches.forEach(match => {
              if (match && match.app && match.type) {
                 this.recordDetection(match.app, match.type, this.confidenceWeights[match.type] || 0.90, { url });
              }
            });
          }
        }
      });
    } catch (e) {}
  }

  scanAppBridge() {}

  calculateScriptWeight() {
    try {
      const resources = performance.getEntriesByType('resource');
      let totalBytes = 0;
      resources.forEach(resource => {
        if (!resource || !resource.name) return;
        if (resource.initiatorType === 'script' || resource.name.endsWith('.js') || resource.name.includes('/extensions/')) {
          totalBytes += (resource.encodedBodySize || resource.transferSize || 0);
        }
      });
      this.scriptWeight = totalBytes;
    } catch (e) {}
  }

  detectTheme() {
    try {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const script of scripts) {
        if (!script || !script.textContent) continue;
        const content = script.textContent;
        if (content.includes('Shopify.theme')) {
          const nameMatch = content.match(/"name":"([^"]+)"/);
          if (nameMatch && nameMatch[1]) this.themeInfo.name = nameMatch[1];
        }
      }
    } catch (e) {}
  }

  recordDetection(appName, method, baseConfidence, data = {}) {
    if (!appName) return;
    if (!this.detectedApps.has(appName)) {
      this.detectedApps.set(appName, {
        name: appName,
        methods: [],
        totalScore: 0,
        appData: this.apps.find(a => a && a.name === appName) || null
      });
    }
    const app = this.detectedApps.get(appName);
    if (!app.methods.find(m => m.method === method)) {
      app.methods.push({ method, confidence: baseConfidence, data });
      app.totalScore += baseConfidence;
    }
  }

  handleGlobals(globalsList, shopifyObject) {
    if (this.globalsChecked) return;
    this.globalsChecked = true;
    
    if (shopifyObject) {
      if (shopifyObject.theme) {
        this.themeInfo.name = shopifyObject.theme.name || this.themeInfo.name;
      }
      if (shopifyObject.shop) {
        this.shopDomain = shopifyObject.shop;
      }
    }

    if (!Array.isArray(globalsList)) return;
    const globalsSet = new Set(globalsList);
    
    // Signature Hardening: Ignore common globals
    const commonGlobals = ['analytics', 'dataLayer', 'google_tag_manager', 'Shopify'];

    this.apps.forEach(app => {
      if (!app || !Array.isArray(app.globals)) return;
      app.globals.forEach(global => {
        const topLevel = global.split('.')[0];
        if (commonGlobals.includes(topLevel)) return;
        
        if (globalsSet.has(topLevel)) {
          this.recordDetection(app.name, 'global', this.confidenceWeights.global, { variable: global });
        }
      });
    });
  }

  getResults() {
    const active = [], scripts = [], ghosts = [];
    
    this.detectedApps.forEach((app, name) => {
      if (!name || name.length < 3) return;
      
      const methods = app.methods.map(m => m.method);
      const appData = app.appData || {};
      const category = appData.category || 'Ecommerce';
      const score = app.totalScore;
      
      const res = { 
        name, 
        category, 
        methods,
        alternative: this.getAlternative(name)
      };

      // --- MULTI-SIGNAL VERIFICATION LOGIC ---
      const hasDirectEvidence = methods.includes('App Block') || 
                                methods.includes('App Snippet') || 
                                methods.includes('App Config');

      const hasStrongProof = methods.length >= 3;

      if (hasDirectEvidence || (hasStrongProof && methods.includes('dom'))) {
        active.push(res);
      } else if (methods.includes('App CDN') || (methods.includes('script') && score > 0.8)) {
        scripts.push(res);
      } else {
        ghosts.push(res);
      }
    });

    const activeApps = active.sort((a,b) => a.name.localeCompare(b.name));
    
    // GROWTH STACK LOGIC
    const names = activeApps.map(a => a.name.toLowerCase());
    let stack = "Standard Stack";
    if (names.includes('klaviyo') && (names.includes('loox') || names.includes('judgeme'))) stack = "High-Conversion Stack";
    if (names.includes('recharge') || names.includes('bold')) stack = "Subscription Stack";

    return {
      active: activeApps,
      scripts: scripts.sort((a,b) => a.name.localeCompare(b.name)),
      ghosts: ghosts.sort((a,b) => a.name.localeCompare(b.name)),
      growthStack: stack
    };
  }

  getAlternative(appName) {
    const alternatives = {
      'Yotpo': { name: 'Judge.me', reason: 'Faster & lower cost' },
      'Loox': { name: 'Okendo', reason: 'Better for high-volume stores' },
      'Klaviyo': { name: 'Omnisend', reason: 'Simplified automation workflow' },
      'PageFly': { name: 'Instant Page', reason: 'Modern OS 2.0 optimized' },
      'Privy': { name: 'Seguno', reason: 'Native Shopify experience' },
      'Zendesk': { name: 'Gorgias', reason: 'Shopify-first helpdesk' }
    };
    return alternatives[appName] || null;
  }

  getStoreInfo() {
    return {
      domain: window.location.hostname,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      theme: this.themeInfo.name,
      shop: this.shopDomain,
      scriptWeight: this.scriptWeight
    };
  }

  getPerformanceWarning(results) { return null; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DetectorEngine };
}
