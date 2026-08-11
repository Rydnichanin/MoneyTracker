#!/usr/bin/env python3
"""Build the MoneyTracker web app for GitHub Pages."""
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

    # Move the large inline stylesheet into a cacheable asset.
    style_matches = extract_blocks(index, r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks = [m.group(1).strip() for m in style_matches]
    existing_css = ROOT / "style.css"
    if existing_css.exists():
        css_chunks.insert(0, existing_css.read_text(encoding="utf-8"))
    css = "\n\n".join(c for c in css_chunks if c).strip() + "\n"
    (OUT / "style.css").write_text(css, encoding="utf-8")
    index = re.sub(
        r"\s*<style(?:\s[^>]*)?>.*?</style>\s*",
        "\n  <link rel=\"stylesheet\" href=\"./style.css\">\n",
        index,
        flags=re.I | re.S,
    )

    # Remove any legacy parser tag injected by older workflows.
    index = re.sub(
        r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>\s*",
        "\n",
        index,
        flags=re.I,
    )

    # Extract inline scripts in source order. Modules remain modules; classic
    # scripts become deferred cacheable files.
    script_matches = extract_blocks(index, r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>")
    script_tags: list[str] = []
    script_no = 0
    for m in script_matches:
        attrs = m.group("attrs") or ""
        body = m.group("body")
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            continue
        script_no += 1
        is_module = bool(re.search(r"\btype\s*=\s*[\"']module[\"']", attrs, flags=re.I))
        name = f"inline-{script_no:02d}.js"
        body = body.replace("'/sw.js'", "'../sw.js'").replace('"/sw.js"', '"../sw.js"')
        body = body.replace("'/manifest.json'", "'../manifest.json'").replace('"/manifest.json"', '"../manifest.json"')
        (OUT / "js").mkdir(exist_ok=True)
        (OUT / "js" / name).write_text(body.strip() + "\n", encoding="utf-8")
        if is_module:
            script_tags.append(f'  <script type="module" src="./js/{name}"></script>')
        else:
            script_tags.append(f'  <script defer src="./js/{name}"></script>')

    counter = 0

    def replace_script(m: re.Match[str]) -> str:
        nonlocal counter
        attrs = m.group("attrs") or ""
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            return m.group(0)
        counter += 1
        return "\n" + script_tags[counter - 1] + "\n"

    index = re.sub(
        r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>",
        replace_script,
        index,
        flags=re.I | re.S,
    )

    index = index.replace('href="/manifest.json"', 'href="./manifest.json"')
    index = index.replace("href='/manifest.json'", "href='./manifest.json'")

    # Keep the parser completely out of the initial HTML. The tiny loader is a
    # normal deferred asset and only injects ai_parser.js during browser idle.
    loader = """(() => {
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
})();
"""
    (OUT / "js" / "ai-loader.js").write_text(loader, encoding="utf-8")
    index = index.replace("</body>", '  <script defer src="./js/ai-loader.js"></script>\n</body>', 1)

    (OUT / "index.html").write_text(index, encoding="utf-8")

    # Copy remaining web assets. migrate.html is intentionally excluded from
    # public production Pages because it is an admin/migration utility.
    for name in ["auth.html", "manifest.json", "sw.js", "ai_parser.js", "icon.png"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    print(f"Built {OUT} with {script_no} extracted inline scripts and {len(css_chunks)} CSS sources.")


if __name__ == "__main__":
    main()
