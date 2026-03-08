class MutationDetector {
  constructor(apps) {
    this.apps = Array.isArray(apps) ? apps : [];
    this.observer = null;
    this.scannedScripts = new Set();
    this.maxWaitTime = 10000;
    this.callbacks = [];
    this.startTime = Date.now();
    this.debounceTimer = null;
    this.pendingMutations = new Set();
  }

  start(onDetection, onComplete) {
    if (onDetection && typeof onDetection === 'function') {
      this.onDetection(onDetection);
    }
    this.onComplete = onComplete;
    
    this.scanExistingScripts();
    
    // Safely check if document exists
    if (typeof document === 'undefined') return;

    this.observer = new MutationObserver((mutations) => {
      let needsProcessing = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'SCRIPT' && node.src) {
              this.pendingMutations.add(node.src);
              needsProcessing = true;
            } else if (node.nodeType === Node.ELEMENT_NODE && node.querySelectorAll) {
              try {
                const scripts = node.querySelectorAll('script');
                if (scripts && scripts.length > 0) {
                  scripts.forEach(script => {
                    if (script.src) {
                      this.pendingMutations.add(script.src);
                      needsProcessing = true;
                    }
                  });
                }
              } catch (e) {
                // Ignore querySelectorAll errors on weird nodes
              }
            }
          });
        }
      });
      
      if (needsProcessing) {
        this.queueProcessing();
      }
    });

    if (document.body) {
      this.observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          this.observer.observe(document.body, { childList: true, subtree: true });
        }
      });
    }

    setTimeout(() => this.stop(), this.maxWaitTime);
  }

  scanExistingScripts() {
    try {
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach(script => {
        if (script.src) this.scannedScripts.add(script.src);
      });
    } catch (e) {}
  }

  queueProcessing() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    
    // Debounce processing to avoid duplicate messages and heavy loops
    this.debounceTimer = setTimeout(() => {
      this.processPendingScripts();
    }, 250);
  }

  processPendingScripts() {
    if (this.pendingMutations.size === 0) return;
    
    const isLate = (Date.now() - this.startTime) > 3000;
    const scriptsToCheck = Array.from(this.pendingMutations);
    this.pendingMutations.clear();
    
    scriptsToCheck.forEach(src => {
      if (!src || this.scannedScripts.has(src)) return;
      this.scannedScripts.add(src);
      
      const srcLower = src.toLowerCase();
      
      this.apps.forEach(app => {
        if (!app) return;
        
        if (Array.isArray(app.domains)) {
          for (const domain of app.domains) {
            if (domain && srcLower.includes(domain.toLowerCase())) {
              this.reportDetection(app.name, { url: src, domain, timing: isLate ? 'delayed' : 'early' });
              return;
            }
          }
        }
        
        if (Array.isArray(app.scripts)) {
          for (const scriptName of app.scripts) {
            if (scriptName && srcLower.includes(scriptName.toLowerCase())) {
              this.reportDetection(app.name, { url: src, script: scriptName, timing: isLate ? 'delayed' : 'early' });
              return;
            }
          }
        }
      });
    });
  }

  reportDetection(appName, data) {
    if (!appName) return;
    this.callbacks.forEach(cb => {
      if (typeof cb === 'function') {
        cb({ appName, data });
      }
    });
  }

  onDetection(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.onComplete && typeof this.onComplete === 'function') {
      this.onComplete();
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MutationDetector };
}
