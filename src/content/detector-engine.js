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
  'boostly': 'Boostly',
  'boostlycart': 'Boostly',
  'boostlycart-cart-drawer-upsell': 'Boostly',
  'boostlycartcartdrawerupsell': 'Boostly',
  'tinyseo': 'Tiny: SEO Image Optimizer',
  'infinseo': 'InfinSEO',
  'infinseo-seo-image-optimizer': 'InfinSEO',
  'infinseoseoimageoptimizer': 'InfinSEO',
  'avada': 'Avada',
  'popman': 'Popman',
  'popman-popups-social': 'Popman',
  'popmanpopupssocial': 'Popman',
  'blockify-fraud-filter': 'Blockify Fraud Filter',
  'seoant': 'SEO Ant',
  'sign-customizer': 'Neon Sign Customizer',
  'signcustomizer': 'Neon Sign Customizer',
  'neon-sign-customizer': 'Neon Sign Customizer',
  'neonsigncustomizer': 'Neon Sign Customizer',
  'attentive': 'Attentive',
  'attn': 'Attentive',
  'attn-tag': 'Attentive',
  'attntag': 'Attentive'
};

const GENERIC_PLATFORM_DOMAINS = new Set([
  'shopify.com', 'myshopify.com', 'shopifycdn.net', 'shopifycloud.com', 'shopifysvc.com'
]);

