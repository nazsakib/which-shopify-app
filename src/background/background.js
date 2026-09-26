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

  // Spy Feature: Get previous data to find changes
  const prevData = await chrome.storage.local.get([domainKey]);
  const prevResults = prevData[domainKey]?.results?.active || [];
  const currentResults = data.results?.active || [];

  const added = currentResults.filter(c => !prevResults.some(p => p.name === c.name));
  const removed = prevResults.filter(p => !currentResults.some(c => c.name === p.name));

  const resultsToStore = {
    results: data.results,
    storeInfo: data.storeInfo,
    timestamp: data.timestamp,
    changes: { added, removed }
  };
  
  await chrome.storage.local.set({
    [storageKey]: resultsToStore,
    [domainKey]: resultsToStore 
  });
  
  // Fix: Show TOTAL number of unique findings across all categories
  const activeCount = Array.isArray(data.results?.active) ? data.results.active.length : 0;
  const scriptsCount = Array.isArray(data.results?.scripts) ? data.results.scripts.length : 0;
  const ghostsCount = Array.isArray(data.results?.ghosts) ? data.results.ghosts.length : 0;
  
  const totalCount = activeCount + scriptsCount + ghostsCount;
  updateBadge(tab, totalCount);
}

function updateBadge(tab, count) {
  if (!tab || !tab.id) return;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#15C15D', tabId: tab.id });
}

// AUTO-SCAN ON REFRESH
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
  'sign-customizer': 'neon-sign-customizer'
};

// Dynamic On-Demand App Icon Resolver & Storage Cache
async function handleGetAppIcon(slug, name) {
  if (!slug && !name) return null;
  const rawTarget = (slug || name).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (!rawTarget) return null;
  const target = KNOWN_SLUG_ALIASES[rawTarget] || rawTarget;
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

