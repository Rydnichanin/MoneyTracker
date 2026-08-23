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
      script.dataset.moneyTrackerAi = '1';
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
      script.dataset.moneyTrackerAddressParser = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Address parser failed to load'));
      document.head.appendChild(script);
    });

    return window.__moneyTrackerAddressParserPromise;
  }

  window.loadMoneyTrackerAI = loadAI;
  window.loadMoneyTrackerAddressParser = loadAddressParser;

  // Address recognition is always enabled. It checks Firebase before applying
  // pattern-based rules, while the AI parser remains secondary functionality.
  loadAddressParser().catch(error => console.warn(error));

  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 2500));
  idle(() => loadAI(), { timeout: 5000 });
})();
