#!/usr/bin/env python3
"""Build MoneyTracker: load only today at startup; history is on-demand."""
from __future__ import annotations
import re, shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_site"

def extract_blocks(text: str, pattern: str):
    return list(re.finditer(pattern, text, flags=re.I | re.S))

def patch_firebase_module(body: str) -> str:
    body = body.replace("collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, setDoc, arrayUnion, getDoc, initializeFirestore", "collection, addDoc, onSnapshot, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayUnion, getDoc, initializeFirestore")
    body = body.replace("window.fbMethods = { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, setDoc, arrayUnion, getDoc };", "window.fbMethods = { collection, addDoc, onSnapshot, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, setDoc, arrayUnion, getDoc };")
    return body

def patch_startup(body: str) -> str:
    old = '''        setTimeout(() => {
          window.dispatchEvent(new Event("fbReady"));
          // Загружаем адреса из Firebase сразу после авторизации
          if (window.loadCustomAddressesFromFirebase) window.loadCustomAddressesFromFirebase();
        }, 50);'''
    new = '''        // Auth остаётся первым барьером безопасности: все данные запрашиваются только после UID.
        // Не блокируем старт вторичным справочником адресов — он загружается только при открытии нужного раздела.
        window.dispatchEvent(new Event("fbReady"));'''
    if old in body:
        body = body.replace(old, new, 1)
    return body

def patch_priority_loading(body: str) -> str:
    marker = '    fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date","desc")), (snap) => {'
    if marker not in body: return body
    replacement = r'''    // PRIORITY DATA: startup loads TODAY only. History is requested by the filter.
    let todayTx = [];
    let currentRangeCache = new Map();
    const cacheKey = (from, to) => `${from || ''}:${to || ''}`;
    const rebuildToday = () => {
      allTx = todayTx.slice().sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
      window.allTx = allTx;
      currentRangeCache.set(cacheKey(todayForPriority, todayForPriority), allTx.slice());
      window.mtStartupProfiler?.stamp('TODAY_RENDER_READY', `records=${allTx.length}`);
      debouncedRender();
    };
    const loadDateRange = async (from, to, useCache = true) => {
      const key = cacheKey(from, to);
      if (useCache && currentRangeCache.has(key)) {
        allTx = currentRangeCache.get(key).slice(); window.allTx = allTx; debouncedRender(); return;
      }
      const constraints = [fbMethods.where("date", ">=", from)];
      if (to) constraints.push(fbMethods.where("date", "<=", to));
      constraints.push(fbMethods.orderBy("date", "desc"));
      window.mtStartupProfiler?.stamp('HISTORY_QUERY_START', `${from}..${to||''}`);
      const snap = await fbMethods.getDocs(fbMethods.query(txRef, ...constraints));
      window.mtStartupProfiler?.stamp('HISTORY_QUERY_END');
      const requested=[]; snap.forEach(d=>requested.push({id:d.id,...d.data()}));
      currentRangeCache.set(key, requested.slice()); allTx=requested; window.allTx=allTx; debouncedRender();
    };
    const todayForPriority = getToday();
    const todayQuery = fbMethods.query(txRef, fbMethods.where("date", "==", todayForPriority), fbMethods.orderBy("date", "desc"));
    window.mtStartupProfiler?.stamp('TODAY_QUERY_START', todayForPriority);
    fbMethods.onSnapshot(todayQuery, (snap) => {
      todayTx=[]; snap.forEach(d=>todayTx.push({id:d.id,...d.data()}));
      window.mtStartupProfiler?.stamp('TODAY_SNAPSHOT_RECEIVED', `records=${todayTx.length}`);
      rebuildToday(); setRange('today');
      if (document.getElementById('historySheet')?.classList.contains('open')) renderHistorySheet();
    });'''
    body=body.replace(marker,replacement)
    old='''      } else { f.value=""; t.value=""; dateRow.style.display='none'; }
      render();'''
    new='''      } else { f.value=""; t.value=""; dateRow.style.display='none'; }
      if (mode === 'today') { allTx=todayTx.slice(); window.allTx=allTx; render(); return; }
      if (mode === 'yesterday') { const y=f.value; loadDateRange(y,y).then(()=>render()).catch(e=>{console.warn('[Priority] Yesterday load failed:',e.message);render();}); return; }
      if (mode === 'all') { loadDateRange('0000-01-01','9999-12-31',false).then(()=>render()).catch(e=>{console.warn('[Priority] Full history load failed:',e.message);render();}); return; }
      if (mode === 'custom') { const from=f.value, to=t.value||from; if(!from){render();return;} loadDateRange(from,to).then(()=>render()).catch(e=>{console.warn('[Priority] Custom range load failed:',e.message);render();}); return; }
      render();'''
    if old in body: body=body.replace(old,new,1)
    return body

