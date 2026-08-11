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
    # large stylesheet from index.html into one cacheable production CSS file.
    style_matches = extract_blocks(index, r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks = [m.group(1).strip() for m in style_matches]
    existing_css = ROOT / "style.css"
    if existing_css.exists():
        css_chunks.insert(0, existing_css.read_text(encoding="utf-8"))
    (OUT / "style.css").write_text("\n\n".join(css_chunks).strip() + "\n", encoding="utf-8")
    index = re.sub(
        r"\s*<style(?:\s[^>]*)?>.*?</style>\s*",
        "\n  <link rel=\"stylesheet\" href=\"./style.css\">\n",
        index,
        flags=re.I | re.S,
    )

    # The old deployment workflow injected this tag. The parser is now loaded
    # asynchronously after the first paint, so it cannot delay application boot.
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
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            continue
        script_no += 1
        is_module = bool(re.search(r"\btype\s*=\s*[\"']module[\"']", attrs, flags=re.I))
        name = f"inline-{script_no:02d}.js"
        # Extracted files live under _site/js, so application root-relative
        # asset references must point one directory upward.
        body = body.replace("'/sw.js'", "'../sw.js'").replace('"/sw.js"', '"../sw.js"')
        body = body.replace("'/manifest.json'", "'../manifest.json'").replace('"/manifest.json"', '"../manifest.json"')
        body = body.replace("'/ai_parser.js", "'../ai_parser.js").replace('"/ai_parser.js', '"../ai_parser.js')
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

    # GitHub Pages is a project site, so use relative asset URLs.
    index = index.replace('href="/manifest.json"', 'href="./manifest.json"')
    index = index.replace("href='/manifest.json'", "href='./manifest.json'")
    index = re.sub(
        r"\s*<script\s+src=[\"']/?ai_parser\.js(?:\?[^\"']*)?[\"']\s*></script>",
        "",
        index,
        flags=re.I,
    )

    # Load the AI parser during an idle period. It is not needed to render the
    # main screen, so it no longer competes with the initial application boot.
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
})();
</script>
"""
    index = index.replace("</body>", loader + "\n</body>", 1)

    (OUT / "index.html").write_text(index, encoding="utf-8")

    # Copy remaining web assets. migrate.html is deliberately excluded from
    # public production Pages because it is an admin/migration utility.
    for name in ["auth.html", "manifest.json", "sw.js", "ai_parser.js", "icon.png"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    print(f"Built {OUT} with {script_no} extracted inline scripts and {len(css_chunks)} CSS sources.")


if __name__ == "__main__":
    main()
