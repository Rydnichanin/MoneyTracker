// Temporary startup profiler. Remove after diagnosis.
(() => {
  const started = performance.now();
  const marks = {};
  const panel = document.createElement('div');
  panel.id = 'mt-startup-profiler';
  panel.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;background:#111;color:#fff;border:2px solid #fff;border-radius:12px;padding:12px;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.5);display:block;pointer-events:auto';
  panel.innerHTML = '<b>⚡ MoneyTracker — диагностика</b><div id="mt-profiler-lines" style="margin-top:6px">Запуск…</div><button id="mt-profiler-close" style="margin-top:8px;padding:6px 10px;border:1px solid #777;border-radius:7px;background:#222;color:#fff">Скрыть</button>';
  const mount = () => { if (!document.body || panel.parentNode) return; document.body.appendChild(panel); update(); const btn=document.getElementById('mt-profiler-close'); if(btn) btn.onclick=()=>panel.remove(); };
  const update = () => { const el=document.getElementById('mt-profiler-lines'); if(!el)return; el.innerHTML=Object.entries(marks).map(([k,v])=>`<div>${k}: <b>${v} мс</b></div>`).join(''); };
  const stamp = (name, extra = '') => {
    const ms = Math.round(performance.now() - started);
    marks[name] = ms;
    console.log(`[MoneyTracker] ${name}: ${ms} ms ${extra}`);
    mount(); update();
    return ms;
  };
  window.mtStartupProfiler = { started, stamp, marks, report(){ console.table(marks); update(); return {...marks}; } };
  stamp('START');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => stamp('DOM_READY'), {once:true});
  else stamp('DOM_READY');
  window.addEventListener('load', () => stamp('WINDOW_LOAD'), {once:true});
})();
