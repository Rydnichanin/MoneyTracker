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

  window.loadMoneyTrackerAI = loadAI;

  // AI is secondary functionality. Warm it up only after the first screen has
  // had time to render and the browser is idle. The explicit global also lets
  // the AI screen load it immediately when that feature is opened.
  const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 2500));
  idle(() => loadAI(), { timeout: 5000 });
})();
