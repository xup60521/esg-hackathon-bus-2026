#!/usr/bin/env python3
"""Check relative Markdown links in the deliverable's main documents."""
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[2]
files = [root / 'PLAN.zh-TW.md', root / 'README.md', *sorted((root / 'appendix').glob('[A-F]-*.md'))]
count = 0
failures = []
for file in files:
    text = file.read_text(encoding='utf-8')
    for match in re.finditer(r'(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)', text):
        target = unquote(match.group(1))
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        count += 1
        path = (file.parent / parts.path).resolve()
        if not path.is_relative_to(root) or not path.exists():
            failures.append((file.relative_to(root), target))
for file, target in failures:
    print(f'{file}: {target}')
print(f'檢查 {len(files)} 個檔案、{count} 個相對連結；失敗 {len(failures)} 個（僅檢查檔案存在及交付範圍，不檢查錨點）。')
raise SystemExit(bool(failures))
