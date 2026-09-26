/**
 * Test Suite: Shopify App Detector Engine Deduplication & Component Aggregation
 *
 * Verifies:
 * 1. Blacklist generic block and script handles ('embed-common', 'common', 'core', etc.)
 * 2. Distinctive Brand & Sub-phrase Merging (Subsumption Algorithm)
 * 3. Canonical Namespace & Alias Mapping for 'Zepto Product Personalizer'
 * 4. Parent-Child Component aggregation in parent app's `components` array
 * 5. Multi-app coexistence (unrelated apps like Klaviyo, Loox, PageFly unaffected)
 * 6. End-to-End DOM simulation of realistic storefront
 */

const path = require('path');
const { DetectorEngine } = require('../src/content/detector-engine.js');
const { FingerprintEngine } = require('../src/content/fingerprint-engine.js');
const appsDb = require('../src/data/apps-database.json');

// Global mocks required by DetectorEngine in Node.js environment
global.FingerprintEngine = FingerprintEngine;
global.MutationDetector = class {
  constructor(apps) { this.apps = apps; }
  start(onDetect, onDone) { if (onDone) onDone(); }
};
global.NodeFilter = { SHOW_COMMENT: 128 };

function setupMockEnvironment({ comments = [], scripts = [], links = [], elements = [], cookies = '_shopify_y=test', shopDomain = 'store.myshopify.com' } = {}) {
  global.window = {
    location: { hostname: 'store.myshopify.com', href: 'https://store.myshopify.com/' },
    Shopify: { shop: shopDomain, theme: { name: 'Dawn' } }
  };

  global.performance = {
    getEntriesByType: (type) => (type === 'resource' ? [] : [])
  };

  global.document = {
    cookie: cookies,
    createNodeIterator: (root, whatToShow, filter) => {
      let idx = 0;
      return {
        nextNode: () => (idx < comments.length ? { nodeValue: comments[idx++] } : null)
      };
    },
    querySelectorAll: (selector) => {
      const results = [];
      const s = selector.toLowerCase();

      // Script elements
      if (s.includes('script[src]') || s.includes('script:not([src])') || s.includes('link[rel="stylesheet"]')) {
        for (const scr of scripts) {
          if (scr.src && s.includes('script[src]')) results.push(scr);
          if (!scr.src && scr.textContent && s.includes('script:not([src])')) results.push(scr);
        }
        for (const lnk of links) {
          if (s.includes('link[rel="stylesheet"]')) results.push(lnk);
        }
      }

      // App block / embed / data attribute elements
      if (s.includes('data-shopify-app-block') || s.includes('shopify-block-') || s.includes('data-app-id') || s.includes('data-handle')) {
        for (const el of elements) {
          if (el.appBlock || el.id || el.appId || el.handle) {
            results.push({
              getAttribute: (attr) => {
                if (attr === 'data-shopify-app-block') return el.appBlock || null;
                if (attr === 'data-app-id') return el.appId || null;
                if (attr === 'data-handle') return el.handle || null;
                return null;
              },
              id: el.id || ''
            });
          }
        }
      }

      // Custom DOM selectors from database
      for (const el of elements) {
        if (el.selector && selector.includes(el.selector)) {
          results.push(el);
        }
      }

      return results;
    },
    querySelector: (selector) => {
      if (selector.includes('data-shopify-section-id') || selector.includes('cdn.shopify.com')) {
        return {};
      }
      return null;
    }
  };
}

