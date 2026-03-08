chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECTION_COMPLETE' || message.type === 'DETECTION_UPDATE') {
    handleDetectionUpdate(message.data, sender.tab).then(() => {
      sendResponse({ success: true });
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
  
  const resultsToStore = {
    results: data.results,
    storeInfo: data.storeInfo,
    timestamp: data.timestamp
  };
  
  await chrome.storage.local.set({
    [`results_${tab.id}`]: resultsToStore,
    [`results_${domain}`]: resultsToStore 
  });
  
  const activeCount = (data.results && data.results.active) ? data.results.active.length : 0;
  updateBadge(tab, activeCount);
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
