#!/usr/bin/env python3
"""Build the MoneyTracker web app for GitHub Pages.

The source index.html remains readable/monolithic. This build step moves its
large inline stylesheet and inline scripts into cacheable static assets while
preserving execution order and Firebase module semantics.
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

    # Move the large inline stylesheet into a cacheable production CSS file.
    style_matches = extract_blocks(index, r"<style(?:\s[^>]*)?>(.*?)</style>")
    css_chunks = [m.group(1).strip() for m in style_matches]
    existing_css = ROOT / "style.css"
    if existing_css.exists():
        css_chunks.insert(0, existing_css.read_text(encoding="utf-8"))
    css = "\n\n".join(chunk for chunk in css_chunks if chunk).strip() + "\n"
    (OUT / "style.css").write_text(css, encoding="utf-8")

    index = re.sub(
        r"\s*<style(?:\s[^>]*)?>.*?</style>\s*",
        "\n  <link rel=\"stylesheet\" href=\"./style.css\">\n",
        index,
        flags=re.I | re.S,
    )

    # Remove any legacy synchronous AI parser tag. The parser is loaded only
    # by js/ai-loader.js after the first screen has rendered.
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
    for match in script_matches:
        attrs = match.group("attrs") or ""
        body = match.group("body")
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

    def replace_script(match: re.Match[str]) -> str:
        nonlocal counter
        attrs = match.group("attrs") or ""
        if re.search(r"\bsrc\s*=", attrs, flags=re.I):
            return match.group(0)
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

    # Keep the lazy loader as a separate cacheable JS file. It contains the
    # only reference to ai_parser.js and is deferred, so the parser cannot
    # compete with the initial HTML/CSS render.
    (OUT / "js").mkdir(exist_ok=True)
    loader = ROOT / "js" / "ai-loader.js"
    if loader.exists():
        shutil.copy2(loader, OUT / "js" / "ai-loader.js")
        index = index.replace(
            "</head>",
            '  <script defer src="./js/ai-loader.js"></script>\n</head>',
            1,
        )

    (OUT / "index.html").write_text(index, encoding="utf-8")

    # Copy remaining production web assets. migrate.html is deliberately
    # excluded from public Pages because it is an admin/migration utility.
    for name in ["auth.html", "manifest.json", "sw.js", "ai_parser.js", "icon.png"]:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    print(f"Built {OUT} with {script_no} extracted inline scripts and {len(css_chunks)} CSS sources.")


if __name__ == "__main__":
    main()
