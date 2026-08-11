#!/usr/bin/env python3
"""Build the MoneyTracker web app for GitHub Pages.

The source index.html is intentionally kept readable/monolithic for now. This
build step moves its large inline stylesheet and inline scripts into cacheable
static assets, preserving execution order and Firebase module semantics.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_site"


def extract_blocks(text: str, pattern: str):
    return list(re.finditer(pattern, text, flags=re.I | re.S))


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    index = (ROOT / "index.html").read_text(encoding="utf-8")

    # Keep the source style.css (small compatibility styles) and append the
    # large stylesheet from index.html into the generated cacheable CSS file.
    style_matches = extract_blocks(index, r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks = []
    for m in style_matches:
        css_chunks.append(m.group(1).strip())
    existing_css = ROOT / "style.css"
    if existing_css.exists():
        css_chunks.insert(0, existing_css.read_text(encoding="utf-8"))
    (OUT / "style.css").write_text("\n\n".join(css_chunks).strip() + "\n", encoding="utf-8")
    index = re.sub(r"\s*<style(?:\s[^>]*)?>.*?</style>\s*", "\n  <link rel=\"stylesheet\" href=\"./style.css\">\n", index, flags=re.I | re.S)

    # Remove the manually injected external AI parser tag. It is loaded by the
    # idle loader below so it cannot delay first paint.
    index = re.sub(
        r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>\s*",
        "\n",
        index,
        flags=re.I,
    )

    # Extract every inline script in source order. Module scripts remain module
    # scripts; classic scripts are deferred. Execution order is preserved.
    script_matches = extract_blocks(index, r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>")
    script_tags = []
    script_no = 0
    for m in script_matches:
        attrs = m.group("attrs") or ""
        body = m.group("body")
        # Only extract inline scripts. External scripts are kept as-is.
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            continue
        script_no += 1
        is_module = bool(re.search(r"\btype\s*=\s*[\"']module[\"']", attrs, flags=re.I))
        name = f"inline-{script_no:02d}.js"
        # Files now live under _site/js, so root-relative application assets
        # must point one level up.
        body = body.replace("'/sw.js'", "'../sw.js'").replace('"/sw.js"', '"../sw.js"')
        body = body.replace("'/manifest.json'", "'../manifest.json'").replace('"/manifest.json"', '"../manifest.json"')
        body = body.replace("'/ai_parser.js", "'../ai_parser.js").replace('"/ai_parser.js', '"../ai_parser.js')
        (OUT / "js").mkdir(exist_ok=True)
        (OUT / "js" / name).write_text(body.strip() + "\n", encoding="utf-8")
        if is_module:
            script_tags.append(f'  <script type="module" src="./js/{name}"></script>')
        else:
            script_tags.append(f'  <script defer src="./js/{name}"></script>')

    # Replace inline scripts in one pass while leaving external scripts alone.
    counter = 0
    def replace_script(m: re.Match[str]) -> str:
        nonlocal counter
        attrs = m.group("attrs") or ""
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            return m.group(0)
        counter += 1
        return "\n" + script_tags[counter - 1] + "\n"

    index = re.sub(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", replace_script, index, flags=re.I | re.S)

    # Make GitHub Pages project URLs relative instead of domain-root absolute.
    index = index.replace('href="/manifest.json"', 'href="./manifest.json"')
    index = index.replace("href='/manifest.json'", "href='./manifest.json'")
    index = re.sub(r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>", "", index, flags=re.I)

    # Add a tiny idle loader. It loads the AI parser only after the first paint
    # (or immediately on the first user interaction), rather than blocking app startup.
    loader = """
<script>
(() => {
  let loaded = false;
  const loadAI = () => {
    if (loaded) return;
    loaded = true;
    const s = document.createElement('script');
    s.src = './ai_parser.js?v=3';
    s.async = true;
    s.onerror = () => { loaded = false; };
    document.head.appendChild(s);
  };
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
  idle(loadAI, { timeout: 2500 });
  window.addEventListener('pointerdown', loadAI, { once: true, passive: true });
  window.addEventListener('keydown', loadAI, { once: true, passive: true });
})();
</script>
"""
    # The loader is tiny and intentionally inline; this is the only remaining
    # script in HTML and is not application logic.
    index = index.replace("</body>", loader + "\n</body>", 1)

    (OUT / "index.html").write_text(index, encoding="utf-8")

    # Copy the other web assets. migrate.html is deliberately excluded from
    # production Pages because it is an admin/migration utility.
    for name in ["auth.html", "manifest.json", "sw.js", "ai_parser.js", "icon.png"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    print(f"Built {OUT} with {script_no} extracted inline scripts and {len(css_chunks)} CSS sources.")


if __name__ == "__main__":
    main()
