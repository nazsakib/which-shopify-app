// This script runs in the MAIN world to access window variables safely
(function() {
  const knownGlobals = [
    "$crisp", "ABTasty", "AWeber", "ActiveCampaign", "Adyen", "AfterShip", "Afterpay", "AgeVerify", 
    "AmastyReward", "AppMySite", "Attentive", "Autocrat", "BarillianceRecs", "Beeketing", "BetterSearch", 
    "Bold", "BoldSubscriptions", "CE2", "CRISP_WEBSITE_ID", "CTCT", "CampaignMonitor", "Channel", 
    "Chatra", "Civic", "CookieBot", "Crisp", "CrowdControl", "Cybersource", "CybotCookiebot", "DY", 
    "DataDome", "DocParser", "Drip", "DynaPictures", "EDD", "EasyShip", "Elfsight", "FS", "FetchApp", 
    "FirstData", "Fomo", "Freshchat", "Freshdesk", "FullStory", "GemPages", "GetResponse", "Glew", 
    "GlobalE", "Gooten", "Gorgias", "Gumroad", "HealCode", "Icegram", "InkThreadable", "Intercom", 
    "InviteReferrals", "JudgeMe", "Junip", "Kamo", "Klarna", "Klaviyo", "KlaviyoSMS", "Koko", 
    "Kustomer", "LC_2", "LangShop", "Laybuy", "LimeSpot", "Littledata", "Loop", "LoopReturns", 
    "Loox", "LoyaltyLion", "LuckyOrange", "MailChimp", "MailMunch", "Make", "ManyChat", "Marqeta", 
    "Metorik", "Mobiloud", "Mouseflow", "NEX", "NaviPlus", "NostoAuto", "Okendo", "Olark", "OneTrust", 
    "OnetrustActiveGroups", "OptinMonster", "OrderDesk", "OrderPrinter", "POWr", "Packlink", "PageFly", 
    "Perfalytics", "PerimeterX", "Perzonalization", "PlobalApps", "Polar", "PostAffiliatePro", "Postscript", 
    "Printful", "Printify", "Privy", "ProductRecs", "Proof", "PushEngage", "PushOwl", "QuadPay", 
    "Quantcast", "Rates", "ReCharge", "ReConvert", "Reamaze", "Recart", "Redbubble", "ReferralCandy", "Returnly", 
    "SMSBump", "SUMO", "SearchIQ", "SearchSpring", "Segmentify", "SendOwl", "SendinBlue", "Sezzle", 
    "ShipStation", "ShipperHQ", "Shippo", "ShopifyApp", "ShopifyFlow", "SimpleTexting", "SkeuRecs", 
    "SkyPortal", "Sleeknote", "SmartEmailing", "Smile", "SnapWidget", "SocialSnow", "StackAnalytics", 
    "Stamped", "Stelace", "Stripe", "Sucuri", "SumoMe", "Taggbox", "TawkAPI", "TeeSpring", "Tidio", 
    "Translate", "Triggmine", "TripleWhale", "TrustArc", "Trustbadge", "TrustedSite", "Twilio", 
    "Upright", "Userlike", "VWO", "Verifone", "Vitals", "VoxPop", "Weglot", "Wisepops", "Wiser", 
    "Workato", "Worldpay", "Yapp", "YoYo", "Yotpo", "YotpoSocial", "Zapier", "Zazzle", "Zip", "Zoho", 
    "_fbq", "_hsq", "_mfq", "affirm", "algolia", "algoliasearch", "amplitude", "analytics", "appBridge", 
    "awin", "barilliance", "braintree", "cj", "clarity", "convert", "customerly", "dataLayer", 
    "datadome", "drift", "driftApp", "dynamicyield", "edd", "fbq", "friendbuy", "google_tag_manager", 
    "gtag", "heap", "hj", "hotjar", "hubspot", "intercomSettings", "jivo", "judgeme", "justuno", 
    "klaviyo", "lintrk", "livechat", "lo", "looxWidget", "mc", "mf", "mixpanel", "monetate", "nosto", 
    "olark", "omHooks", "omnisend", "optimize", "optimizely", "pap", "paypal", "pintrk", "px", 
    "qubit", "rechargeWidget", "reconvert", "reconvertData", "refersion", "reviewsIO", "segment", "sfdc", "shareasale", "sib", 
    "smartlook", "smileIO", "snap_pixel", "squatch", "stripe", "tidio", "trustpilot", "ttq", "twq", 
    "vwo", "yotpo", "zE", "zendeskWebWidget", "zsiq"
  ];

  function extractAndSendGlobals() {
    try {
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

      const activeGlobals = [];
      for (const globalIdentifier of knownGlobals) {
        if (window[globalIdentifier] !== undefined) {
          activeGlobals.push(globalIdentifier);
        }
      }

      window.postMessage({
        type: 'SHOPIFY_APP_GLOBALS',
        globals: activeGlobals,
        shopify: shopifyData
      }, '*');
    } catch (error) {}
  }

  // Initial immediate extraction
  extractAndSendGlobals();

  // Async retries for late-loading third-party widgets (e.g. Crisp, Mouseflow, Hotjar)
  setTimeout(extractAndSendGlobals, 1200);
  setTimeout(extractAndSendGlobals, 2800);

  // Listen for rescan requests from the content script
  window.addEventListener('message', function(event) {
    if (event.source === window && event.data && event.data.type === 'REQUEST_SHOPIFY_GLOBALS') {
      extractAndSendGlobals();
    }
  });
})();