// Test Runner utilities
const testResults = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n\x1b[1m\x1b[36m=== Suite: ${name} ===\x1b[0m`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${name}`);
    testResults.push({ suite: currentSuite, name, passed: true });
  } catch (err) {
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${name}`);
    console.log(`    \x1b[33mError: ${err.message}\x1b[0m`);
    testResults.push({ suite: currentSuite, name, passed: false, error: err.message });
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${name}`);
    testResults.push({ suite: currentSuite, name, passed: true });
  } catch (err) {
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${name}`);
    console.log(`    \x1b[33mError: ${err.message}\x1b[0m`);
    testResults.push({ suite: currentSuite, name, passed: false, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Expected values to be equal'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// -------------------------------------------------------------
// Test Execution
// -------------------------------------------------------------

async function runAllTests() {
  const apps = Array.isArray(appsDb) ? appsDb : (appsDb.apps || []);

  // -----------------------------------------------------------
  // Suite 1: Generic Blacklist Handles
  // -----------------------------------------------------------
  suite('Step 1: Blacklist Generic Block & Script Handles');

  test('Generic handles must NOT create standalone active apps', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    const genericHandles = [
      'embed-common', 'common', 'core', 'runtime', 'main',
      'bundle', 'loader', 'vendor', 'app-block', 'app-embed',
      'helper', 'theme-extension'
    ];

    genericHandles.forEach(h => engine.processExtractedHandle(h, 'App Block'));
    const results = engine.getResults();

    const activeNames = results.active.map(a => a.name);
    for (const h of genericHandles) {
      const clean = h.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      assert(!activeNames.includes(clean), `Standalone app '${clean}' should not exist for generic handle '${h}'`);
    }
    assertEqual(results.active.length, 0, `Expected 0 active apps for isolated generic handles, found ${results.active.length} (${activeNames.join(', ')})`);
  });

  // -----------------------------------------------------------
  // Suite 2: Canonical Alias Mapping for Zepto Product Personalizer
  // -----------------------------------------------------------
  suite('Step 2 & 3: Canonical Namespace & Alias Mapping');

  test('All known Zepto aliases resolve to single canonical app "Zepto Product Personalizer"', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    const aliases = [
      'pplr',
      'pplr-common',
      'zepto',
      'zeptoapps',
      'zepto-common',
      'zepto_common',
      'zepto-product-personalizer',
      'product-personalizer'
    ];

    aliases.forEach(alias => engine.processExtractedHandle(alias, 'App Block'));
    const results = engine.getResults();

    const activeNames = results.active.map(a => a.name);
    assertEqual(results.active.length, 1, `Expected exactly 1 active app, got ${results.active.length}: ${JSON.stringify(activeNames)}`);
    assertEqual(results.active[0].name, 'Zepto Product Personalizer', `Expected app name to be 'Zepto Product Personalizer', got '${results.active[0]?.name}'`);
  });

  // -----------------------------------------------------------
  // Suite 3: Distinctive Brand & Sub-phrase Merging (Subsumption)
  // -----------------------------------------------------------
  suite('Step 2: Subsumption Algorithm (Sub-phrase and Brand Root Merging)');

  test('Subphrase "Product Personalizer" merges into "Zepto Product Personalizer"', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    // Simulate detection of both
    engine.recordDetection('Product Personalizer', 'App Block', 0.95);
    engine.recordDetection('Zepto Product Personalizer', 'App Block', 0.95);

    const results = engine.getResults();
    const activeNames = results.active.map(a => a.name);

    assertEqual(results.active.length, 1, `Subphrase should merge: expected 1 app, got ${results.active.length} (${activeNames.join(', ')})`);
    assertEqual(results.active[0].name, 'Zepto Product Personalizer', `Master app should be 'Zepto Product Personalizer'`);
  });

  test('Brand root "Zepto Common" merges into "Zepto Product Personalizer"', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    // Simulate detection of brand root with generic suffix
    engine.recordDetection('Zepto Common', 'App Block', 0.95);
    engine.recordDetection('Zepto Product Personalizer', 'App Block', 0.95);

    const results = engine.getResults();
    const activeNames = results.active.map(a => a.name);

    assertEqual(results.active.length, 1, `Brand root with generic suffix should merge: expected 1 app, got ${results.active.length} (${activeNames.join(', ')})`);
    assertEqual(results.active[0].name, 'Zepto Product Personalizer', `Master app should be 'Zepto Product Personalizer'`);
  });

  // -----------------------------------------------------------
  // Suite 4: Parent-Child Components Storage
  // -----------------------------------------------------------
  suite('Step 4: Parent-Child Components Array');

  test('Detected component blocks and scripts are stored on parent app components array', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    // Process blocks and scripts for Zepto
    engine.processExtractedHandle('embed-common', 'App Block', 'https://cdn.shopify.com/extensions/b892/embed-common/assets/embed-common.js');
    engine.processExtractedHandle('product-personalizer', 'App Block', 'https://cdn.shopify.com/extensions/b892/product-personalizer/assets/product-personalizer.js');
    engine.processExtractedHandle('zepto-common', 'App Block', 'https://cdn.shopify.com/extensions/b892/zepto-common/assets/zepto-common.js');
    engine.processExtractedHandle('zepto-product-personalizer', 'App Block');
    engine.processExtractedHandle('pplr', 'App Embed');

    const results = engine.getResults();
    assertEqual(results.active.length, 1, `Expected 1 active app, got ${results.active.length}`);

    const zeptoApp = results.active[0];
    assertEqual(zeptoApp.name, 'Zepto Product Personalizer');

    assert(Array.isArray(zeptoApp.components), `App should have a components array, got ${typeof zeptoApp.components}`);
    assert(zeptoApp.components.length >= 3, `Expected at least 3 components, got ${zeptoApp.components.length}`);

    const componentStr = zeptoApp.components.join(' ').toLowerCase();
    assert(componentStr.includes('embed-common'), `Components should include 'embed-common', got: ${JSON.stringify(zeptoApp.components)}`);
    assert(componentStr.includes('zepto-common'), `Components should include 'zepto-common', got: ${JSON.stringify(zeptoApp.components)}`);
    assert(componentStr.includes('product-personalizer'), `Components should include 'product-personalizer', got: ${JSON.stringify(zeptoApp.components)}`);
  });

  // -----------------------------------------------------------
  // Suite 5: Unrelated Apps Isolation
  // -----------------------------------------------------------
  suite('Unrelated Apps Isolation & Multi-App Coexistence');

  test('Klaviyo, Loox, PageFly coexist without being subsumed or corrupted by Zepto merging', () => {
    setupMockEnvironment();
    const engine = new DetectorEngine();
    engine.init(apps);
    engine.isShopify = true;

    // Zepto components
    engine.processExtractedHandle('embed-common', 'App Block');
    engine.processExtractedHandle('zepto-product-personalizer', 'App Block');
    engine.processExtractedHandle('product-personalizer', 'App Block');
    engine.processExtractedHandle('pplr', 'App Embed');

    // Unrelated apps
    engine.recordDetection('Klaviyo', 'script', 0.95, { url: 'https://static.klaviyo.com/onsite/js/klaviyo.js' });
    engine.recordDetection('Klaviyo', 'App Block', 0.95);
    engine.recordDetection('Loox', 'App Block', 0.95);
    engine.recordDetection('PageFly', 'App Block', 0.95);

    const results = engine.getResults();
    const activeNames = results.active.map(a => a.name);

    assert(activeNames.includes('Zepto Product Personalizer'), `Expected 'Zepto Product Personalizer' in active apps`);
    assert(activeNames.includes('Klaviyo'), `Expected 'Klaviyo' in active apps`);
    assert(activeNames.includes('Loox'), `Expected 'Loox' in active apps`);
    assert(activeNames.includes('PageFly'), `Expected 'PageFly' in active apps`);

    // Verify exactly 4 active apps (Zepto, Klaviyo, Loox, PageFly) and NO generic or redundant apps
    assertEqual(results.active.length, 4, `Expected 4 active apps, got ${results.active.length} (${activeNames.join(', ')})`);
  });

  // -----------------------------------------------------------
  // Suite 6: Full Realistic End-to-End Storefront DOM Scan
  // -----------------------------------------------------------
  suite('Suite 6: End-to-End DOM Scan Simulation');

  await asyncTest('Full storefront DOM scan correctly identifies Zepto with components and partner apps', async () => {
    const comments = [
      'BEGIN app embed: shopify://apps/zepto-product-personalizer/blocks/embed-common/018b7c4a-6d1e-7b49-b000-018f3a532341',
      'BEGIN app block: shopify://apps/zepto-product-personalizer/blocks/product-personalizer/018b7c4a-6d1e-7b49-b000-018f3a532341',
      'BEGIN app block: shopify://apps/pagefly/blocks/pagefly-section/98765'
    ];

    const scripts = [
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/theme.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/zepto-product-personalizer/assets/zepto-common.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/zepto-product-personalizer/assets/product-personalizer.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/embed-common/assets/embed-common.js' },
      { src: 'https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=XYZ123' },
      { src: 'https://loox.io/widget/loox.js' }
    ];

    const elements = [
      { appBlock: 'embed-common' },
      { id: 'shopify-block-zepto-product-personalizer' },
      { handle: 'pagefly' }
    ];

    setupMockEnvironment({ comments, scripts, elements });

    const engine = new DetectorEngine();
    await engine.init(apps);

    const results = await engine.startFullScan();
    const activeNames = results.active.map(a => a.name);

    console.log(`    Detected Active Apps: [${activeNames.join(', ')}]`);

    // Verify Zepto is singular
    const zeptoMatches = results.active.filter(a => a.name.toLowerCase().includes('personalizer') || a.name.toLowerCase().includes('zepto') || a.name.toLowerCase().includes('embed') || a.name.toLowerCase().includes('pplr'));
    assertEqual(zeptoMatches.length, 1, `Expected exactly 1 Zepto app, found ${zeptoMatches.length}: ${zeptoMatches.map(m => m.name).join(', ')}`);
    assertEqual(zeptoMatches[0].name, 'Zepto Product Personalizer');

    // Verify components
    const zeptoApp = zeptoMatches[0];
    assert(Array.isArray(zeptoApp.components), `Zepto should have components array`);
    const compStr = zeptoApp.components.join(' ').toLowerCase();
    assert(compStr.includes('embed-common'), `Zepto components should include 'embed-common'`);

    // Verify partner apps
    assert(activeNames.includes('PageFly'), `PageFly should be active`);
  });

  // -----------------------------------------------------------
  // Suite 7: Gibberish Block IDs and Theme Assets Isolation Test
  // -----------------------------------------------------------
  suite('Suite 7: Gibberish Block IDs and Theme Assets Isolation Test');

  await asyncTest('Random hash block IDs and theme assets are 100% filtered out', async () => {
    const comments = [
      'BEGIN app embed: shopify://apps/zepto-product-personalizer/blocks/embed-common/018b7c4a-6d1e-7b49-b000-018f3a532341'
    ];

    const elements = [
      { id: 'shopify-block-atdhxcmyotfusdhc' },
      { id: 'shopify-block-awujobbbkavzfo' },
      { id: 'shopify-block-atkzjzsynvozhvwu__zepto_product_personalizer_product_personalizer_page_vyhp' }
    ];

    const scripts = [
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/base.css' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/constants.js' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/cart.js' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/global.js' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/search-form.js' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/details-modal.js' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/component-accordion.css' },
      { src: 'https://cdn.shopify.com/s/files/1/0000/assets/section-main-product.css' },
      { src: 'https://cdn.shopify.com/shopifycloud/shopify_perf_kit/shopify-perf-kit-3.9.4.min.js' },
      { src: 'https://cdn.shopify.com/shopifycloud/shop_events_listener-4e26a9ce.js' },
      { src: 'https://cdn.shopify.com/shopifycloud/webmcp/webmcp-c6b62ece.js' },
      { src: 'https://cdn.shopify.com/shopifycloud/origin_trials-318ab40a.js' },
      { src: 'https://cdn.shopify.com/shopifycloud/load_feature-1bd60354.js' },
      { src: 'https://cdn.shopify.com/shopifycloud/remote_product_tracking-91d95044.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/zepto-product-personalizer/assets/zepto-common.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/zepto-product-personalizer/assets/product-personalizer.js' },
      { src: 'https://cdn.shopify.com/extensions/018b7c4a-6d1e-7b49-b000-018f3a532341/embed-common/assets/embed-common.js' }
    ];

    setupMockEnvironment({ comments, scripts, elements });

    const engine = new DetectorEngine();
    await engine.init(apps);

    const results = await engine.startFullScan();
    const activeNames = results.active.map(a => a.name);

    console.log(`    Detected Active Apps: [${activeNames.join(', ')}]`);

    // Verify ZERO gibberish apps
    assert(!activeNames.includes('Atdhxcmyotfusdhc'), 'Gibberish hash Atdhxcmyotfusdhc must NOT be an app');
    assert(!activeNames.includes('Awujobbbkavzfo'), 'Gibberish hash Awujobbbkavzfo must NOT be an app');
    assert(!activeNames.some(n => n.includes('Atkzjzsynvozhvwu')), 'Random block prefix must NOT be in app names');

    // Verify exactly ONE active app: Zepto Product Personalizer
    assertEqual(results.active.length, 1, `Expected exactly 1 app, got ${results.active.length} (${activeNames.join(', ')})`);
    assertEqual(results.active[0].name, 'Zepto Product Personalizer');

    const zeptoApp = results.active[0];
    const components = zeptoApp.components || [];
    console.log(`    Zepto Components: [${components.join(', ')}]`);

    // Verify NO theme files in components
    const themeFiles = ['base.css', 'cart.js', 'global.js', 'constants.js', 'shopify-perf-kit', 'shop_events_listener', 'webmcp', 'origin_trials', 'load_feature', 'remote_product_tracking'];
    for (const tf of themeFiles) {
      assert(!components.some(c => c.toLowerCase().includes(tf)), `Theme/platform file '${tf}' must NOT be in app components`);
    }

    // Verify legitimate Zepto components are present
    assert(components.some(c => c.toLowerCase().includes('embed-common') || c.toLowerCase().includes('embed_common')), 'embed-common must be in Zepto components');
    assert(components.some(c => c.toLowerCase().includes('zepto-common')), 'zepto-common must be in Zepto components');
    assert(components.some(c => c.toLowerCase().includes('product-personalizer')), 'product-personalizer must be in Zepto components');
  });

  // -----------------------------------------------------------
  // Summary Report
  // -----------------------------------------------------------
  console.log('\n=============================================');
  console.log('              TEST SUMMARY REPORT            ');
  console.log('=============================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  console.log(`Total Tests : ${testResults.length}`);
  console.log(`\x1b[32mPassed      : ${passedCount}\x1b[0m`);
  console.log(`\x1b[31mFailed      : ${failedCount}\x1b[0m`);
  console.log('=============================================\n');

  if (failedCount > 0) {
    console.log('\x1b[31mFailed Tests Details:\x1b[0m');
    testResults.filter(t => !t.passed).forEach((t, i) => {
      console.log(`${i + 1}. [${t.suite}] ${t.name}`);
      console.log(`   \x1b[33m${t.error}\x1b[0m`);
    });
    console.log('\n\x1b[33mBaseline run completed with expected failures in unpatched codebase.\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mAll deduplication and component tests passed with 100% precision!\x1b[0m');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