const DEFAULT_APP_ALTERNATIVES = {
  'Yotpo': { name: 'Judge.me', reason: 'Faster & lower cost' },
  'Loox': { name: 'Okendo', reason: 'Better for high-volume stores' },
  'Klaviyo': { name: 'Omnisend', reason: 'Simplified automation workflow' },
  'PageFly': { name: 'Instant Page', reason: 'Modern OS 2.0 optimized' },
  'Privy': { name: 'Seguno', reason: 'Native Shopify experience' },
  'Zendesk': { name: 'Gorgias', reason: 'Shopify-first helpdesk' }
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
    this.buildIndexes();
    this.fingerprintEngine = new FingerprintEngine(this.apps);
    this.mutationDetector = new MutationDetector(this.apps);
    // Instant initial check
    this.isShopify = this.detectIfShopify();
  }

  buildIndexes() {
    this.appsWithDomains = [];
    this.appsWithGlobals = [];
    this.appsWithDom = [];
    this.appsWithProxy = [];
    this.appsWithWebhooks = [];
    this.scriptIndex = new Map();

    const apps = this.apps || [];
    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      if (!app) continue;

      if (Array.isArray(app.domains) && app.domains.length > 0) {
        this.appsWithDomains.push(app);
      }
      if (Array.isArray(app.globals) && app.globals.length > 0) {
        this.appsWithGlobals.push(app);
      }
      if (Array.isArray(app.dom) && app.dom.length > 0) {
        this.appsWithDom.push(app);
      }
      if (Array.isArray(app.proxy_paths) && app.proxy_paths.length > 0) {
        this.appsWithProxy.push(app);
      }
      if (Array.isArray(app.webhook_patterns) && app.webhook_patterns.length > 0) {
        this.appsWithWebhooks.push(app);
      }
      if (Array.isArray(app.scripts)) {
        for (let j = 0; j < app.scripts.length; j++) {
          const scriptPattern = app.scripts[j];
          if (scriptPattern) {
            const scriptPatternLower = scriptPattern.toLowerCase();
            if (!this.scriptIndex.has(scriptPatternLower)) {
              this.scriptIndex.set(scriptPatternLower, []);
            }
            this.scriptIndex.get(scriptPatternLower).push(app);
          }
        }
      }
    }
  }

  reset() {
    this.detectedApps.clear();
    this.pendingComponents = [];
    this.isScanning = false;
    this.hasScanned = false;
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
          this.hasScanned = true;
          resolve(this.getResults());
        });
        
        setTimeout(() => {
          this.isScanning = false;
          this.hasScanned = true;
          resolve(this.getResults());
        }, 450);
      } catch (err) {
        this.isScanning = false;
        this.hasScanned = true;
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

  findAppInDatabase(handle) {
    if (!handle || typeof handle !== 'string') return null;
    const clean = handle.toLowerCase().replace(/[0-9]/g, '').replace(/-app$/, '').replace(/[^a-z-_]/g, '').replace(/[-_]+$/, '').trim();
    if (clean.length < 3) return null;

    // 1. Exact slug match
    const foundBySlug = this.apps.find(app => app && app.slug && app.slug.toLowerCase() === clean);
    if (foundBySlug) return foundBySlug;

    // 2. Exact normalized name match
    const norm = clean.replace(/[-_.]/g, '');
    const foundByNorm = this.apps.find(app => {
      if (!app || !app.name) return false;
      return app.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm;
    });
    if (foundByNorm) return foundByNorm;

    // 3. Domain match
    const foundByDomain = this.apps.find(app => {
      if (!app || !Array.isArray(app.domains)) return false;
      return app.domains.some(domain => domain && domain.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
    });
    if (foundByDomain) return foundByDomain;

    // 4. Prefix match if separated by hyphen (e.g. "pagefly-section")
    if (clean.includes('-')) {
      const prefix = clean.split('-')[0];
      if (prefix.length >= 4) {
        const foundByPrefix = this.apps.find(app => app && app.slug && app.slug.toLowerCase() === prefix);
        if (foundByPrefix) return foundByPrefix;
      }
    }

    // 5. Suffix match if separated by hyphen (e.g. "sign-customizer" matching "neon-sign-customizer")
    if (clean.includes('-') && clean.length >= 6) {
      const foundBySuffix = this.apps.find(app => app && app.slug && app.slug.toLowerCase().endsWith('-' + clean));
      if (foundBySuffix) return foundBySuffix;
    }

    return null;
  }

  isGeneratedHash(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length < 3) return false;
    // 5+ consecutive consonants (e.g. "atdhxcmyotfusdhc", "atkzjzsynvozhvwu", "bbkavz")
    if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(clean)) return true;
    // Length >= 8 with no vowels
    if (clean.length >= 8 && !/[aeiouy]/.test(clean)) return true;
    // Extremely low vowel ratio on long random hashes (length >= 12 and vowel ratio < 0.2)
    if (clean.length >= 12) {
      const vowels = (clean.match(/[aeiouy]/g) || []).length;
      if (vowels / clean.length < 0.2) return true;
    }
    return false;
  }

  isGibberish(str) {
    return this.isGeneratedHash(str);
  }

  isThemeOrPlatformAsset(url = '', name = '') {
    // Theme App Extensions are 3rd-party apps, NEVER theme or platform assets
    if (url && typeof url === 'string' && url.includes('cdn.shopify.com/extensions/')) {
      return false;
    }

    const str = ((url || '') + ' ' + (name || '')).toLowerCase();
    
    // Shopify theme assets directory (standard & modern CDN paths)
    if ((str.includes('/s/files/') || str.includes('/cdn/shop/t/')) && str.includes('/assets/')) return true;
    if (str.includes('/assets/base.') || str.includes('/assets/global.') || str.includes('/assets/cart.')) return true;
    if (str.includes('/assets/constants.') || str.includes('/assets/theme.')) return true;

    // Shopify core internal platform scripts
    if (str.includes('shopify-perf-kit') ||
        str.includes('shop_events_listener') ||
        str.includes('origin_trials') ||
        str.includes('load_feature') ||
        str.includes('webmcp') ||
        str.includes('remote_product_tracking') ||
        str.includes('portable-wallets') ||
        str.includes('accelerated-checkout') ||
        str.includes('shopifycloud') ||
        str.includes('storefront') ||
        str.includes('shop-js') ||
        str.includes('loader.init-shop-cart-sync')) {
      return true;
    }

    const filename = this.extractComponentName(url || name).toLowerCase();
    const coreFilenames = new Set([
      'base.css', 'global.js', 'constants.js', 'cart.js', 'pubsub.js', 'scripts.js',
      'search-form.js', 'details-disclosure.js', 'details-modal.js', 'cart-notification.js',
      'cart-drawer.js', 'product-info.js', 'product-form.js', 'pickup-availability.js',
      'product-modal.js', 'media-gallery.js', 'selling-plans.js', 'predictive-search.js',
      'localization-form.js', 'theme.js', 'theme.css', 'storefront.js', 'storefront',
      'shopify-pay.js', 'shop.js', 'shop'
    ]);

    if (coreFilenames.has(filename)) return true;
    if (filename.startsWith('component-') || filename.startsWith('section-')) return true;

    return false;
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

  extractAppFromOS2Block(str) {
    if (!str || typeof str !== 'string') return;
    const clean = str.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const tokens = clean.split(/[_-]+/).filter(Boolean);
    if (tokens.length === 0) return;

    let matchedApp = '';
    let matchedTokensCount = 0;

    for (let len = Math.min(tokens.length, 5); len >= 1; len--) {
      const candidateHyphen = tokens.slice(0, len).join('-');
      const candidateNorm = tokens.slice(0, len).join('');
      
      const can = this.resolveCanonicalName(candidateHyphen) || this.resolveCanonicalName(candidateNorm);
      if (can) {
        matchedApp = can;
        matchedTokensCount = len;
        break;
      }

      const dbApp = this.findAppInDatabase(candidateHyphen) || this.findAppInDatabase(candidateNorm);
      if (dbApp) {
        matchedApp = dbApp.name;
        matchedTokensCount = len;
        break;
      }
    }

    if (matchedApp) {
      this.recordDetection(matchedApp, 'App Block', 0.95);
      if (tokens.length > matchedTokensCount) {
        const remaining = tokens.slice(matchedTokensCount).filter(token => token.length > 2 && !this.isGeneratedHash(token)).join('-');
        if (remaining && !GENERIC_BLOCK_NAMES.has(remaining) && !this.isThemeOrPlatformAsset('', remaining)) {
          const app = this.detectedApps.get(matchedApp);
          if (app) {
            if (!app.components) app.components = new Set();
            app.components.add(remaining);
          }
        }
      }
      this.runSubsumptionPass();
    }
  }

  attachPendingComponent(pending) {
    if (!pending) return false;
    if (this.isThemeOrPlatformAsset(pending.url, pending.handle)) return false;

    const urlLower = (pending.url || '').toLowerCase();
    const pendingExtId = this.extractExtensionId(pending.url);
    const normHandle = (pending.handle || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const [appName, app] of this.detectedApps) {
      const normApp = appName.toLowerCase().replace(/[^a-z0-9]/g, '');

      let matches = false;
      if (pendingExtId && app.extensionIds && app.extensionIds.has(pendingExtId)) {
        matches = true;
      } else if (pending.parentHandle) {
        const canParent = this.resolveCanonicalName(pending.parentHandle);
        if (canParent === appName || appName.toLowerCase().includes(pending.parentHandle.toLowerCase())) {
          matches = true;
        }
      } else if (normApp.includes('zepto') && (urlLower.includes('zepto') || urlLower.includes('pplr') || normHandle.includes('pplr') || normHandle.includes('zepto') || normHandle.includes('personalizer'))) {
        matches = true;
      } else if (app.appData && Array.isArray(app.appData.domains)) {
        if (app.appData.domains.some(domain => domain && !GENERIC_PLATFORM_DOMAINS.has(domain.toLowerCase()) && urlLower.includes(domain.toLowerCase()))) {
          matches = true;
        }
      }

      if (matches) {
        if (!app.components) app.components = new Set();
        if (pending.handle && !GENERIC_BLOCK_NAMES.has(pending.handle.toLowerCase()) && !this.isGeneratedHash(pending.handle)) {
          app.components.add(pending.handle);
        }
        if (pending.url) {
          const comp = this.extractComponentName(pending.url);
          if (comp && !this.isThemeOrPlatformAsset(comp) && !this.isGeneratedHash(comp)) {
            app.components.add(comp);
          }
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

    // Discard generated hashes or anomalous strings
    if (this.isGeneratedHash(cleanHandle)) return;

    // Never process theme or platform assets
    if (this.isThemeOrPlatformAsset(url, cleanHandle)) return;

    const normalized = cleanHandle.replace(/[-_.]/g, '');

    // Discard or defer generic platform handles as child components
    if (GENERIC_BLOCK_NAMES.has(cleanHandle) || GENERIC_BLOCK_NAMES.has(normalized)) {
      if (!this.isThemeOrPlatformAsset(url, cleanHandle)) {
        const pendingItem = { handle: cleanHandle, method, url };
        this.pendingComponents.push(pendingItem);
        this.attachPendingComponent(pendingItem);
      }
      return;
    }

    // Resolve vendor alias to canonical application name
    let finalName = this.resolveCanonicalName(cleanHandle);

    if (!finalName) {
      const found = this.findAppInDatabase(cleanHandle);
      if (found) finalName = found.name;
    }

    // Require a verified database match or registered canonical alias before recording
    if (!finalName) {
      return;
    }

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
      // In Shopify OS 2.0, app blocks use "shopify-block-<theme_id>__<app_handle>_<block_handle>"
      // Native theme blocks DO NOT have "__" (e.g. shopify-block-atdhxcmyotfusdhc)
      const elements = document.querySelectorAll('[data-shopify-app-block], [class*="shopify-app-block"], script[data-app-id], script[data-handle], [id*="shopify-block-"]');
      elements.forEach(el => {
        const blockId = el.id || '';
        if (blockId.startsWith('shopify-block-')) {
          if (blockId.includes('__')) {
            const afterDouble = blockId.split('__')[1] || '';
            if (afterDouble) this.extractAppFromOS2Block(afterDouble);
          }
          // Skip native theme blocks lacking double underscore separator
          return;
        }

        const appId = el.getAttribute('data-app-id') || el.getAttribute('data-handle') || el.getAttribute('data-shopify-app-block') || '';
        if (appId) {
          this.processExtractedHandle(appId, 'App Block');
        }
      });
    } catch (e) {}

    try {
      const assets = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
      assets.forEach(asset => {
        const url = asset.src || asset.href;
        if (!url || this.isThemeOrPlatformAsset(url)) return;

        const patterns = [
          /\/extensions\/[a-f0-9-]+\/([a-z0-9-_.]+)\//i,
          /\/apps\/([a-z0-9-_.]+)\//i,
          /cdn\.shopify\.com\/s\/files\/.*\/apps\/([a-z0-9-_.]+)/i,
          /cdn-([a-z0-9-]+)\.com/i,
          /([a-z0-9-]+)cdn\.com/i
        ];
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            const method = pattern === patterns[0] ? 'App Block' : 'App CDN';
            this.processExtractedHandle(match[1].split('/')[0], method, url);
            break;
          }
        }
      });
    } catch (e) {}
  }

  checkNetwork(url) {
    if (!url || !this.isShopify) return;
    const urlLower = url.toLowerCase();
    if (!this.appsWithProxy) this.buildIndexes();

    // 1. Fast domain check (only apps with domains, ~308 apps)
    const appsWithDomains = this.appsWithDomains || this.apps;
    for (let i = 0; i < appsWithDomains.length; i++) {
      const app = appsWithDomains[i];
      for (let j = 0; j < app.domains.length; j++) {
        const domain = app.domains[j];
        if (!domain) continue;
        const domainLower = domain.toLowerCase();
        if (GENERIC_PLATFORM_DOMAINS.has(domainLower)) continue;
        if (urlLower.includes(domainLower)) {
          this.recordDetection(app.name, 'network', this.confidenceWeights.network, { url });
          return;
        }
      }
    }

    // 2. Fast proxy paths (apps with proxy)
    const appsWithProxy = this.appsWithProxy || this.apps;
    for (let i = 0; i < appsWithProxy.length; i++) {
      const app = appsWithProxy[i];
      for (let j = 0; j < app.proxy_paths.length; j++) {
        const path = app.proxy_paths[j];
        if (path && urlLower.includes(path.toLowerCase())) {
          this.recordDetection(app.name, 'network', this.confidenceWeights.proxy, { url });
          return;
        }
      }
    }

    // 3. Fast webhook patterns (apps with webhooks)
    const appsWithWebhooks = this.appsWithWebhooks || this.apps;
    for (let i = 0; i < appsWithWebhooks.length; i++) {
      const app = appsWithWebhooks[i];
      for (let j = 0; j < app.webhook_patterns.length; j++) {
        const pattern = app.webhook_patterns[j];
        if (pattern && urlLower.includes(pattern.toLowerCase())) {
          this.recordDetection(app.name, 'network', this.confidenceWeights.webhook, { url });
          return;
        }
      }
    }

    // 4. Fast script filename check via Map O(1)
    const cleanUrl = urlLower.split('?')[0].split('#')[0];
    const filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
    if (filename && this.scriptIndex && this.scriptIndex.has(filename)) {
      const matched = this.scriptIndex.get(filename);
      for (let i = 0; i < matched.length; i++) {
        this.recordDetection(matched[i].name, 'network', this.confidenceWeights.script, { url });
      }
    }
  }

  scanScripts() {
    if (!this.appsWithDomains || !this.scriptIndex) this.buildIndexes();
    const scripts = document.querySelectorAll('script[src]');
    const appsWithDomains = this.appsWithDomains || this.apps;
    const scriptIndex = this.scriptIndex;

    scripts.forEach(script => {
      const src = script.src;
      if (!src) return;
      const urlLower = src.toLowerCase();

      // 1. Fast Domain Matching (only ~308 apps instead of 27,247)
      for (let i = 0; i < appsWithDomains.length; i++) {
        const app = appsWithDomains[i];
        for (let j = 0; j < app.domains.length; j++) {
          const domain = app.domains[j];
          if (!domain) continue;
          const domainLower = domain.toLowerCase();
          if (GENERIC_PLATFORM_DOMAINS.has(domainLower)) continue;
          if (urlLower.includes(domainLower)) {
            this.recordDetection(app.name, 'script', this.confidenceWeights.script, { url: src });
            break;
          }
        }
      }

      // 2. Fast Script Filename Matching (O(1) Map lookup)
      const cleanUrl = urlLower.split('?')[0].split('#')[0];
      const filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
      if (filename && scriptIndex && scriptIndex.has(filename)) {
        const matched = scriptIndex.get(filename);
        for (let i = 0; i < matched.length; i++) {
          this.recordDetection(matched[i].name, 'script', this.confidenceWeights.script, { url: src });
        }
      }
    });
  }

  matchScript(app, url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    if (Array.isArray(app.domains)) {
      for (const domain of app.domains) {
        if (!domain) continue;
        const domainLower = domain.toLowerCase();
        if (GENERIC_PLATFORM_DOMAINS.has(domainLower)) continue;
        if (urlLower.includes(domainLower)) return true;
      }
    }
    if (Array.isArray(app.scripts)) {
      for (const script of app.scripts) {
        if (!script) continue;
        const scriptLower = script.toLowerCase();
        if (urlLower.includes(scriptLower)) return true;
      }
    }
    return false;
  }

  scanInlineScripts() {
    if (!this.appsWithGlobals) this.buildIndexes();
    const scripts = document.querySelectorAll('script:not([src])');
    const appsWithGlobals = this.appsWithGlobals || this.apps;
    scripts.forEach(script => {
      const content = script.textContent;
      if (!content) return;
      for (let i = 0; i < appsWithGlobals.length; i++) {
        const app = appsWithGlobals[i];
        if (app.globals) {
          for (let j = 0; j < app.globals.length; j++) {
            const global = app.globals[j];
            if (content.includes(global)) {
              this.recordDetection(app.name, 'Script Code', 0.85, { variable: global });
            }
          }
        }
      }
    });
  }

  scanDOM() {
    if (!this.appsWithDom) this.buildIndexes();
    const appsWithDom = this.appsWithDom || this.apps;
    for (let i = 0; i < appsWithDom.length; i++) {
      const app = appsWithDom[i];
      if (Array.isArray(app.dom)) {
        for (let j = 0; j < app.dom.length; j++) {
          const selector = app.dom[j];
          try {
            const elements = document.querySelectorAll(selector);
            if (elements && elements.length > 0) {
              this.recordDetection(app.name, 'dom', this.confidenceWeights.dom, { selector, count: elements.length });
            }
          } catch (e) {}
        }
      }
    }
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
      performance.getEntriesByType('resource').forEach(resourceEntry => {
        if (resourceEntry.initiatorType === 'script' || resourceEntry.name.endsWith('.js')) {
          totalBytes += (resourceEntry.encodedBodySize || resourceEntry.transferSize || 0);
        }
      });
      this.scriptWeight = totalBytes;
    } catch (e) {}
  }

  recordDetection(appName, method, baseConfidence, data = {}) {
    if (!appName || this.isGeneratedHash(appName)) return;
    if (!this.detectedApps.has(appName)) {
      let appData = this.apps.find(app => app && app.name && app.name.toLowerCase() === appName.toLowerCase()) || null;
      if (!appData && data.handle) {
        appData = this.findAppInDatabase(data.handle);
      }
      this.detectedApps.set(appName, {
        name: appName,
        methods: [],
        totalScore: 0,
        components: new Set(),
        extensionIds: new Set(),
        appData
      });
    }
    const app = this.detectedApps.get(appName);
    if (!app.components) app.components = new Set();
    if (!app.extensionIds) app.extensionIds = new Set();

    if (data.handle && !GENERIC_BLOCK_NAMES.has(data.handle.toLowerCase()) && !this.isGeneratedHash(data.handle) && !this.isThemeOrPlatformAsset('', data.handle)) {
      app.components.add(data.handle);
    }
    if (data.component && !this.isGeneratedHash(data.component) && !this.isThemeOrPlatformAsset('', data.component)) {
      app.components.add(data.component);
    }
    if (data.url && !this.isThemeOrPlatformAsset(data.url)) {
      const extId = this.extractExtensionId(data.url);
      if (extId) app.extensionIds.add(extId);
      const comp = this.extractComponentName(data.url);
      if (comp && !this.isThemeOrPlatformAsset(comp) && !this.isGeneratedHash(comp)) {
        app.components.add(comp);
      }
    }
    if (data.variable && !this.isThemeOrPlatformAsset('', data.variable)) {
      app.components.add(data.variable);
    }

    if (!app.methods.find(methodEntry => methodEntry.method === method)) {
      app.methods.push({ method, confidence: baseConfidence, data });
      app.totalScore += baseConfidence;
    }
  }

  shouldSubsume(nameA, nameB) {
    if (nameA === nameB) return null;

    const normalizedFirstAppName = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedSecondAppName = nameB.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Canonical alias check
    const canonicalFirstName = this.resolveCanonicalName(normalizedFirstAppName);
    const canonicalSecondName = this.resolveCanonicalName(normalizedSecondAppName);
    if (canonicalFirstName && canonicalFirstName === nameB) return { master: nameB, child: nameA };
    if (canonicalSecondName && canonicalSecondName === nameA) return { master: nameA, child: nameB };

    // Database-backed app priority check
    const appA = this.detectedApps.get(nameA);
    const appB = this.detectedApps.get(nameB);
    const isFirstAppInDatabase = !!(appA && appA.appData);
    const isSecondAppInDatabase = !!(appB && appB.appData);

    // Subphrase check (e.g. "Product Personalizer" inside "Zepto Product Personalizer")
    if (normalizedFirstAppName.length >= 5 && normalizedSecondAppName.length >= 5) {
      if (normalizedSecondAppName.includes(normalizedFirstAppName) && normalizedSecondAppName.length > normalizedFirstAppName.length) {
        if (isFirstAppInDatabase && !isSecondAppInDatabase) return { master: nameA, child: nameB };
        return { master: nameB, child: nameA };
      }
      if (normalizedFirstAppName.includes(normalizedSecondAppName) && normalizedFirstAppName.length > normalizedSecondAppName.length) {
        if (isSecondAppInDatabase && !isFirstAppInDatabase) return { master: nameA, child: nameB };
        return { master: nameA, child: nameB };
      }
    }

    // Brand root with generic suffix check (e.g. "Zepto Common" vs "Zepto Product Personalizer")
    const firstAppTokens = nameA.toLowerCase().split(/[\s-_]+/);
    const secondAppTokens = nameB.toLowerCase().split(/[\s-_]+/);
    const genericSuffixes = new Set([
      'common', 'core', 'embed', 'runtime', 'main', 'loader', 'widget',
      'helper', 'script', 'base', 'sdk', 'bundle', 'api', 'tools', 'app'
    ]);

    if (firstAppTokens.length >= 2 && secondAppTokens.length >= 2 && firstAppTokens[0] === secondAppTokens[0]) {
      const hasGenericSuffixFirst = firstAppTokens.slice(1).every(token => genericSuffixes.has(token));
      const hasGenericSuffixSecond = secondAppTokens.slice(1).every(token => genericSuffixes.has(token));
      if (hasGenericSuffixFirst && !hasGenericSuffixSecond) {
        return { master: nameB, child: nameA };
      }
      if (hasGenericSuffixSecond && !hasGenericSuffixFirst) {
        return { master: nameA, child: nameB };
      }
    }

    // Generic name check
    if (GENERIC_BLOCK_NAMES.has(normalizedFirstAppName) && !GENERIC_BLOCK_NAMES.has(normalizedSecondAppName)) {
      return { master: nameB, child: nameA };
    }
    if (GENERIC_BLOCK_NAMES.has(normalizedSecondAppName) && !GENERIC_BLOCK_NAMES.has(normalizedFirstAppName)) {
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

    // Move child's name into components of master
    if (childName !== masterName) {
      masterApp.components.add(childName);
    }

    // Transfer child's components into master
    childApp.components.forEach(componentName => masterApp.components.add(componentName));

    // Transfer detection methods and confidence scores
    for (const methodEntry of childApp.methods) {
      if (!masterApp.methods.some(existing => existing.method === methodEntry.method)) {
        masterApp.methods.push(methodEntry);
      }
      if (methodEntry.data?.handle) masterApp.components.add(methodEntry.data.handle);
      if (methodEntry.data?.url) {
        const comp = this.extractComponentName(methodEntry.data.url);
        if (comp) masterApp.components.add(comp);
        const extId = this.extractExtensionId(methodEntry.data.url);
        if (extId) {
          if (!masterApp.extensionIds) masterApp.extensionIds = new Set();
          masterApp.extensionIds.add(extId);
        }
      }
    }
    masterApp.totalScore = Math.max(masterApp.totalScore, childApp.totalScore) + 0.1;

    // Inherit metadata if master is missing it
    if (!masterApp.appData && childApp.appData) {
      masterApp.appData = childApp.appData;
    }

    // Remove child entry from detected applications
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
      // Filter out anomalous hashes or reserved platform names
      if (this.isGeneratedHash(name)) return;
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (GENERIC_BLOCK_NAMES.has(cleanName) || GENERIC_BLOCK_NAMES.has(name.toLowerCase())) {
        return;
      }

      // Require a verified database match or registered canonical alias before recording
      const isVerified = (app.appData && app.appData.name) || this.resolveCanonicalName(cleanName) || this.resolveCanonicalName(name);
      if (!isVerified) {
        return;
      }

      const methods = app.methods.map(methodEntry => methodEntry.method);
      const components = Array.from(app.components || []).filter(componentName => {
        if (!componentName) return false;
        const componentLower = componentName.toLowerCase().trim();
        if (componentLower === name.toLowerCase()) return false;
        if (this.isGeneratedHash(componentLower)) return false;
        if (this.isThemeOrPlatformAsset('', componentLower)) return false;
        if (GENERIC_BLOCK_NAMES.has(componentLower) || GENERIC_BLOCK_NAMES.has(componentLower.replace(/[-_]/g, ''))) return false;
        // Filter out redundant name variations that match the app name
        const normalizedComponent = componentLower.replace(/[^a-z0-9]/g, '');
        const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedComponent === normName || normName === 'zepto' + normalizedComponent || normName === normalizedComponent + 'zepto') return false;
        return true;
      }).map(componentName => {
        // Strip trailing random Shopify block template instance hashes like "-vyhp"
        return componentName.replace(/[-_][a-z0-9]{4,6}$/i, '');
      }).filter((componentName, index, componentsList) => componentsList.indexOf(componentName) === index);

      const dbApp = app.appData || this.findAppInDatabase(name) || this.apps.find(appEntry => appEntry && appEntry.name && appEntry.name.toLowerCase() === name.toLowerCase());
      const res = {
        name,
        slug: dbApp?.slug || null,
        icon: dbApp?.icon || null,
        category: dbApp?.category || 'Ecommerce',
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
    const activeApps = active.sort((firstApp, secondApp) => firstApp.name.localeCompare(secondApp.name));
    const names = activeApps.map(app => app.name.toLowerCase());
    let stack = "Standard Stack";
    if (names.includes('klaviyo') && (names.includes('loox') || names.includes('judgeme'))) stack = "High-Conversion Stack";
    if (names.includes('recharge') || names.includes('bold')) stack = "Subscription Stack";
    return {
      active: activeApps,
      scripts: scripts.sort((firstApp, secondApp) => firstApp.name.localeCompare(secondApp.name)),
      ghosts: ghosts.sort((firstApp, secondApp) => firstApp.name.localeCompare(secondApp.name)),
      growthStack: stack,
      isShopify: this.isShopify
    };
  }

  getAlternative(appName) {
    return DEFAULT_APP_ALTERNATIVES[appName] || null;
  }

  getStoreInfo() {
    return { domain: window.location.hostname, url: window.location.href, timestamp: new Date().toISOString(), theme: this.themeInfo.name, shop: this.shopDomain, isShopify: this.isShopify, scriptWeight: this.scriptWeight };
  }

  /**
   * Evaluates storefront script weight and returns performance advisory warnings.
   * @param {Object} results
   * @returns {Object|null}
   */
  getPerformanceWarning(results) {
    if (this.scriptWeight > 2500000) {
      return {
        level: 'warning',
        message: `High script payload detected (${Math.round(this.scriptWeight / 1024)} KB). Consider auditing unused app scripts.`
      };
    }
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DetectorEngine };
}
