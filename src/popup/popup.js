/**
 * Which Shopify App — Popup Controller (Manifest V3)
 * Two-row layout: Store Info Bar + Sidebar/Content Panel
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Element Selectors ---
  const storeDomainEl = document.getElementById('store-domain');
  const myshopifyUrlEl = document.getElementById('myshopify-url');
  const copyMyshopifyBtn = document.getElementById('copy-myshopify');
  const quickExportBtn = document.getElementById('quick-export-btn');

  const scanProgress = document.getElementById('scan-progress');
  const themeNameEl = document.getElementById('theme-name');
  const growthStackEl = document.getElementById('growth-stack');

  const sidebarActiveCount = document.getElementById('sidebar-active-count');
  const sidebarScriptsCount = document.getElementById('sidebar-scripts-count');
  const sidebarGhostsCount = document.getElementById('sidebar-ghosts-count');
  const totalAppsCount = document.getElementById('total-apps-count');
  const panelHeaderTitle = document.getElementById('panel-header-title');

  const appSearchInput = document.getElementById('app-search');
  const clearSearchBtn = document.getElementById('clear-search');

  const listActive = document.getElementById('list-active');
  const listScripts = document.getElementById('list-scripts');
  const listGhosts = document.getElementById('list-ghosts');

  const sidebarItems = document.querySelectorAll('.sidebar-item');

  const spyContainer = document.getElementById('spy-alerts');
  const footerStatus = document.getElementById('footer-status');
  const rescanBtn = document.getElementById('rescan-btn');
  const restrictedUi = document.getElementById('restricted-ui');
  const restrictedRetryBtn = document.getElementById('restricted-retry-btn');
  const toastEl = document.getElementById('toast');

  // --- State ---
  let rawData = null;
  let activeCategory = 'active'; // 'active' | 'scripts' | 'ghosts'
  let searchQuery = '';
  let toastTimeout = null;
  let isScanning = false;
  let lastRenderFingerprint = '';

  // Category labels map
  const CATEGORY_LABELS = {
    active: 'Active Apps',
    scripts: 'Apps w/ Scripts',
    ghosts: 'Residual Ghosts'
  };

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

  // --- Target Tab Resolution (Supports both extension popup and popout window) ---
  async function resolveTargetTab() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramTabId = urlParams.get('tabId');
    if (paramTabId) {
      try {
        const t = await chrome.tabs.get(parseInt(paramTabId, 10));
        if (t) return t;
      } catch (e) {}
    }
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab || null;
  }

  // --- Sidebar Navigation ---
  function switchCategory(category) {
    activeCategory = category;

    // Update sidebar active state
    sidebarItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-category') === category);
    });

    // Update panel header title
    if (panelHeaderTitle) {
      panelHeaderTitle.textContent = CATEGORY_LABELS[category] || 'Active Apps';
    }

    // Show/hide the correct app list
    const lists = { active: listActive, scripts: listScripts, ghosts: listGhosts };
    Object.entries(lists).forEach(([key, el]) => {
      if (el) el.style.display = key === category ? 'flex' : 'none';
    });
  }

  // Bind sidebar click events
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      switchCategory(item.getAttribute('data-category'));
    });
  });

  // --- Instant Load & Scan Lifecycle ---
  async function performSingleScan(forceRescan = false) {
    if (isScanning) return;

    const tab = await resolveTargetTab();
    if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://')) {
      isScanning = false;
      showRestrictedState();
      return;
    }

    let tabHostname = '';
    try {
      const url = new URL(tab.url);
      tabHostname = url.hostname;
      if (storeDomainEl) storeDomainEl.textContent = tabHostname;
    } catch (e) {
      if (storeDomainEl) storeDomainEl.textContent = 'Storefront';
    }

    const storageKey = `results_${tab.id}`;
    const domainKey = tabHostname ? `results_${tabHostname}` : '';

    // 1. FAST PATH (Instant Load): If not forced rescan, check cache first!
    // Shows loading only once per page; closing & reopening loads instantly with 0ms delay!
    if (!forceRescan) {
      try {
        const cacheData = await chrome.storage.local.get([storageKey, domainKey].filter(Boolean));
        const cached = cacheData[storageKey] || (domainKey ? cacheData[domainKey] : null);
        if (cached && cached.results) {
          rawData = cached;
          renderAll();
          return; // Instant render, zero loading screens!
        }
      } catch (err) {}
    }

    // 2. SLOW/INITIAL PATH: Run scan only when cache is missing or explicitly re-scanning
    isScanning = true;
    setLoadingState(true);

    // Send scan request directly to the page content script
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REQUEST', force: forceRescan }, async (response) => {
      isScanning = false;
      setLoadingState(false);

      if (!chrome.runtime.lastError && response && response.results) {
        rawData = {
          results: response.results,
          storeInfo: response.storeInfo || {}
        };
        renderAll();
        return;
      }

      // Fallback: Check local storage for cached results if content script response was missed
      try {
        const data = await chrome.storage.local.get([storageKey, domainKey].filter(Boolean));
        const cached = data[storageKey] || (domainKey ? data[domainKey] : null);
        if (cached && cached.results) {
          rawData = cached;
          renderAll();
          return;
        }
      } catch (err) {}

      // If no valid Shopify data could be retrieved, show restricted state
      showRestrictedState();
    });
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

    // Store Info Bar
    const myshopify = storeInfo.shop || '';
    if (myshopifyUrlEl) {
      myshopifyUrlEl.textContent = myshopify || '—';
    }
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
      const compMatch = Array.isArray(app.components) && app.components.some(c => (c || '').toLowerCase().includes(q));
      return nameMatch || catMatch || methodMatch || compMatch;
    };

    const filteredActive = active.filter(filterFn);
    const filteredScripts = scripts.filter(filterFn);
    const filteredGhosts = ghosts.filter(filterFn);

    const totalFiltered = filteredActive.length + filteredScripts.length + filteredGhosts.length;
    const totalAll = active.length + scripts.length + ghosts.length;

    // Deduplication Fingerprint
    const currentFingerprint = JSON.stringify({
      fa: filteredActive.length,
      fs: filteredScripts.length,
      fg: filteredGhosts.length,
      theme: storeInfo.theme,
      q,
      cat: activeCategory
    });
    if (currentFingerprint === lastRenderFingerprint && document.querySelector('.app-card')) {
      return;
    }
    lastRenderFingerprint = currentFingerprint;

    // Update Sidebar Counts
    if (sidebarActiveCount) sidebarActiveCount.textContent = filteredActive.length;
    if (sidebarScriptsCount) sidebarScriptsCount.textContent = filteredScripts.length;
    if (sidebarGhostsCount) sidebarGhostsCount.textContent = filteredGhosts.length;
    if (totalAppsCount) totalAppsCount.textContent = totalFiltered;

    // Update Footer Status
    if (footerStatus) {
      footerStatus.textContent = q
        ? `${totalFiltered} of ${totalAll} apps matching "${q}"`
        : `${totalAll} apps analyzed • 100% Client-Side`;
    }

    // Render Lists
    renderAppList(listActive, filteredActive, 'active', changes.added || []);
    renderAppList(listScripts, filteredScripts, 'script', []);
    renderAppList(listGhosts, filteredGhosts, 'ghost', []);

    // Ensure correct panel is visible
    switchCategory(activeCategory);
  }

  // --- Render Individual App List ---
  function renderAppList(container, apps, type, addedApps = []) {
    if (!container) return;

    if (!apps || apps.length === 0) {
      const emptyLabel = type === 'active' ? 'No active theme app blocks'
        : type === 'script' ? 'No background script dependencies'
        : 'Clean storefront — no residual ghost snippets';
      const emptyIcon = type === 'active' ? '📦' : type === 'script' ? '⚡' : '✨';
      container.innerHTML = `
        <div class="empty-box">
          <span class="empty-icon">${emptyIcon}</span>
          <div>${emptyLabel}</div>
        </div>`;
      return;
    }

    container.innerHTML = apps.map((app) => {
      const name = app.name || 'Unknown App';
      const initial = name.charAt(0).toUpperCase();
      const isNew = addedApps.some(a => a.name === name);
      const icon = app.icon || null;
      const slug = app.slug || '';

      let signalText = 'Confirmed';
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

      // Detected Components / Scripts (if any)
      const componentsHtml = (Array.isArray(app.components) && app.components.length > 0) ? `
        <div class="components-row" title="Detected Components & Scripts">
          <span class="components-label">Scripts:</span>
          ${app.components.map(c => `<span class="component-pill" title="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('')}
        </div>` : '';

      return `
        <div class="app-card">
          <div class="card-top">
            <div class="app-main">
              <div class="app-avatar" data-slug="${escapeHtml(slug)}" data-name="${escapeHtml(name)}">
                ${icon ? `
                  <img src="${escapeHtml(icon)}" class="app-logo-img" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                  <span class="app-avatar-fallback" style="display:none;">${initial}</span>
                ` : `
                  <span class="app-avatar-fallback">${initial}</span>
                `}
              </div>
              <div class="app-name-wrap">
                <span class="app-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
              </div>
            </div>
            <a href="${storeUrl}" target="_blank" rel="noopener noreferrer" class="store-link-btn" title="View on Shopify App Store">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

          ${componentsHtml}
          ${altHtml}
        </div>`;
    }).join('');

    loadMissingAppIcons(container);
  }

  // --- Dynamic On-Demand Logo Loader ---
  function loadMissingAppIcons(container) {
    if (!container) return;
    const avatars = container.querySelectorAll('.app-avatar[data-slug]:not([data-icon-loaded])');
    avatars.forEach(avatar => {
      const slug = avatar.getAttribute('data-slug');
      const name = avatar.getAttribute('data-name');
      if (!slug || avatar.querySelector('img.app-logo-img')) return;
      avatar.setAttribute('data-icon-loaded', 'pending');
      try {
        chrome.runtime.sendMessage({ type: 'GET_APP_ICON', slug, name }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success || !response.icon) {
            avatar.setAttribute('data-icon-loaded', 'failed');
            return;
          }
          avatar.setAttribute('data-icon-loaded', 'true');
          const fallback = avatar.querySelector('.app-avatar-fallback');
          const img = document.createElement('img');
          img.className = 'app-logo-img';
          img.alt = name || '';
          img.loading = 'lazy';
          img.src = response.icon;
          img.onerror = () => {
            img.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
          };
          if (fallback) fallback.style.display = 'none';
          avatar.prepend(img);
        });
      } catch (e) {
        avatar.setAttribute('data-icon-loaded', 'failed');
      }
    });
  }

  // --- Loading Skeleton & Progress Bar State ---
  function setLoadingState(loading) {
    if (scanProgress) {
      scanProgress.style.display = loading ? 'block' : 'none';
    }

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
    if (sidebarActiveCount) sidebarActiveCount.textContent = '0';
    if (sidebarScriptsCount) sidebarScriptsCount.textContent = '0';
    if (sidebarGhostsCount) sidebarGhostsCount.textContent = '0';
    if (totalAppsCount) totalAppsCount.textContent = '0';
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
        const comps = (Array.isArray(a.components) && a.components.length > 0) ? ` | Scripts: ${a.components.join(', ')}` : '';
        md += `- **${a.name}** (${a.category || 'Ecommerce'}) — Signal: ${(a.methods || []).join(', ')}${comps}\n`;
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
      if (text && text !== '—') {
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
      lastRenderFingerprint = ''; // Force re-render on search
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
        lastRenderFingerprint = '';
        renderAll();
      }
    });
  }

  // --- Action Buttons ---
  if (rescanBtn) rescanBtn.addEventListener('click', () => performSingleScan(true));
  if (restrictedRetryBtn) restrictedRetryBtn.addEventListener('click', () => performSingleScan(true));
  if (quickExportBtn) quickExportBtn.addEventListener('click', copyMarkdownAudit);

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Press 'R' to rescan (when not typing in search)
    if (e.key === 'r' && document.activeElement !== appSearchInput) {
      performSingleScan(true);
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

  // --- Initial Launch: Instant Cache Load (0ms wait, no loading screen) ---
  performSingleScan(false);
});
