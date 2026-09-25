/**
 * Which Shopify App — Popup Controller (Manifest V3)
 * Modern Shopify Polaris / SaaS aesthetic with real-time multi-signal filtering
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Element Selectors ---
  const storeDomainEl = document.getElementById('store-domain');
  const myshopifyContainer = document.getElementById('myshopify-container');
  const myshopifyUrlEl = document.getElementById('myshopify-url');
  const copyMyshopifyBtn = document.getElementById('copy-myshopify');
  const quickExportBtn = document.getElementById('quick-export-btn');

  const activeCountEl = document.getElementById('active-count');
  const scriptsCountEl = document.getElementById('scripts-count');
  const ghostsCountEl = document.getElementById('ghosts-count');
  const themeNameEl = document.getElementById('theme-name');
  const growthStackEl = document.getElementById('growth-stack');

  const appSearchInput = document.getElementById('app-search');
  const clearSearchBtn = document.getElementById('clear-search');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const tabAllCount = document.getElementById('tab-all-count');
  const tabActiveCount = document.getElementById('tab-active-count');
  const tabScriptsCount = document.getElementById('tab-scripts-count');
  const tabGhostsCount = document.getElementById('tab-ghosts-count');

  const triageGrid = document.getElementById('triage-grid');
  const listActive = document.getElementById('list-active');
  const listScripts = document.getElementById('list-scripts');
  const listGhosts = document.getElementById('list-ghosts');
  const badgeActive = document.getElementById('badge-active');
  const badgeScripts = document.getElementById('badge-scripts');
  const badgeGhosts = document.getElementById('badge-ghosts');

  const spyContainer = document.getElementById('spy-alerts');
  const footerStatus = document.getElementById('footer-status');
  const rescanBtn = document.getElementById('rescan-btn');
  const rescanIcon = document.getElementById('rescan-icon');
  const restrictedUi = document.getElementById('restricted-ui');
  const restrictedRetryBtn = document.getElementById('restricted-retry-btn');
  const toastEl = document.getElementById('toast');

  // --- State ---
  let rawData = null;
  let activeTabFilter = 'all';
  let searchQuery = '';
  let toastTimeout = null;

  // --- Toast Notification ---
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  // --- Force Fresh Scan ---
  async function forceFreshScan() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
      showRestrictedState();
      return;
    }

    // Check fast cache
    const data = await chrome.storage.local.get([`results_${tab.id}`]);
    const existing = data[`results_${tab.id}`];

    if (existing && existing.results && existing.results.isShopify === false) {
      showRestrictedState();
      return;
    }

    setLoadingState(true);

    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REQUEST' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setLoadingState(false);
        loadResults(); // fallback
        return;
      }
      setTimeout(loadResults, 600);
    });
  }

  // --- Load Results from Local Storage ---
  async function loadResults() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    try {
      const url = new URL(tab.url);
      storeDomainEl.textContent = url.hostname;
    } catch (e) {
      storeDomainEl.textContent = 'Storefront';
    }

    const data = await chrome.storage.local.get([`results_${tab.id}`]);
    const resultsData = data[`results_${tab.id}`];

    setLoadingState(false);

    if (resultsData) {
      rawData = resultsData;
      renderAll();
    }
  }

  // --- Render All Sections ---
  function renderAll() {
    if (!rawData || !rawData.results) return;

    const { active = [], scripts = [], ghosts = [], growthStack, isShopify } = rawData.results;
    const storeInfo = rawData.storeInfo || {};
    const changes = rawData.changes || { added: [], removed: [] };

    // Gateway Check
    if (isShopify === false) {
      showRestrictedState();
      return;
    } else {
      if (restrictedUi) restrictedUi.style.display = 'none';
    }

    // Store Info & MyShopify Domain
    const myshopify = storeInfo.shop || '';
    if (myshopify && myshopifyContainer && myshopifyUrlEl) {
      myshopifyUrlEl.textContent = myshopify;
      myshopifyContainer.style.display = 'inline-flex';
    } else if (myshopifyContainer) {
      myshopifyContainer.style.display = 'none';
    }

    // KPI Metric Strip
    if (activeCountEl) activeCountEl.textContent = active.length;
    if (scriptsCountEl) scriptsCountEl.textContent = scripts.length;
    if (ghostsCountEl) ghostsCountEl.textContent = ghosts.length;
    if (themeNameEl) themeNameEl.textContent = storeInfo.theme || 'Custom Theme';
    if (growthStackEl) growthStackEl.textContent = growthStack || 'Standard Stack';

    // Alerts
    if (spyContainer) {
      spyContainer.innerHTML = '';
      if (changes.added && changes.added.length > 0) {
        const names = changes.added.map(a => a.name).join(', ');
        spyContainer.innerHTML = `
          <div class="alert-banner">
            <span>🚀</span>
            <span><strong>New Apps Detected:</strong> ${escapeHtml(names)}</span>
          </div>`;
      }
    }

    // Filter by Search Query
    const q = searchQuery.toLowerCase().trim();
    const filterFn = (app) => {
      if (!q) return true;
      const nameMatch = (app.name || '').toLowerCase().includes(q);
      const catMatch = (app.category || '').toLowerCase().includes(q);
      const methodMatch = Array.isArray(app.methods) && app.methods.some(m => (m || '').toLowerCase().includes(q));
      return nameMatch || catMatch || methodMatch;
    };

    const filteredActive = active.filter(filterFn);
    const filteredScripts = scripts.filter(filterFn);
    const filteredGhosts = ghosts.filter(filterFn);

    const totalFiltered = filteredActive.length + filteredScripts.length + filteredGhosts.length;
    const totalAll = active.length + scripts.length + ghosts.length;

    // Update Tab Badges
    if (tabAllCount) tabAllCount.textContent = totalFiltered;
    if (tabActiveCount) tabActiveCount.textContent = filteredActive.length;
    if (tabScriptsCount) tabScriptsCount.textContent = filteredScripts.length;
    if (tabGhostsCount) tabGhostsCount.textContent = filteredGhosts.length;

    // Update Column Header Badges
    if (badgeActive) badgeActive.textContent = filteredActive.length;
    if (badgeScripts) badgeScripts.textContent = filteredScripts.length;
    if (badgeGhosts) badgeGhosts.textContent = filteredGhosts.length;

    // Update Footer Status
    if (footerStatus) {
      footerStatus.textContent = q
        ? `${totalFiltered} of ${totalAll} apps matching "${q}"`
        : `${totalAll} apps analyzed • Verified`;
    }

    // Render Lists
    renderAppList(listActive, filteredActive, 'active', changes.added || []);
    renderAppList(listScripts, filteredScripts, 'script', []);
    renderAppList(listGhosts, filteredGhosts, 'ghost', []);
  }

  // --- Render Individual Column List ---
  function renderAppList(container, apps, type, addedApps = []) {
    if (!container) return;

    if (!apps || apps.length === 0) {
      const emptyLabel = type === 'active' ? 'No active app blocks found'
        : type === 'script' ? 'No external script dependencies'
        : 'Storefront clean — no ghost snippets';
      const emptyIcon = type === 'active' ? '📦' : type === 'script' ? '⚡' : '✨';
      container.innerHTML = `
        <div class="empty-box">
          <span class="empty-icon">${emptyIcon}</span>
          <div>${emptyLabel}</div>
        </div>`;
      return;
    }

    container.innerHTML = apps.map((app, index) => {
      const name = app.name || 'Unknown App';
      const initial = name.charAt(0).toUpperCase();
      const isNew = addedApps.some(a => a.name === name);

      let signalText = 'Active Block';
      if (type === 'active') signalText = isNew ? 'NEW' : 'Confirmed';
      else if (type === 'script') signalText = 'Script / CDN';
      else signalText = 'Ghost Snippet';

      // Store Link
      const storeUrl = app.slug
        ? `https://apps.shopify.com/${encodeURIComponent(app.slug)}`
        : `https://apps.shopify.com/search?q=${encodeURIComponent(name)}`;

      // Category
      const category = app.category || 'Ecommerce';

      // Alternative suggestion
      const altHtml = app.alternative ? `
        <div class="alt-tip-box">
          💡 <strong>Tip:</strong> Try <strong>${escapeHtml(app.alternative.name)}</strong> — ${escapeHtml(app.alternative.reason)}
        </div>` : '';

      return `
        <div class="app-card" style="animation-delay: ${Math.min(index * 0.04, 0.4)}s;">
          <div class="card-top">
            <div class="app-main">
              <div class="app-avatar">${initial}</div>
              <div class="app-name-wrap">
                <span class="app-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
              </div>
            </div>
            <a href="${storeUrl}" target="_blank" rel="noopener noreferrer" class="store-link-btn" title="View on Shopify App Store">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>

          <div class="tags-row">
            <span class="category-pill">${escapeHtml(category)}</span>
            <span class="signal-pill">${signalText}</span>
          </div>

          ${altHtml}
        </div>`;
    }).join('');
  }

  // --- Loading Skeleton UI ---
  function setLoadingState(loading) {
    if (rescanBtn) {
      if (loading) {
        rescanBtn.classList.add('spinning');
        rescanBtn.setAttribute('disabled', 'true');
      } else {
        rescanBtn.classList.remove('spinning');
        rescanBtn.removeAttribute('disabled');
      }
    }

    if (loading) {
      if (restrictedUi) restrictedUi.style.display = 'none';
      const skeletonHtml = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      `;
      if (listActive) listActive.innerHTML = skeletonHtml;
      if (listScripts) listScripts.innerHTML = skeletonHtml;
      if (listGhosts) listGhosts.innerHTML = skeletonHtml;
      if (footerStatus) footerStatus.textContent = 'Auditing storefront signals...';
    }
  }

  // --- Restricted / Non-Shopify State ---
  function showRestrictedState() {
    setLoadingState(false);
    if (restrictedUi) restrictedUi.style.display = 'flex';
    if (listActive) listActive.innerHTML = '';
    if (listScripts) listScripts.innerHTML = '';
    if (listGhosts) listGhosts.innerHTML = '';
    if (activeCountEl) activeCountEl.textContent = '0';
    if (scriptsCountEl) scriptsCountEl.textContent = '0';
    if (ghostsCountEl) ghostsCountEl.textContent = '0';
    if (themeNameEl) themeNameEl.textContent = '---';
    if (growthStackEl) growthStackEl.textContent = 'Non-Shopify';
    if (footerStatus) footerStatus.textContent = 'Storefront not recognized';
  }

  // --- Copy Markdown Export Report ---
  function copyMarkdownAudit() {
    if (!rawData || !rawData.results) {
      showToast('No audit data to export');
      return;
    }

    const { active = [], scripts = [], ghosts = [], growthStack } = rawData.results;
    const storeInfo = rawData.storeInfo || {};
    const domain = storeInfo.domain || 'store';
    const shop = storeInfo.shop || 'Unknown';
    const theme = storeInfo.theme || 'Unknown';
    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    let md = `# Which Shopify App — Store Intelligence Report\n\n`;
    md += `- **Store Domain**: ${domain}\n`;
    md += `- **MyShopify Domain**: ${shop}\n`;
    md += `- **Active Theme**: ${theme}\n`;
    md += `- **Architecture**: ${growthStack || 'Standard Stack'}\n`;
    md += `- **Audit Date**: ${now}\n\n`;

    md += `## 1. Confirmed Active Apps (${active.length})\n`;
    if (active.length > 0) {
      active.forEach(a => {
        md += `- **${a.name}** (${a.category || 'Ecommerce'}) — Signal: ${(a.methods || []).join(', ')}\n`;
      });
    } else {
      md += `*None detected.*\n`;
    }

    md += `\n## 2. Apps Using Scripts / CDNs (${scripts.length})\n`;
    if (scripts.length > 0) {
      scripts.forEach(s => {
        md += `- **${s.name}** (${s.category || 'Ecommerce'}) — Signal: ${(s.methods || []).join(', ')}\n`;
      });
    } else {
      md += `*None detected.*\n`;
    }

    md += `\n## 3. Residual App Code (Ghost Remnants) (${ghosts.length})\n`;
    if (ghosts.length > 0) {
      ghosts.forEach(g => {
        md += `- **${g.name}** (${g.category || 'Ecommerce'}) — Orphaned snippet or container\n`;
      });
    } else {
      md += `*No residual code found. Clean storefront!*\n`;
    }

    md += `\n---\n*Generated by [Which Shopify App](https://chromewebstore.google.com/detail/which-shopify-app)*\n`;

    navigator.clipboard.writeText(md).then(() => {
      showToast('Markdown audit copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy audit');
    });
  }

  // --- Copy MyShopify Handle ---
  if (copyMyshopifyBtn) {
    copyMyshopifyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = myshopifyUrlEl ? myshopifyUrlEl.textContent : '';
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(`Copied ${text}`);
        });
      }
    });
  }

  // --- Search Input Handlers ---
  if (appSearchInput) {
    appSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
      }
      renderAll();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (appSearchInput) {
        appSearchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        appSearchInput.focus();
        renderAll();
      }
    });
  }

  // --- Filter Tabs Handlers ---
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      activeTabFilter = tab.getAttribute('data-tab');

      if (triageGrid) {
        triageGrid.classList.remove('focus-active', 'focus-scripts', 'focus-ghosts');
        if (activeTabFilter === 'active') triageGrid.classList.add('focus-active');
        else if (activeTabFilter === 'scripts') triageGrid.classList.add('focus-scripts');
        else if (activeTabFilter === 'ghosts') triageGrid.classList.add('focus-ghosts');
      }
    });
  });

  // --- Action Buttons ---
  if (rescanBtn) rescanBtn.addEventListener('click', forceFreshScan);
  if (restrictedRetryBtn) restrictedRetryBtn.addEventListener('click', forceFreshScan);
  if (quickExportBtn) quickExportBtn.addEventListener('click', copyMarkdownAudit);

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Press 'R' to rescan (when not typing in search)
    if (e.key === 'r' && document.activeElement !== appSearchInput) {
      forceFreshScan();
    }
    // Press '/' to focus search
    if (e.key === '/' && document.activeElement !== appSearchInput) {
      e.preventDefault();
      if (appSearchInput) appSearchInput.focus();
    }
  });

  // --- Helper: Escape HTML ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Initial Trigger & Event Listener ---
  forceFreshScan();
  chrome.storage.onChanged.addListener(loadResults);
});
