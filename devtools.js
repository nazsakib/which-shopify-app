chrome.devtools.network.onRequestFinished.addListener((request) => {
  const url = request.request.url;
  
  // Exclude simple data URIs to reduce overhead
  if (url.startsWith('data:')) return;

  chrome.tabs.sendMessage(chrome.devtools.inspectedWindow.tabId, {
    type: 'NETWORK_REQUEST',
    url: url
  }).catch(() => {
    // Content script might not be loaded yet, ignore safely
  });
});
