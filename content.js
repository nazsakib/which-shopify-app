(function() {
  'use strict';

  const detectorEngine = new DetectorEngine();
  let isInitialized = false;

  async function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    try {
      const appsUrl = chrome.runtime.getURL('apps-database.json');
      const response = await fetch(appsUrl);
      const data = await response.json();
      
      await detectorEngine.init(data.apps || []);
      
      setupMessageListener();
      injectGlobalsScript();
      
      const results = await detectorEngine.startFullScan();
      sendResults(results);
      
    } catch (error) {
      console.error('[Shopify App Intelligence] Initialization error:', error);
    }
  }

  function injectGlobalsScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;
      const data = event.data;
      
      // Guard against invalid payloads
      if (!data || typeof data !== "object") return;
      
      if (data.type === 'SHOPIFY_APP_GLOBALS') {
        if (!Array.isArray(data.globals)) data.globals = [];
        detectorEngine.handleGlobals(data.globals, data.shopify);
        sendResults(detectorEngine.getResults());
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') {
        sendResponse({ success: false });
        return false;
      }
      
      if (message.type === 'NETWORK_REQUEST' && message.url) {
        detectorEngine.checkNetwork(message.url);
        sendResults(detectorEngine.getResults());
        sendResponse({ success: true });
        return false;
      }
      
      if (message.type === 'SCAN_REQUEST') {
        detectorEngine.startFullScan().then(results => {
          sendResults(results);
          sendResponse({ success: true, results });
        }).catch(err => {
          sendResponse({ success: false, error: err.toString() });
        });
        return true; // Indicates asynchronous response
      }
      
      sendResponse({ success: false });
      return false;
    });
  }

  function sendResults(results) {
    if (!results || typeof results !== 'object') return;
    
    // Check if we have any findings across all categories safely
    const activeCount = Array.isArray(results.active) ? results.active.length : 0;
    const scriptsCount = Array.isArray(results.scripts) ? results.scripts.length : 0;
    const ghostsCount = Array.isArray(results.ghosts) ? results.ghosts.length : 0;
    
    if (activeCount === 0 && scriptsCount === 0 && ghostsCount === 0) return;
    
    // Check if the content script is orphaned
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
      // Unchecked runtime.lastError fix
      if (chrome.runtime.lastError) {
        // Stop the detector if we can no longer talk to background
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
