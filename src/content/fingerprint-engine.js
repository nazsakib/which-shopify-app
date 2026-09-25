class FingerprintEngine {
  constructor(apps) {
    this.apps = Array.isArray(apps) ? apps : [];
    this.shopifyCDNPatterns = [
      /cdn\.shopify\.com\/s\/files\/.*\/apps\//,
      /cdn\.shopify\.com\/s\/files\/.*\/scripts\//,
      /shopifycloud\.com\/apps\//
    ];
  }

  match(url) {
    const results = [];
    if (!url || typeof url !== 'string') return results;

    const urlLower = url.toLowerCase();
    
    this.apps.forEach(app => {
      if (!app) return;
      if (this.checkCDNFingerprint(app, urlLower)) {
        results.push({ app: app.name, type: 'cdn' });
      }
      
      if (this.checkProxyPath(app, urlLower)) {
        results.push({ app: app.name, type: 'proxy' });
      }
      
      if (this.checkWebhookPattern(app, urlLower)) {
        results.push({ app: app.name, type: 'webhook' });
      }
    });

    return results;
  }

  checkCDNFingerprint(app, urlLower) {
    if (Array.isArray(app.cdn_fingerprints)) {
      for (const fingerprint of app.cdn_fingerprints) {
        if (!fingerprint) continue;
        const fpLower = fingerprint.toLowerCase();
        if (fpLower.length <= 3) {
          if (urlLower.includes('/' + fpLower + '/') || urlLower.endsWith('/' + fpLower) || urlLower.includes('.' + fpLower + '.')) {
            return true;
          }
        } else if (urlLower.includes(fpLower)) {
          return true;
        }
      }
    }

    for (const pattern of this.shopifyCDNPatterns) {
      if (pattern.test(urlLower)) {
        const pathMatch = urlLower.match(/\/apps\/([^\/]+)/);
        if (pathMatch && Array.isArray(app.cdn_fingerprints) && app.cdn_fingerprints.some(fp => fp && urlLower.includes(fp.toLowerCase()))) {
          return true;
        }
      }
    }

    return false;
  }

  checkProxyPath(app, urlLower) {
    if (Array.isArray(app.proxy_paths)) {
      for (const path of app.proxy_paths) {
        if (path && urlLower.includes(path.toLowerCase())) {
          return true;
        }
      }
    }
    
    if (urlLower.includes('/apps/') || urlLower.includes('/a/') || urlLower.includes('/tools/')) {
      if (app.name) {
        const appNameLower = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (appNameLower.length > 3 && urlLower.includes(appNameLower)) {
          return true;
        }
      }
    }
    
    return false;
  }

  checkWebhookPattern(app, urlLower) {
    if (Array.isArray(app.webhook_patterns)) {
      for (const pattern of app.webhook_patterns) {
        if (pattern && urlLower.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
    if (urlLower.includes('webhooks/') || urlLower.includes('webhook/')) {
      if (app.name) {
        const appNameLower = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (appNameLower.length > 3 && urlLower.includes(appNameLower)) {
          return true;
        }
      }
    }
    
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FingerprintEngine };
}
