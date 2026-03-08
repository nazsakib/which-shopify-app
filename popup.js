document.addEventListener('DOMContentLoaded', async () => {
  const storeDomainEl = document.getElementById('store-domain');
  const activeCountEl = document.getElementById('active-count');
  const themeNameEl = document.getElementById('theme-name');
  const listActive = document.getElementById('list-active');
  const listScripts = document.getElementById('list-scripts');
  const listGhosts = document.getElementById('list-ghosts');
  const badgeActive = document.getElementById('badge-active');
  const badgeScripts = document.getElementById('badge-scripts');
  const badgeGhosts = document.getElementById('badge-ghosts');
  const rescanBtn = document.getElementById('rescan-btn');

  let currentFingerprint = '';

  async function forceFreshScan() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && !tab.url.startsWith('chrome://')) {
      showLoading(true);
      chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REQUEST' }, () => {
        if (chrome.runtime.lastError) {
          listActive.innerHTML = '<div class="empty">Please refresh the page to start.</div>';
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
    const { active, scripts, ghosts } = data.results;
    const info = data.storeInfo || {};

    const newFingerprint = JSON.stringify({ active, scripts, ghosts, theme: info.theme });
    if (newFingerprint === currentFingerprint && document.querySelector('.app-card')) return;
    currentFingerprint = newFingerprint;

    activeCountEl.textContent = active.length;
    themeNameEl.textContent = info.theme || 'Unknown';
    badgeActive.textContent = active.length;
    badgeScripts.textContent = scripts.length;
    badgeGhosts.textContent = ghosts.length;

    renderSection(listActive, active, 'active');
    renderSection(listScripts, scripts, 'script');
    renderSection(listGhosts, ghosts, 'ghost');
  }

  function renderSection(container, apps, type) {
    if (!apps || apps.length === 0) {
      container.innerHTML = `<div class="empty">No detections</div>`;
      return;
    }
    container.innerHTML = apps.map((app, index) => {
      const iconChar = app.name.charAt(0).toUpperCase();
      return `
        <div class="app-card" style="animation-delay: ${index * 0.05}s">
          <div class="app-icon">${iconChar}</div>
          <div class="app-details">
            <div class="app-header"><span class="app-name">${app.name}</span></div>
            <div class="app-meta"><span>${app.category}</span><span class="tag ${type === 'active' ? 'active' : ''}">${type === 'active' ? 'Installed' : 'Trace'}</span></div>
          </div>
        </div>`;
    }).join('');
  }

  function showLoading(show) {
    if (show) {
      listActive.innerHTML = '<div class="rescan-loading"><div class="spinner"></div><br>Analyzing Node...</div>';
      listScripts.innerHTML = ''; listGhosts.innerHTML = '';
    }
  }

  rescanBtn.addEventListener('click', forceFreshScan);

  // TRIGGER SCAN ON OPEN
  forceFreshScan();

  chrome.storage.onChanged.addListener(loadResults);
});
