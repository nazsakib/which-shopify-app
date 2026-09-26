chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECTION_COMPLETE' || message.type === 'DETECTION_UPDATE') {
    handleDetectionUpdate(message.data, sender.tab).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.toString() });
    });
    return true; 
  }

  if (message.type === 'GET_APP_ICON') {
    handleGetAppIcon(message.slug, message.name).then(icon => {
      sendResponse({ success: true, icon });
    }).catch(err => {
      sendResponse({ success: false, error: err.toString() });
    });
    return true;
  }
  
  sendResponse({ success: false });
  return false;
});

async function handleDetectionUpdate(data, tab) {
  if (!tab || !tab.url) return;
  
  const domain = new URL(tab.url).hostname;
  const storageKey = `results_${tab.id}`;
  const domainKey = `results_${domain}`;

  // Compute differential between previous and current storefront scans
  const previousScanData = await chrome.storage.local.get([domainKey]);
  const previousActiveApps = previousScanData[domainKey]?.results?.active || [];
  const currentActiveApps = data.results?.active || [];

  const addedApps = currentActiveApps.filter(currentApp => 
    !previousActiveApps.some(previousApp => previousApp.name === currentApp.name)
  );
  const removedApps = previousActiveApps.filter(previousApp => 
    !currentActiveApps.some(currentApp => currentApp.name === previousApp.name)
  );

  const resultsToStore = {
    results: data.results,
    storeInfo: data.storeInfo,
    timestamp: data.timestamp,
    changes: { added: addedApps, removed: removedApps }
  };
  
  await chrome.storage.local.set({
    [storageKey]: resultsToStore,
    [domainKey]: resultsToStore 
  });
  
  // Aggregate badge count across all active detection categories
  const activeCount = Array.isArray(data.results?.active) ? data.results.active.length : 0;
  const scriptsCount = Array.isArray(data.results?.scripts) ? data.results.scripts.length : 0;
  const ghostsCount = Array.isArray(data.results?.ghosts) ? data.results.ghosts.length : 0;
  
  const totalFindingsCount = activeCount + scriptsCount + ghostsCount;
  updateBadge(tab, totalFindingsCount);
}

function updateBadge(tab, count) {
  if (!tab || !tab.id) return;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#15C15D', tabId: tab.id });
}

// Auto-scan storefront on page load completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.tabs.sendMessage(tabId, { type: 'SCAN_REQUEST' }).catch(() => {});
  }
});

