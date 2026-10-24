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
    import_pattern = r'(import\s*\{)([^}]*)(\}\s*from\s*["\'][^"\']*firebase-firestore\.js["\'])'
    import_match = re.search(import_pattern, body)
    if not import_match:
        raise ValueError("Firebase Firestore import was not found in the production module")

    imported_names = [name.strip() for name in import_match.group(2).split(",") if name.strip()]
    for name in ("where", "getDocs"):
        if name not in imported_names:
            imported_names.append(name)
    updated_import = import_match.group(1) + " " + ", ".join(imported_names) + " " + import_match.group(3)
    body = body[:import_match.start()] + updated_import + body[import_match.end():]

    methods_pattern = r'(window\.fbMethods\s*=\s*\{)([^}]*)(\})'
    methods_match = re.search(methods_pattern, body)
    if not methods_match:
        raise ValueError("Firebase method registry was not found in the production module")
    methods = [name.strip() for name in methods_match.group(2).split(",") if name.strip()]
    for name in ("where", "getDocs"):
        if name not in methods:
            methods.append(name)
    updated_methods = methods_match.group(1) + " " + ", ".join(methods) + " " + methods_match.group(3)
    return body[:methods_match.start()] + updated_methods + body[methods_match.end():]

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
    start = body.find(marker)
    if start == -1:
        return body
    end_marker = '    document.getElementById("txForm").onsubmit ='
    end = body.find(end_marker, start)
    if end == -1:
        raise ValueError("Transaction listener end was not found; priority loading was not applied")
    replacement = r'''    // PRIORITY DATA: startup loads TODAY only. History is requested by the filter.
    let todayTx = [];
    let currentRangeCache = new Map();
    const cacheKey = (from, to) => `${from || ''}:${to || ''}`;
    const rebuildToday = () => {
      const now = Date.now();
      pendingTx = pendingTx.filter(p => !todayTx.some(s => s.createdAt === p.createdAt) && (now - p.createdAt) < 15000);
      allTx = [...pendingTx.filter(p => p.date === todayForPriority), ...todayTx]
        .sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
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
    }, (error) => {
      window.mtStartupProfiler?.stamp('TODAY_SNAPSHOT_ERROR', error.message);
      console.error('[Priority] Today data failed to load:', error);
      window.showToast('⚠️ ' + (window.firebaseErrorRu ? window.firebaseErrorRu(error) : 'Firebase не выполнил запрос. Проверьте интернет и попробуйте ещё раз.'), 'error');
    });'''
    body=body[:start] + replacement + "\n\n" + body[end:]
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

def validate_priority_artifact() -> None:
    modules = list((OUT / "js").glob("inline-*.js"))
    firebase_module = next((path.read_text(encoding="utf-8") for path in modules
                            if "firebase-firestore.js" in path.read_text(encoding="utf-8")), "")
    firestore_import = re.search(
        r'import\s*\{([^}]*)\}\s*from\s*["\'][^"\']*firebase-firestore\.js["\']',
        firebase_module,
    )
    if not firestore_import:
        raise ValueError("Production Firebase Firestore import is missing")
    imported = {name.strip() for name in firestore_import.group(1).split(",")}
    if not {"where", "getDocs"}.issubset(imported):
        raise ValueError("Production Firebase query methods are not imported")
    if not re.search(r'window\.fbMethods\s*=\s*\{[^}]*\bwhere\b[^}]*\bgetDocs\b', firebase_module):
        raise ValueError("Production Firebase query methods are not exposed")

    transaction_module = "\n".join(path.read_text(encoding="utf-8") for path in modules)
    required = (
        'where("date", "==", todayForPriority)',
        "TODAY_SNAPSHOT_ERROR",
        "loadDateRange",
        "_transactionRenderInProgress",
        "function renderTransactionView()",
    )
    if any(marker not in transaction_module for marker in required):
        raise ValueError("Production priority transaction loading is incomplete")
    if "window.safeRender()" in transaction_module:
        raise ValueError("Production artifact contains a recursive safe-render call")
    if 'fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date","desc"))' in transaction_module:
        raise ValueError("Production artifact contains the obsolete full-history listener")

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
    for name in ["auth.html","manifest.json","sw.js","ai_parser.js","icon.png","version.json"]:
        src=ROOT/name
        if src.exists(): shutil.copy2(src,OUT/name)
    (OUT/"index.html").write_text(index,encoding="utf-8")
    validate_priority_artifact()
    print(f"Built {OUT}: {script_no} scripts, Auth-first + today-only startup + on-demand history enabled.")
if __name__=="__main__": main()
