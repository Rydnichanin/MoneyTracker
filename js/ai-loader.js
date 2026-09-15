(() => {
  let promise = null;

  function loadAI() {
    if (promise) return promise;

    promise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-ai]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './ai_parser.js?v=3';
      script.async = true;
      script.dataset.moneytrackerAi = '1';
      script.onload = () => resolve();
      script.onerror = () => {
        promise = null;
        reject(new Error('AI parser failed to load'));
      };
      document.head.appendChild(script);
    });

    return promise;
  }

  function loadAddressParser() {
    if (window.__moneyTrackerAddressParserPromise) return window.__moneyTrackerAddressParserPromise;

    window.__moneyTrackerAddressParserPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-address-parser]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './js/address-parser.js?v=1';
      script.async = true;
      script.dataset.moneytrackerAddressParser = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Address parser failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerAddressParserPromise;
  }

  function loadCategoryEditor() {
    if (window.__moneyTrackerCategoryEditorPromise) return window.__moneyTrackerCategoryEditorPromise;

    window.__moneyTrackerCategoryEditorPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-moneytracker-category-editor]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './js/category-editor.js?v=1';
      script.async = true;
      script.dataset.moneytrackerCategoryEditor = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Category editor failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerCategoryEditorPromise;
  }

  window.loadMoneyTrackerAI = loadAI;
  window.loadMoneyTrackerAddressParser = loadAddressParser;
  window.loadMoneyTrackerCategoryEditor = loadCategoryEditor;

  // Address recognition is always enabled. It checks Firebase before applying
  // pattern-based rules, while the AI parser remains secondary functionality.
  loadAddressParser().catch(error => console.warn(error));
  loadCategoryEditor().catch(error => console.warn('[MoneyTracker] Category editor failed to load:', error));

  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 2500));
  idle(() => loadAI(), { timeout: 5000 });
})();
