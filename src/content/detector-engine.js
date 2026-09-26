const GENERIC_BLOCK_NAMES = new Set([
  'assets', 'scripts', 'files', 'shop', 'storefront', 'perf', 'monorail',
  'site-declaration', 'shopify-pay', 'shopify-cloud', 'app-bridge', 'jquery',
  'analytics', 'vitals', 'embed-common', 'embed_common', 'embedcommon',
  'common', 'core', 'runtime', 'main', 'bundle', 'loader', 'vendor', 'vendors',
  'app-block', 'app-embed', 'helper', 'helpers', 'theme-extension', 'theme-app-extension',
  'theme-app-embed', 'chunk', 'chunks', 'snippet', 'snippets', 'client', 'init',
  'widget', 'widgets', 'tracking', 'tracker', 'utils', 'util', 'block', 'blocks',
  'embed', 'common-script', 'common-scripts', 'embed-script', 'section', 'sections'
]);

const CANONICAL_ALIASES = {
  'pplr': 'Zepto Product Personalizer',
  'pplr-common': 'Zepto Product Personalizer',
  'pplrcommon': 'Zepto Product Personalizer',
  'zepto': 'Zepto Product Personalizer',
  'zeptoapps': 'Zepto Product Personalizer',
  'zepto-common': 'Zepto Product Personalizer',
  'zepto_common': 'Zepto Product Personalizer',
  'zeptocommon': 'Zepto Product Personalizer',
  'zepto-product-personalizer': 'Zepto Product Personalizer',
  'zeptoproductpersonalizer': 'Zepto Product Personalizer',
  'product-personalizer': 'Zepto Product Personalizer',
  'productpersonalizer': 'Zepto Product Personalizer',
  'cart-drawer-cart-upsell': 'Boostly',
  'cartdrawercartupsell': 'Boostly',
  'tinyseo': 'Tiny: SEO Image Optimizer',
  'infinseo-seo-image-optimizer': 'InfinSEO',
  'infinseoseoimageoptimizer': 'InfinSEO',
  'avada': 'Avada',
  'popman-popups-social': 'Popman',
  'popmanpopupssocial': 'Popman',
  'blockify-fraud-filter': 'Blockify Fraud Filter',
  'blockifyfraudfilter': 'Blockify Fraud Filter',
  'seoant': 'SEO Ant'
};

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
    this.pendingComponents = [];
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
    this.pendingComponents = [];
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
        }, 450);
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

  resolveCanonicalName(handle) {
    if (!handle) return '';
    const cleanHandle = handle.toLowerCase().replace(/[0-9]/g, '').replace(/-app$/, '').replace(/[^a-z-_]/g, '').replace(/[-_]+$/, '').trim();
    const searchHandle = cleanHandle.replace(/[-_.]/g, '');
    return CANONICAL_ALIASES[cleanHandle] || CANONICAL_ALIASES[searchHandle] || '';
  }

  extractComponentName(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const parts = cleanUrl.split('/').filter(Boolean);
      if (parts.length === 0) return '';
      const filename = parts[parts.length - 1];
      if (filename.endsWith('.js') || filename.endsWith('.css')) {
        return filename;
      }
      return parts[parts.length - 1] || '';
    } catch (e) {
      return '';
    }
  }

  extractExtensionId(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/\/extensions\/([a-z0-9-]+)\//i);
    return match ? match[1] : '';
  }

  attachPendingComponent(pending) {
    if (!pending) return false;
    const urlLower = (pending.url || '').toLowerCase();
    const pendingExtId = this.extractExtensionId(pending.url);
    const normHandle = (pending.handle || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const [appName, app] of this.detectedApps) {
      const normApp = appName.toLowerCase().replace(/[^a-z0-9]/g, '');

      let matches = false;
      if (pendingExtId && app.extensionIds && app.extensionIds.has(pendingExtId)) {
        matches = true;
      } else if (urlLower && urlLower.includes(normApp)) {
        matches = true;
      } else if (normApp.includes('zepto') && (urlLower.includes('zepto') || urlLower.includes('pplr') || normHandle.includes('embed') || normHandle.includes('zepto') || normHandle.includes('pplr') || normHandle.includes('personalizer'))) {
        matches = true;
      } else if (this.detectedApps.size === 1) {
        matches = true;
      }

      if (matches) {
        if (!app.components) app.components = new Set();
        if (pending.handle) app.components.add(pending.handle);
        if (pending.url) {
          const comp = this.extractComponentName(pending.url);
          if (comp) app.components.add(comp);
        }
        return true;
      }
    }
    return false;
  }

  processExtractedHandle(handle, method, url = '') {
    if (!handle) return;
    let cleanHandle = handle.toLowerCase().replace(/[0-9]/g, '').replace(/-app$/, '').replace(/[^a-z-_]/g, '').replace(/[-_]+$/, '').trim();
    if (cleanHandle.length < 3) return;

    const normalized = cleanHandle.replace(/[-_.]/g, '');

    // Step 1: Blacklist generic block and script handles
    if (GENERIC_BLOCK_NAMES.has(cleanHandle) || GENERIC_BLOCK_NAMES.has(normalized)) {
      const pendingItem = { handle: cleanHandle, method, url };
      this.pendingComponents.push(pendingItem);
      this.attachPendingComponent(pendingItem);
      return;
    }

    // Step 3: Canonical alias mapping
    let finalName = this.resolveCanonicalName(cleanHandle);

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

    const finalCanonical = this.resolveCanonicalName(finalName.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (finalCanonical) finalName = finalCanonical;

    this.recordDetection(finalName, method, 0.95, { handle: cleanHandle, url });
    this.runSubsumptionPass();
  }

  scanAppBlocks() {
    try {
      const iterator = document.createNodeIterator(document, NodeFilter.SHOW_COMMENT, null, false);
      let node;
      while (node = iterator.nextNode()) {
        const comment = node.nodeValue;
        if (!comment) continue;
        const blockMatch = comment.match(/BEGIN app (?:block|snippet|embed):\s*(?:shopify:\/\/apps\/)?([a-z0-9-_.]+)(?:\/blocks\/([a-z0-9-_.]+))?/i);
        if (blockMatch && blockMatch[1]) {
          const handle = blockMatch[1].split('/')[0];
          const subBlock = blockMatch[2] ? blockMatch[2].split('/')[0] : '';
          this.processExtractedHandle(handle, 'App Block');
          if (subBlock) {
            const pendingSub = { handle: subBlock, parentHandle: handle, method: 'App Block' };
            this.pendingComponents.push(pendingSub);
            this.attachPendingComponent(pendingSub);
          }
        }
      }
    } catch (e) {}

    try {
      const elements = document.querySelectorAll('[data-shopify-app-block], [id^="shopify-block-"], [class*="shopify-app-block"], script[data-app-id], script[data-handle]');
      elements.forEach(el => {
        const appId = el.getAttribute('data-app-id') || el.getAttribute('data-handle') || el.getAttribute('data-shopify-app-block') || '';
        if (appId) {
          this.processExtractedHandle(appId, 'App Block');
        } else if (el.id && el.id.startsWith('shopify-block-')) {
          const fullIdHandle = el.id.replace('shopify-block-', '');
          if (fullIdHandle) this.processExtractedHandle(fullIdHandle, 'App Block');
        }
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
    if (!this.detectedApps.has(appName)) {
      this.detectedApps.set(appName, {
        name: appName,
        methods: [],
        totalScore: 0,
        components: new Set(),
        extensionIds: new Set(),
        appData: this.apps.find(a => a && a.name.toLowerCase() === appName.toLowerCase()) || null
      });
    }
    const app = this.detectedApps.get(appName);
    if (!app.components) app.components = new Set();
    if (!app.extensionIds) app.extensionIds = new Set();

    if (data.handle && !GENERIC_BLOCK_NAMES.has(data.handle.toLowerCase())) {
      app.components.add(data.handle);
    }
    if (data.component) {
      app.components.add(data.component);
    }
    if (data.url) {
      const extId = this.extractExtensionId(data.url);
      if (extId) app.extensionIds.add(extId);
      const comp = this.extractComponentName(data.url);
      if (comp) app.components.add(comp);
    }
    if (data.variable) {
      app.components.add(data.variable);
    }

    if (!app.methods.find(m => m.method === method)) {
      app.methods.push({ method, confidence: baseConfidence, data });
      app.totalScore += baseConfidence;
    }
  }

  shouldSubsume(nameA, nameB) {
    if (nameA === nameB) return null;

    const normA = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normB = nameB.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Canonical alias check
    const canA = this.resolveCanonicalName(normA);
    const canB = this.resolveCanonicalName(normB);
    if (canA && canA === nameB) return { master: nameB, child: nameA };
    if (canB && canB === nameA) return { master: nameA, child: nameB };

    // Database-backed app priority check
    const appA = this.detectedApps.get(nameA);
    const appB = this.detectedApps.get(nameB);
    const hasDbA = !!(appA && appA.appData);
    const hasDbB = !!(appB && appB.appData);

    // Subphrase check (e.g. "Product Personalizer" inside "Zepto Product Personalizer")
    if (normA.length >= 5 && normB.length >= 5) {
      if (normB.includes(normA) && normB.length > normA.length) {
        if (hasDbA && !hasDbB) return { master: nameA, child: nameB };
        return { master: nameB, child: nameA };
      }
      if (normA.includes(normB) && normA.length > normB.length) {
        if (hasDbB && !hasDbA) return { master: nameB, child: nameA };
        return { master: nameA, child: nameB };
      }
    }

    // Brand root with generic suffix check (e.g. "Zepto Common" vs "Zepto Product Personalizer")
    const wordsA = nameA.toLowerCase().split(/[\s-_]+/);
    const wordsB = nameB.toLowerCase().split(/[\s-_]+/);
    const genericSuffixes = new Set([
      'common', 'core', 'embed', 'runtime', 'main', 'loader', 'widget',
      'helper', 'script', 'base', 'sdk', 'bundle', 'api', 'tools', 'app'
    ]);

    if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0]) {
      const isAGeneric = wordsA.slice(1).every(w => genericSuffixes.has(w));
      const isBGeneric = wordsB.slice(1).every(w => genericSuffixes.has(w));
      if (isAGeneric && !isBGeneric) {
        return { master: nameB, child: nameA };
      }
      if (isBGeneric && !isAGeneric) {
        return { master: nameA, child: nameB };
      }
    }

    // Generic name check
    if (GENERIC_BLOCK_NAMES.has(normA) && !GENERIC_BLOCK_NAMES.has(normB)) {
      return { master: nameB, child: nameA };
    }
    if (GENERIC_BLOCK_NAMES.has(normB) && !GENERIC_BLOCK_NAMES.has(normA)) {
      return { master: nameA, child: nameB };
    }

    return null;
  }

  mergeApps(masterName, childName) {
    if (masterName === childName) return;
    const masterApp = this.detectedApps.get(masterName);
    const childApp = this.detectedApps.get(childName);
    if (!masterApp || !childApp) return;

    if (!masterApp.components) masterApp.components = new Set();
    if (!childApp.components) childApp.components = new Set();

    // 1. Move child's name into components of master
    if (childName !== masterName) {
      masterApp.components.add(childName);
    }

    // 2. Transfer child's components into master
    childApp.components.forEach(c => masterApp.components.add(c));

    // 3. Transfer detection methods and confidence scores
    for (const m of childApp.methods) {
      if (!masterApp.methods.some(existing => existing.method === m.method)) {
        masterApp.methods.push(m);
      }
      if (m.data?.handle) masterApp.components.add(m.data.handle);
      if (m.data?.url) {
        const comp = this.extractComponentName(m.data.url);
        if (comp) masterApp.components.add(comp);
        const extId = this.extractExtensionId(m.data.url);
        if (extId) {
          if (!masterApp.extensionIds) masterApp.extensionIds = new Set();
          masterApp.extensionIds.add(extId);
        }
      }
    }
    masterApp.totalScore = Math.max(masterApp.totalScore, childApp.totalScore) + 0.1;

    // 4. Inherit metadata if master is missing it
    if (!masterApp.appData && childApp.appData) {
      masterApp.appData = childApp.appData;
    }

    // 5. Delete child from detected apps
    this.detectedApps.delete(childName);
  }

  runSubsumptionPass() {
    // 1. Drain pending components into matching detected apps
    if (this.pendingComponents && this.pendingComponents.length > 0) {
      for (const pending of this.pendingComponents) {
        this.attachPendingComponent(pending);
      }
    }

    // 2. Canonical mapping normalization pass for existing apps
    for (const [name, app] of Array.from(this.detectedApps.entries())) {
      const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const canonical = this.resolveCanonicalName(normName);
      if (canonical && canonical !== name) {
        if (this.detectedApps.has(canonical)) {
          this.mergeApps(canonical, name);
        } else {
          this.detectedApps.delete(name);
          app.name = canonical;
          if (!app.components) app.components = new Set();
          app.components.add(name);
          this.detectedApps.set(canonical, app);
        }
      }
    }

    // 3. Pairwise subsumption check
    let merged = true;
    let iterations = 0;
    while (merged && iterations < 10) {
      merged = false;
      iterations++;
      const currentNames = Array.from(this.detectedApps.keys());
      for (let i = 0; i < currentNames.length; i++) {
        const nameA = currentNames[i];
        if (!this.detectedApps.has(nameA)) continue;

        for (let j = 0; j < currentNames.length; j++) {
          if (i === j) continue;
          const nameB = currentNames[j];
          if (!this.detectedApps.has(nameA) || !this.detectedApps.has(nameB)) continue;

          const decision = this.shouldSubsume(nameA, nameB);
          if (decision) {
            this.mergeApps(decision.master, decision.child);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }
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
    this.runSubsumptionPass();

    const active = [], scripts = [], ghosts = [];
    this.detectedApps.forEach((app, name) => {
      // Final sanity check: if standalone app name is generic, do not output as an app
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (GENERIC_BLOCK_NAMES.has(cleanName) || GENERIC_BLOCK_NAMES.has(name.toLowerCase())) {
        return;
      }

      const methods = app.methods.map(m => m.method);
      const components = Array.from(app.components || []).filter(c => c && c.toLowerCase() !== name.toLowerCase());

      const res = {
        name,
        slug: app.appData?.slug || null,
        category: app.appData?.category || 'Ecommerce',
        methods,
        components,
        alternative: this.getAlternative(name)
      };
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
