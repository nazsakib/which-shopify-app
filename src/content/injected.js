// This script runs in the MAIN world to access window variables safely
(function() {
  try {
    // 1. Manually extract only primitive values from window.Shopify to prevent DataCloneError
    const shopifyData = {
      theme: null,
      shop: ""
    };

    if (window.Shopify && typeof window.Shopify === 'object') {
      if (window.Shopify.theme && typeof window.Shopify.theme === 'object') {
        shopifyData.theme = {
          name: String(window.Shopify.theme.name || "Unknown"),
          id: String(window.Shopify.theme.id || "")
        };
      }
      if (window.Shopify.shop) {
        shopifyData.shop = String(window.Shopify.shop);
      }
    }

    // 2. Selectively pick known global variables to avoid massive payloads and performance issues
    // Checking all keys can be slow and cause clones of unexpected proxies.
    const knownGlobals = [
      "klaviyo", "judgeme", "ReChargeWidget", "smile", "ShopifyApp", "appBridge", 
      "yotpo", "AfterShip", "Privy", "tidio", "Crisp", "zE", "zendeskWebWidget",
      "TawkAPI", "hotjar", "hj", "dataLayer", "google_tag_manager", "fbq", "_fbq",
      "ttq", "PageFly", "GemPages", "Bold", "BoldSubscriptions", "Gorgias", 
      "PushOwl", "omnisend", "MailChimp", "mc", "Kustomer", "Intercom", 
      "intercomSettings", "Freshdesk", "Recart", "ManyChat", "snap_pixel", 
      "pintrk", "twq", "lintrk", "analytics", "segment", "FS", "FullStory", 
      "clarity", "amplitude", "mixpanel", "heap", "gtag", "CE2", "LuckyOrange",
      "lo", "smartlook", "Mouseflow", "mf", "_hsq", "hubspot", "sfdc", "zsiq",
      "Zoho", "trustpilot", "Okendo", "looxWidget", "Loox", "JudgeMe"
    ];

    // Extract known global app handles without deep proxy traversal
    const activeGlobals = [];
    for (const globalIdentifier of knownGlobals) {
      if (window[globalIdentifier] !== undefined) {
        activeGlobals.push(globalIdentifier);
      }
    }

    // Construct a sanitized payload containing only primitives and string arrays
    const sanitizedPayload = {
      type: 'SHOPIFY_APP_GLOBALS',
      globals: activeGlobals,
      shopify: shopifyData
    };

    // Safely dispatch to content script
    window.postMessage(sanitizedPayload, '*');
  } catch (error) {
    // Suppress errors to avoid interfering with storefront execution
  }
})();
