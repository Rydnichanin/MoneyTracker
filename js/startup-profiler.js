// Temporary startup profiler. Remove after diagnosis.
(() => {
  const started = performance.now();
  const marks = {};
  const panel = document.createElement('div');
  panel.id = 'mt-startup-profiler';
  panel.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;background:#111;color:#fff;border:1px solid #444;border-radius:12px;padding:10px;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 20px #000;display:none';
  panel.innerHTML = '<b>⚡ MoneyTracker — диагностика загрузки</b><div id="mt-profiler-lines" style="margin-top:6px"></div><button id="mt-profiler-close" style="margin-top:8px;padding:5px 10px;border:1px solid #555;border-radius:7px;background:#222;color:#fff">Скрыть</button>';
  const mount = () => { document.body.appendChild(panel); panel.style.display='block'; document.getElementById('mt-profiler-close').onclick=()=>panel.remove(); };
  const update = () => { const el=document.getElementById('mt-profiler-lines'); if(!el)return; el.innerHTML=Object.entries(marks).map(([k,v])=>`<div>${k}: <b>${v} мс</b></div>`).join(''); };
  const stamp = (name, extra = '') => {
    const ms = Math.round(performance.now() - started);
    marks[name] = ms;
    console.log(`[MoneyTracker] ${name}: ${ms} ms ${extra}`);
    update();
    return ms;
  };
  window.mtStartupProfiler = { started, stamp, marks, report(){ console.table(marks); update(); return {...marks}; } };
  stamp('START');
  window.addEventListener('DOMContentLoaded', () => { mount(); stamp('DOM_READY'); });
  window.addEventListener('load', () => stamp('WINDOW_LOAD'));
})();