def main() -> None:
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index=(ROOT/"index.html").read_text(encoding="utf-8")
    style_matches=extract_blocks(index,r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks=[m.group(1).strip() for m in style_matches]
    existing_css=ROOT/"style.css"
    if existing_css.exists(): css_chunks.insert(0,existing_css.read_text(encoding="utf-8"))
    (OUT/"style.css").write_text("\n\n".join(c for c in css_chunks if c).strip()+"\n",encoding="utf-8")
    index=re.sub(r"\s*<style(?:\s[^>]*)?>.*?</style>\s*",'\n  <link rel="stylesheet" href="./style.css">\n',index,flags=re.I|re.S)
    index=re.sub(r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>\s*","\n",index,flags=re.I)
    script_matches=extract_blocks(index,r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>")
    script_tags=[]; script_no=0
    for match in script_matches:
        attrs=match.group("attrs") or ""; body=match.group("body")
        if re.search(r"\bsrc\s*=",attrs,flags=re.I): continue
        script_no+=1; is_module=bool(re.search(r"\btype\s*=\s*[\"']module[\"']",attrs,flags=re.I))
        if is_module: body=patch_firebase_module(body)
        body=patch_startup(body)
        body=patch_priority_loading(body); name=f"inline-{script_no:02d}.js"
        body=body.replace("'/sw.js'","'../sw.js'").replace('"/sw.js"','"../sw.js"').replace("'/manifest.json'","'../manifest.json'").replace('"/manifest.json"','"../manifest.json"')
        (OUT/"js").mkdir(exist_ok=True); (OUT/"js"/name).write_text(body.strip()+"\n",encoding="utf-8")
        script_tags.append(f'  <script {"type=\"module\" " if is_module else "defer "}src="./js/{name}"></script>')
    counter=0
    def replace_script(match):
        nonlocal counter
        attrs=match.group("attrs") or ""
        if re.search(r"\bsrc\s*=",attrs,flags=re.I): return match.group(0)
        counter+=1; return "\n"+script_tags[counter-1]+"\n"
    index=re.sub(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>",replace_script,index,flags=re.I|re.S)
    index=index.replace('href="/manifest.json"','href="./manifest.json"').replace("href='/manifest.json'","href='./manifest.json'")
    index=re.sub(r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>","",index,flags=re.I)
    (OUT/"js").mkdir(exist_ok=True)
    loader=ROOT/"js"/"ai-loader.js"
    if loader.exists(): shutil.copy2(loader,OUT/"js"/"ai-loader.js"); index=index.replace("</head>",'  <script defer src="./js/ai-loader.js"></script>\n</head>',1)
    profiler=ROOT/"js"/"startup-profiler.js"
    if profiler.exists(): shutil.copy2(profiler,OUT/"js"/"startup-profiler.js"); index=index.replace("</head>",'  <script defer src="./js/startup-profiler.js"></script>\n</head>',1)
    for name in ["auth.html","manifest.json","sw.js","ai_parser.js","icon.png"]:
        src=ROOT/name
        if src.exists(): shutil.copy2(src,OUT/name)
    (OUT/"index.html").write_text(index,encoding="utf-8")
    print(f"Built {OUT}: {script_no} scripts, Auth-first + today-only startup + on-demand history enabled.")
if __name__=="__main__": main()
