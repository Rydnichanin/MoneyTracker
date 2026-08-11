// Temporary startup profiler. Remove after diagnosis.
(() => {
  const started = performance.now();
  const marks = {};
  const stamp = (name, extra = '') => {
    const ms = Math.round(performance.now() - started);
    marks[name] = ms;
    console.log(`%c[MoneyTracker] ${name}: ${ms} ms ${extra}`, 'font-weight:bold');
    return ms;
  };
  window.mtStartupProfiler = {
    started,
    stamp,
    marks,
    report() {
      console.table(marks);
      return { ...marks };
    }
  };
  stamp('START');
  window.addEventListener('DOMContentLoaded', () => stamp('DOM_READY'));
  window.addEventListener('load', () => stamp('WINDOW_LOAD'));
})();