const KNOWN_SLUG_ALIASES = {
  'boostly': 'boostlycart-cart-drawer-upsell',
  'boostlycart': 'boostlycart-cart-drawer-upsell',
  'cart-drawer-cart-upsell': 'boostlycart-cart-drawer-upsell',
  'cartdrawercartupsell': 'boostlycart-cart-drawer-upsell',
  'infinseo-seo-image-optimizer': 'infinseo',
  'infinseoseoimageoptimizer': 'infinseo',
  'popman': 'popman-popups-social',
  'popmanpopupssocial': 'popman-popups-social',
  'pplr': 'product-personalizer',
  'zepto': 'product-personalizer',
  'zepto-product-personalizer': 'product-personalizer',
  'sign-customizer': 'neon-sign-customizer',
  'lucky-orange': 'lucky-orange',
  'luckyorange': 'lucky-orange',
  'mailchimp': 'mailchimp',
  'perimeterx': 'perimeterx',
  'pinterest-pixel': 'pinterest',
  'pinterestpixel': 'pinterest',
  'pinterest': 'pinterest',
  'post-affiliate-pro': 'post-affiliate-pro',
  'postaffiliatepro': 'post-affiliate-pro',
  'reviews.io': 'reviews-co-uk-product-and-merchant-review-collection',
  'reviews-io': 'reviews-co-uk-product-and-merchant-review-collection',
  'reviewsio': 'reviews-co-uk-product-and-merchant-review-collection',
  'segment': 'segment-com-by-littledata',
  'sendinblue': 'sendinblue-tools',
  'snapchat-pixel': 'snapchat-ads',
  'snapchatpixel': 'snapchat-ads',
  'snapchat': 'snapchat-ads',
  'global-e': 'global-e',
  'globale': 'global-e',
  'google-optimize': 'google-optimize',
  'googleoptimize': 'google-optimize',
  'optimize': 'google-optimize',
  'heap': 'heap',
  'loyaltylion': 'loyaltylion',
  'loyalty-lion': 'loyaltylion',
  'meta-pixel': 'facebook',
  'metapixel': 'facebook',
  'meta': 'facebook',
  'tiktok-pixel': 'tiktok',
  'tiktokpixel': 'tiktok',
  'attentive': 'attentive',
  'attn': 'attentive',
  'attn-tag': 'attentive',
  'attntag': 'attentive',
  'ga4': 'google-analytics-4-ga4',
  'google-analytics-4': 'google-analytics-4-ga4',
  'google-analytics': 'google-analytics-4-ga4',
  'googleanalytics': 'google-analytics-4-ga4',
  'google-tag-manager': 'google-tag-manager-installer',
  'googletagmanager': 'google-tag-manager-installer',
  'gtm': 'google-tag-manager-installer',
  'klaviyo-sms': 'klaviyo-email-marketing',
  'klaviyosms': 'klaviyo-email-marketing',
  'stamped': 'product-reviews-addon',
  'stamped.io': 'product-reviews-addon',
  'stamped-io': 'product-reviews-addon',
  'stampedio': 'product-reviews-addon'
};

const STATIC_APP_ICONS = {
  'perimeterx': 'https://storage.googleapis.com/perimeterx-logos/primary_logo_red_cropped.png',
  'post-affiliate-pro': 'https://images.postaffiliatepro.com/images/logo.svg',
  'postaffiliatepro': 'https://images.postaffiliatepro.com/images/logo.svg',
  'global-e': 'https://www.global-e.com/wp-content/uploads/2018/06/cropped-globale-favicon-192x192.png',
  'globale': 'https://www.global-e.com/wp-content/uploads/2018/06/cropped-globale-favicon-192x192.png',
  'google-optimize': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Google_Marketing_Platform_logo.svg',
  'googleoptimize': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Google_Marketing_Platform_logo.svg',
  'optimize': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Google_Marketing_Platform_logo.svg',
  'heap': 'https://www.heap.io/favicon/apple-touch-icon.png',
  'ga4': 'https://upload.wikimedia.org/wikipedia/commons/7/77/GAnalytics.svg',
  'google-analytics-4-ga4': 'https://upload.wikimedia.org/wikipedia/commons/7/77/GAnalytics.svg'
};

// Dynamic On-Demand App Icon Resolver & Storage Cache
async function handleGetAppIcon(slug, name) {
  if (!slug && !name) return null;
  const rawTarget = (slug || name).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (!rawTarget) return null;
  const target = KNOWN_SLUG_ALIASES[rawTarget] || rawTarget;

  // Static icon fast path
  if (STATIC_APP_ICONS[target]) {
    return STATIC_APP_ICONS[target];
  }

  const cacheKey = `app_icon_${target}`;

  // 1. Check Chrome Storage local cache
  try {
    const cached = await chrome.storage.local.get([cacheKey]);
    if (cached && cached[cacheKey]) {
      return cached[cacheKey];
    }
  } catch (e) {}

  // 2. Fetch from Shopify App Store listing
  try {
    const res = await fetch(`https://apps.shopify.com/${encodeURIComponent(target)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/data-icon-url="([^"]+)"/) || html.match(/data-app-card-icon-url-value="([^"]+)"/);
    if (match && match[1]) {
      const iconUrl = match[1];
      await chrome.storage.local.set({ [cacheKey]: iconUrl });
      return iconUrl;
    }
  } catch (e) {}

  return null;
}

