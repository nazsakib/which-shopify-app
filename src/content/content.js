(function() {
  'use strict';

  const detectorEngine = new DetectorEngine();
  let isInitialized = false;

  async function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    try {
      let data = { apps: [] };
      try {
        const appsUrl = chrome.runtime.getURL('src/data/apps-database.json');
        const response = await fetch(appsUrl);
        if (response.ok) {
          data = await response.json();
        }
      } catch (e) {
        try {
          const sampleUrl = chrome.runtime.getURL('src/data/apps-database.sample.json');
          const sampleRes = await fetch(sampleUrl);
          if (sampleRes.ok) data = await sampleRes.json();
        } catch (err) {}
      }
      
      await detectorEngine.init(data.apps || []); 
      
      setupMessageListener();
      injectGlobalsScript();
      
      const results = await detectorEngine.startFullScan();
      sendResults(results);
      
    } catch (error) {
      console.error('[Which Shopify App] Initialization error:', error);
    }
  }

  function injectGlobalsScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/injected.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;
      const data = event.data;
      
      if (!data || typeof data !== "object") return;
      
      if (data.type === 'SHOPIFY_APP_GLOBALS') {
        if (!Array.isArray(data.globals)) data.globals = [];
        detectorEngine.handleGlobals(data.globals, data.shopify);
        sendResults(detectorEngine.getResults());
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') {
        if (sendResponse) sendResponse({ success: false });
        return false;
      }
      
      if (message.type === 'NETWORK_REQUEST' && message.url) {
        detectorEngine.checkNetwork(message.url);
        sendResults(detectorEngine.getResults());
        if (sendResponse) sendResponse({ success: true });
        return false;
      }
      
      if (message.type === 'SCAN_REQUEST') {
        detectorEngine.startFullScan().then(results => {
          sendResults(results);
          if (sendResponse) sendResponse({ success: true, results });
        }).catch(err => {
          if (sendResponse) sendResponse({ success: false, error: err.toString() });
        });
        return true; 
      }
      
      if (sendResponse) sendResponse({ success: false });
      return false;
    });
  }

  function sendResults(results) {
    if (!results || typeof results !== 'object') return;
    
    const activeCount = Array.isArray(results.active) ? results.active.length : 0;
    const scriptsCount = Array.isArray(results.scripts) ? results.scripts.length : 0;
    const ghostsCount = Array.isArray(results.ghosts) ? results.ghosts.length : 0;
    
    if (activeCount === 0 && scriptsCount === 0 && ghostsCount === 0) return;
    if (!chrome.runtime?.id) return;
    
    chrome.runtime.sendMessage({
      type: 'DETECTION_UPDATE',
      data: {
        results,
        storeInfo: detectorEngine.getStoreInfo(),
        timestamp: new Date().toISOString(),
        performanceWarning: detectorEngine.getPerformanceWarning(results)
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        detectorEngine.reset();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
