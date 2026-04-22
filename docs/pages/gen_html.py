#!/usr/bin/env python3
# docs/pages/gen_html.py
# VERSION: 2.8.0

import os, re, json, html as _html
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
DOCS_DIR = BASE / "docs"
PAGES_DIR = BASE / "docs" / "pages"
FEATURES_DIR = BASE / "features"

def read_state():
    try:
        return json.loads((BASE / ".devsop-state.json").read_text())
    except:
        return {}

state = read_state()
APP_NAME = state.get("project_name") or BASE.name
GITHUB_REPO = state.get("github_repo", "")
if not GITHUB_REPO:
    try:
        import subprocess
        _url = subprocess.check_output(["git","remote","get-url","origin"], cwd=str(BASE), stderr=subprocess.DEVNULL).decode().strip()
        GITHUB_REPO = _url.removesuffix(".git") if _url.endswith(".git") else _url
    except:
        pass

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>__TITLE__ — __APP__</title>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css">
</head>
<body>
  <header class="top-nav">
    <a href="index.html" class="nav-brand">__APP__</a>
    <div class="nav-controls">
      <div class="search-wrap">
        <input class="search-input" type="search" placeholder="搜尋文件...">
        <div class="search-results"></div>
      </div>
      __GH_LINK__
      <button class="sidebar-toggle" id="sidebarToggle" title="收合/展開側欄">☰</button>
    </div>
  </header>
  <div class="doc-page-banner">
    <p class="banner-breadcrumb">__BREADCRUMB__</p>
    <h1 class="banner-title">__BANNER__</h1>
  </div>
  <div class="page-wrapper">
    <aside class="sidebar" aria-label="文件導覽">
      <div class="sidebar__section">
        <div class="sidebar__label">文件</div>
        __SIDEBAR__
      </div>
    </aside>
    <div class="sidebar-resizer" id="sidebarResizer"></div>
    <main class="doc-content">__CONTENT__</main>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({startOnLoad:true,theme:'default',
      flowchart:{curve:'basis',nodeSpacing:60,rankSpacing:80},
      er:{layoutDirection:'TD',minEntityWidth:100,fontSize:12},
      sequence:{actorMargin:60,messageMargin:30}});
  </script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-sql.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-typescript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>"""

def esc(t): return _html.escape(str(t))

def inline_md(text):
    codes = {}
    def save(m):
        k = f"\x00C{len(codes)}\x00"
        codes[k] = f"<code>{esc(m.group(1))}</code>"
        return k
    text = re.sub(r'`([^`]+)`', save, text)
    text = esc(text)
    for k, v in codes.items():
        text = text.replace(esc(k), v)
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1" loading="lazy">', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\w)__(.+?)__(?!\w)', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'<em>\1</em>', text)
    return text

def build_table(table_lines):
    rows = []
    for line in table_lines:
        if re.match(r'^\|[\s\-:|]+\|$', line.strip()): continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)
    if not rows: return ''
    out = ['<table>']
    out.append('<tr>' + ''.join(f'<th>{inline_md(c)}</th>' for c in rows[0]) + '</tr>')
    for row in rows[1:]:
        out.append('<tr>' + ''.join(f'<td>{inline_md(c)}</td>' for c in row) + '</tr>')
    out.append('</table>')
    return '\n'.join(out)

def md_to_html(text):
    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith('```mermaid'):
            block = []
            i += 1
            while i < len(lines) and lines[i].strip() != '```':
                block.append(lines[i]); i += 1
            out.append('<div class="diagram-container"><pre class="mermaid">' + '\n'.join(block) + '</pre></div>')
        elif s.startswith('```'):
            lang = s[3:].strip()
            block = []
            i += 1
            while i < len(lines) and lines[i].strip() != '```':
                block.append(esc(lines[i])); i += 1
            cls = f'language-{lang}' if lang else ''
            out.append(f'<pre><code class="{cls}">' + '\n'.join(block) + '</code></pre>')
        elif s.startswith('#### '): out.append(f'<h4>{inline_md(s[5:])}</h4>')
        elif s.startswith('### '): out.append(f'<h3>{inline_md(s[4:])}</h3>')
        elif s.startswith('## '): out.append(f'<h2>{inline_md(s[3:])}</h2>')
        elif s.startswith('# '): out.append(f'<h1>{inline_md(s[2:])}</h1>')
        elif re.match(r'^[-*_]{3,}$', s): out.append('<hr>')
        elif s.startswith('> '): out.append(f'<blockquote><p>{inline_md(s[2:])}</p></blockquote>')
        elif s.startswith('|') and '|' in s[1:]:
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i]); i += 1
            out.append(build_table(table_lines)); continue
        elif re.match(r'^[-*+] ', s):
            items = []
            while i < len(lines):
                raw = lines[i]; stripped = raw.strip()
                indent = len(raw) - len(raw.lstrip())
                if re.match(r'^[-*+] ', stripped):
                    text = stripped[2:]
                    if text.startswith('[ ] '): li = f'<li style="list-style:none"><input type="checkbox" disabled> {inline_md(text[4:])}</li>'
                    elif text.startswith('[x] ') or text.startswith('[X] '): li = f'<li style="list-style:none"><input type="checkbox" checked disabled> {inline_md(text[4:])}</li>'
                    elif indent >= 2: li = f'<li style="margin-left:{indent*0.5}rem">{inline_md(text)}</li>'
                    else: li = f'<li>{inline_md(text)}</li>'
                    items.append(li); i += 1
                else: break
            out.append('<ul>' + ''.join(items) + '</ul>'); continue
        elif re.match(r'^\d+\. ', s):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i].strip()):
                t = re.sub(r'^\d+\. ', '', lines[i].strip())
                items.append(f'<li>{inline_md(t)}</li>'); i += 1
            out.append('<ol>' + ''.join(items) + '</ol>'); continue
        elif s: out.append(f'<p>{inline_md(s)}</p>')
        i += 1
    return '\n'.join(out)

PAGE_META = {
    'index': ('首頁','🏠'), 'idea': ('構想文件 (IDEA)','💡'),
    'brd': ('商業需求文件 (BRD)','📋'), 'prd': ('產品需求文件 (PRD)','📝'),
    'pdd': ('產品設計文件 (PDD)','🎨'), 'edd': ('工程設計文件 (EDD)','🏗️'),
    'arch': ('架構設計','🧩'), 'api': ('API 文件','🔌'),
    'schema': ('Schema 文件','🗄️'), 'test-plan': ('測試計畫','✅'),
    'bdd': ('BDD Scenarios','🧪'), 'diagrams': ('系統圖表','📊'),
    'alignment_report': ('對齊報告','📐'), 'smoke_test_report': ('Smoke Test','🔬'),
    'local_deploy': ('本地部署','🚀'), 'lang': ('語言選型','🔧'),
}

def make_sidebar(pages, current):
    links = []
    for slug, label, icon in pages:
        cls = ' active' if slug == current else ''
        links.append(f'<a class="sidebar__link{cls}" href="{slug}.html">{icon} {label}</a>')
    return '\n'.join(links)

def render_page(content, title, banner, pages, current, is_index=False):
    gh = (f'<a class="nav-gh-link" href="{GITHUB_REPO}" target="_blank" rel="noopener">⌥ GitHub</a>' if GITHUB_REPO else '')
    bc = f'<a href="index.html">{APP_NAME}</a> › {banner}'
    if is_index and GITHUB_REPO:
        bc += f' <span style="margin-left:1rem"><a href="{GITHUB_REPO}" target="_blank" rel="noopener" style="color:var(--banner-link)">⌥ GitHub ↗</a></span>'
    return (HTML_TEMPLATE
            .replace('__TITLE__', title).replace('__APP__', APP_NAME)
            .replace('__GH_LINK__', gh).replace('__BREADCRUMB__', bc)
            .replace('__BANNER__', banner)
            .replace('__SIDEBAR__', make_sidebar(pages, current))
            .replace('__CONTENT__', content))

def main():
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    (PAGES_DIR / "assets").mkdir(exist_ok=True)

    pages = [('index', '首頁', '🏠')]
    known_order = ['IDEA','BRD','PRD','PDD','EDD','ARCH','API','SCHEMA','TEST_PLAN','DIAGRAMS','ALIGNMENT_REPORT','SMOKE_TEST_REPORT','LOCAL_DEPLOY','LANG']
    doc_pages = []
    known_slugs = {'readme'}

    for name in known_order:
        p = DOCS_DIR / f"{name}.md"
        if not p.exists():
            p = DOCS_DIR / f"{name.lower().replace('_','-')}.md"
        if p.exists():
            s = name.lower().replace('_','-')
            known_slugs.add(s)
            label, icon = PAGE_META.get(s, (name.replace('_',' ').title(), '📄'))
            pages.append((s, label, icon))
            doc_pages.append((s, label, p))

    for p in sorted(DOCS_DIR.glob("*.md")):
        s = p.stem.lower().replace('_','-')
        if s in known_slugs: continue
        label = p.stem.replace('_',' ').replace('-',' ').title()
        icon = '📄'
        pages.append((s, label, icon))
        doc_pages.append((s, label, p))
        known_slugs.add(s)

    has_bdd = FEATURES_DIR.exists() and list(FEATURES_DIR.rglob("*.feature"))
    if has_bdd:
        pages.append(('bdd', 'BDD Scenarios', '🧪'))

    search_data = {}

    # index.html
    readme = BASE / "README.md"
    if readme.exists():
        body = md_to_html(readme.read_text(encoding='utf-8', errors='replace'))
    else:
        body = f'<h1>{APP_NAME} 文件中心</h1><p>請從左側導覽列選擇文件。</p>'
    (PAGES_DIR / "index.html").write_text(render_page(body, f'{APP_NAME} 文件中心', f'{APP_NAME} 文件中心', pages, 'index', True), encoding='utf-8')
    search_data["index.html"] = {"url":"index.html","title":"首頁","excerpt": re.sub(r'<[^>]+>','',body)[:150]}
    print("✓ index.html")

    for s, label, p in doc_pages:
        c = md_to_html(p.read_text(encoding='utf-8', errors='replace'))
        exc = re.sub(r'<[^>]+>','',c)[:150]
        (PAGES_DIR / f"{s}.html").write_text(render_page(c, label, label, pages, s), encoding='utf-8')
        search_data[f"{s}.html"] = {"url":f"{s}.html","title":label,"excerpt":exc}
        print(f"✓ {s}.html")

    if has_bdd:
        parts = [f"## {f.relative_to(FEATURES_DIR)}\n\n```gherkin\n{f.read_text(encoding='utf-8', errors='replace')}\n```" for f in sorted(FEATURES_DIR.rglob("*.feature"))]
        c = md_to_html('\n\n'.join(parts))
        (PAGES_DIR / "bdd.html").write_text(render_page(c, "BDD Scenarios", "BDD Scenarios", pages, 'bdd'), encoding='utf-8')
        search_data["bdd.html"] = {"url":"bdd.html","title":"BDD Scenarios","excerpt":"Gherkin Feature Files"}
        print("✓ bdd.html")

    (PAGES_DIR / "search-data.json").write_text(json.dumps(search_data, ensure_ascii=False, indent=2), encoding='utf-8')
    print("✓ search-data.json")
    print(f"\n✅ 完成：{len(search_data)} 頁 → {PAGES_DIR}")

if __name__ == "__main__":
    main()
