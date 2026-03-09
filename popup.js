document.addEventListener('DOMContentLoaded', async () => {
  const storeDomainEl = document.getElementById('store-domain');
  const activeCountEl = document.getElementById('active-count');
  const themeNameEl = document.getElementById('theme-name');
  const growthStackEl = document.getElementById('growth-stack');
  const listActive = document.getElementById('list-active');
  const listScripts = document.getElementById('list-scripts');
  const listGhosts = document.getElementById('list-ghosts');
  const badgeActive = document.getElementById('badge-active');
  const badgeScripts = document.getElementById('badge-scripts');
  const badgeGhosts = document.getElementById('badge-ghosts');
  const rescanBtn = document.getElementById('rescan-btn');
  const spyContainer = document.getElementById('spy-alerts');

  let currentFingerprint = '';

  async function forceFreshScan() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && !tab.url.startsWith('chrome://')) {
      showLoading(true);
      chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REQUEST' }, () => {
        if (chrome.runtime.lastError) {
          listScripts.innerHTML = '<div class="empty">Please refresh the page to start.</div>';
          return;
        }
        setTimeout(loadResults, 1000);
      });
    }
  }

  async function loadResults() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    const url = new URL(tab.url);
    storeDomainEl.textContent = url.hostname;

    const data = await chrome.storage.local.get([`results_${tab.id}`]);
    const resultsData = data[`results_${tab.id}`];

    if (resultsData) {
      renderCategorizedResults(resultsData);
    }
  }

  function renderCategorizedResults(data) {
    if (!data || !data.results) return;
    const { active, scripts, ghosts, growthStack } = data.results;
    const info = data.storeInfo || {};
    const changes = data.changes || { added: [], removed: [] };

    // MyShopify URL Logic
    const myshopifyUrl = info.shop || '';
    const myshopifyContainer = document.getElementById('myshopify-container');
    const myshopifyEl = document.getElementById('myshopify-url');
    const copyBtn = document.getElementById('copy-myshopify');

    if (myshopifyUrl) {
      myshopifyEl.textContent = myshopifyUrl;
      myshopifyContainer.style.display = 'flex';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(myshopifyUrl);
        const feedback = document.getElementById('copy-feedback');
        feedback.style.opacity = '1';
        copyBtn.style.color = '#008060';
        setTimeout(() => { feedback.style.opacity = '0'; copyBtn.style.color = '#6D7175'; }, 1500);
      };
    } else {
      myshopifyContainer.style.display = 'none';
    }

    const newFingerprint = JSON.stringify({ active, scripts, ghosts, theme: info.theme, changes });
    if (newFingerprint === currentFingerprint && document.querySelector('.app-card')) return;
    currentFingerprint = newFingerprint;

    activeCountEl.textContent = active.length;
    themeNameEl.textContent = info.theme || 'Unknown';
    if (growthStackEl) growthStackEl.textContent = growthStack || "Standard Architecture";
    
    badgeActive.textContent = active.length;
    badgeScripts.textContent = scripts.length;
    badgeGhosts.textContent = ghosts.length;

    // Spy Alerts
    spyContainer.innerHTML = '';
    if (changes.added && changes.added.length > 0) {
      spyContainer.innerHTML = `<div class="alert-banner">🚀 NEW APPS DETECTED: ${changes.added.map(a => a.name).join(', ')}</div>`;
    }

    renderSection(listActive, active, 'active', changes.added || []);
    renderSection(listScripts, scripts, 'script');
    renderSection(listGhosts, ghosts, 'ghost');
  }

  function renderSection(container, apps, type, addedApps = []) {
    if (!apps || apps.length === 0) {
      container.innerHTML = `<div class="empty">No detections</div>`;
      return;
    }
    container.innerHTML = apps.map((app, index) => {
      const name = app.name || 'Unknown';
      const iconChar = name.charAt(0).toUpperCase();
      const isNew = addedApps.some(a => a.name === name);
      
      let tagText = 'Trace';
      if (type === 'active') tagText = isNew ? 'NEW' : 'Active';
      else if (type === 'ghost') tagText = 'Residual';
      else tagText = 'Script';

      const altHtml = app.alternative ? `
        <div style="margin-top:8px; padding:8px; background:rgba(0,128,96,0.05); border-radius:6px; font-size:9px; color:#008060; border-left:2px solid #008060; line-height:1.2;">
          <strong>TIP:</strong> Try <strong>${app.alternative.name}</strong> - ${app.alternative.reason}
        </div>` : '';

      return `
        <div class="app-card" style="animation-delay: ${index * 0.05}s">
          <div style="display:flex; align-items:center; gap:12px; width:100%;">
            <div class="app-icon">${iconChar}</div>
            <div class="app-details">
              <div class="app-name">${name}</div>
              <div class="app-meta"><span>${app.category || 'Ecommerce'}</span><span class="tag">${tagText}</span></div>
            </div>
          </div>
          ${altHtml}
        </div>`;
    }).join('');
  }

  function showLoading(show) {
    if (show) {
      // Clear outer columns
      listActive.innerHTML = ''; 
      listGhosts.innerHTML = '';
      spyContainer.innerHTML = '';
      // Put loader in the middle (Scripts column)
      listScripts.innerHTML = `
        <div class="rescan-loading">
          <div class="spinner"></div>
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8;">
            Analyzing Architecture...
          </div>
        </div>`;
    }
  }

  rescanBtn.addEventListener('click', forceFreshScan);
  forceFreshScan();
  chrome.storage.onChanged.addListener(loadResults);
});
