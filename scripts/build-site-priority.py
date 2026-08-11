#!/usr/bin/env python3
"""Build MoneyTracker with priority Firebase loading: today first, history later."""
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

def patch_priority_loading(body: str) -> str:
    marker = '    fbMethods.onSnapshot(fbMethods.query(txRef, fbMethods.orderBy("date","desc")), (snap) => {'
    if marker not in body:
        return body
    replacement = r'''    // PRIORITY DATA: keep today's records separate from background history.
    let todayTx = [];
    let historyTx = [];
    let fullHistoryLoaded = false;
    let fullHistoryLoading = false;

    const rebuildVisibleTransactions = () => {
      const merged = new Map();
      historyTx.forEach(t => merged.set(t.id, t));
      todayTx.forEach(t => merged.set(t.id, t));
      allTx = Array.from(merged.values()).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      window.allTx = allTx;
      debouncedRender();
    };

    const loadFullHistory = async () => {
      if (fullHistoryLoaded || fullHistoryLoading) return;
      fullHistoryLoading = true;
      try {
        const snap = await fbMethods.getDocs(fbMethods.query(txRef, fbMethods.orderBy("date", "desc")));
        const loaded = [];
        snap.forEach(d => loaded.push({id:d.id, ...d.data()}));
        historyTx = loaded.filter(t => t.date !== todayForPriority);
        fullHistoryLoaded = true;
        rebuildVisibleTransactions();
        if (document.getElementById('historySheet')?.classList.contains('open')) renderHistorySheet();
      } catch (e) {
        console.warn('[Priority] Full history load failed:', e.message);
      } finally {
        fullHistoryLoading = false;
      }
    };

    const scheduleFullHistory = () => {
      if (fullHistoryLoaded || fullHistoryLoading) return;
      const start = () => setTimeout(loadFullHistory, 350);
      if ('requestIdleCallback' in window) requestIdleCallback(start, {timeout:1800});
      else start();
    };

    const loadDateRange = async (from, to) => {
      const constraints = [fbMethods.where("date", ">=", from)];
      if (to) constraints.push(fbMethods.where("date", "<=", to));
      constraints.push(fbMethods.orderBy("date", "desc"));
      const snap = await fbMethods.getDocs(fbMethods.query(txRef, ...constraints));
      const requested = [];
      snap.forEach(d => requested.push({id:d.id, ...d.data()}));
      allTx = requested;
      window.allTx = allTx;
      debouncedRender();
    };

    const todayForPriority = getToday();
    const todayQuery = fbMethods.query(txRef, fbMethods.where("date", "==", todayForPriority), fbMethods.orderBy("date", "desc"));

    fbMethods.onSnapshot(todayQuery, (snap) => {
      todayTx = [];
      snap.forEach(d=>todayTx.push({id:d.id,...d.data()}));
      rebuildVisibleTransactions();
      setRange('today');
      scheduleFullHistory();
      if (document.getElementById('historySheet')?.classList.contains('open')) renderHistorySheet();
    });'''
    body = body.replace(marker, replacement)
    old = '''      } else { f.value=""; t.value=""; dateRow.style.display='none'; }
      render();'''
    new = '''      } else { f.value=""; t.value=""; dateRow.style.display='none'; }
      if (mode === 'yesterday') {
        const y = f.value;
        if (fullHistoryLoaded) render();
        else loadDateRange(y, y).catch(e => { console.warn('[Priority] Yesterday load failed:', e.message); render(); });
        return;
      }
      if (mode === 'all' || mode === 'custom') {
        if (!fullHistoryLoaded) {
          const listEl = document.getElementById('list');
          if (listEl) listEl.innerHTML = '<div class="muted">Загружаю историю…</div>';
          loadFullHistory().then(() => render());
          return;
        }
      }
      render();'''
    if old in body:
        body = body.replace(old, new, 1)
    return body

def main() -> None:
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    style_matches = extract_blocks(index, r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks = [m.group(1).strip() for m in style_matches]
    existing_css = ROOT / "style.css"
    if existing_css.exists(): css_chunks.insert(0, existing_css.read_text(encoding="utf-8"))
    (OUT / "style.css").write_text("\n\n".join(c for c in css_chunks if c).strip()+"\n", encoding="utf-8")
    index = re.sub(r"\s*<style(?:\s[^>]*)?>.*?</style>\s*", '\n  <link rel="stylesheet" href="./style.css">\n', index, flags=re.I|re.S)
    index = re.sub(r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>\s*", "\n", index, flags=re.I)
    script_matches = extract_blocks(index, r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>")
    script_tags=[]; script_no=0
    for match in script_matches:
        attrs=match.group("attrs") or ""; body=match.group("body")
        if re.search(r"\bsrc\s*=", attrs, flags=re.I): continue
        script_no += 1
        is_module=bool(re.search(r"\btype\s*=\s*[\"']module[\"']", attrs, flags=re.I))
        if is_module: body=patch_firebase_module(body)
        body=patch_priority_loading(body)
        name=f"inline-{script_no:02d}.js"
        body=body.replace("'/sw.js'", "'../sw.js'").replace('"/sw.js"','"../sw.js"')
        body=body.replace("'/manifest.json'", "'../manifest.json'").replace('"/manifest.json"','"../manifest.json"')
        (OUT/"js").mkdir(exist_ok=True); (OUT/"js"/name).write_text(body.strip()+"\n", encoding="utf-8")
        script_tags.append(f'  <script {"type=\"module\" " if is_module else "defer "}src="./js/{name}"></script>')
    counter=0
    def replace_script(match):
        nonlocal counter
        attrs=match.group("attrs") or ""
        if re.search(r"\bsrc\s*=", attrs, flags=re.I): return match.group(0)
        counter += 1; return "\n"+script_tags[counter-1]+"\n"
    index=re.sub(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>",replace_script,index,flags=re.I|re.S)
    index=index.replace('href="/manifest.json"','href="./manifest.json"').replace("href='/manifest.json'","href='./manifest.json'")
    index=re.sub(r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>","",index,flags=re.I)
    (OUT/"js").mkdir(exist_ok=True)
    loader=ROOT/"js"/"ai-loader.js"
    if loader.exists():
        shutil.copy2(loader, OUT/"js"/"ai-loader.js"); index=index.replace("</head>",'  <script defer src="./js/ai-loader.js"></script>\n</head>',1)
    for name in ["auth.html","manifest.json","sw.js","ai_parser.js","icon.png"]:
        src=ROOT/name
        if src.exists(): shutil.copy2(src, OUT/name)
    (OUT/"index.html").write_text(index, encoding="utf-8")
    print(f"Built {OUT}: {script_no} scripts, priority Firebase loading enabled.")

if __name__ == "__main__": main()
