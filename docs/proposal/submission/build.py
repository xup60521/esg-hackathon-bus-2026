# 產生「提案計畫書」HTML 並以 headless Chromium 轉 PDF（A4、上下 2.5 cm、左右 3 cm、主文 12 pt）
import json, ast, subprocess, sys, re, os
here = os.path.dirname(os.path.abspath(__file__))
R = {ast.literal_eval(k): v for k, v in json.load(open(os.path.join(here, "analysis_output.json"))).items()}

def pct(k): v = R[k]; return 100 * v["near"] / v["n"]

# ---------- 圖 1：中途站座位不多比例（休息日，41 席 vs 37 席） ----------
stops = ["桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","魚池","埔里站"]
def bar_svg():
    W, H, L, T = 560, 230, 120, 18
    mx = 25.0
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="各站座位不多比例">']
    for i, st in enumerate(stops):
        y = T + i * 24
        a = pct(("stop", st, True, 41)); b = pct(("stop", st, True, 37))
        s.append(f'<text x="{L-6}" y="{y+13}" text-anchor="end" font-size="11">{st}</text>')
        s.append(f'<rect x="{L}" y="{y}" width="{a/mx*(W-L-50):.1f}" height="9" fill="#2a6f97"/>')
        s.append(f'<text x="{L+a/mx*(W-L-50)+4:.1f}" y="{y+8}" font-size="9.5">{a:.1f}%</text>')
        s.append(f'<rect x="{L}" y="{y+10}" width="{b/mx*(W-L-50):.1f}" height="9" fill="#e07a1f"/>')
        s.append(f'<text x="{L+b/mx*(W-L-50)+4:.1f}" y="{y+18}" font-size="9.5">{b:.1f}%</text>')
    s.append(f'<rect x="{L}" y="{H-14}" width="10" height="8" fill="#2a6f97"/><text x="{L+14}" y="{H-7}" font-size="10">41 席（一般大型客車）</text>')
    s.append(f'<rect x="{L+150}" y="{H-14}" width="10" height="8" fill="#e07a1f"/><text x="{L+164}" y="{H-7}" font-size="10">37 席（通用無障礙大型客車）</text>')
    s.append('</svg>'); return "".join(s)

# ---------- 圖 2：各時段座位不多比例（中途站，41 席） ----------
def line_svg():
    W, H, L, B, T = 450, 175, 38, 28, 12
    hrs = list(range(6, 21)); mx = 14.0
    X = lambda h: L + (h - 6) / 14 * (W - L - 10)
    Y = lambda v: T + (1 - v / mx) * (H - T - B)
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="各時段座位不多比例">']
    for g in (0, 4, 8, 12):
        s.append(f'<line x1="{L}" x2="{W-10}" y1="{Y(g):.1f}" y2="{Y(g):.1f}" stroke="#ddd"/><text x="{L-4}" y="{Y(g)+3:.1f}" text-anchor="end" font-size="12">{g}%</text>')
    for h in hrs:
        if h % 2 == 0: s.append(f'<text x="{X(h):.1f}" y="{H-12}" text-anchor="middle" font-size="12">{h}時</text>')
    for rest, col, lab in ((True, "#2a6f97", "休息日"), (False, "#7a7a7a", "上班日")):
        pts = " ".join(f"{X(h):.1f},{Y(pct(('hour',h,rest,41))):.1f}" for h in hrs if R.get(('hour',h,rest,41),{}).get('n',0) >= 30)
        s.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2"/>')
    s.append(f'<line x1="{L+250}" x2="{L+270}" y1="14" y2="14" stroke="#2a6f97" stroke-width="2"/><text x="{L+274}" y="17" font-size="12">休息日</text>')
    s.append(f'<line x1="{L+320}" x2="{L+340}" y1="14" y2="14" stroke="#7a7a7a" stroke-width="2"/><text x="{L+344}" y="17" font-size="12">上班日</text>')
    s.append('</svg>'); return "".join(s)

def cellrow(k, v):
    w = R[('sub_hour', k[1], k[2], k[3], 37)]
    return (f"<tr><td>{k[1]}</td><td>{k[2]}:00–{k[2]}:59</td><td>{'休息日' if k[3] else '上班日'}</td><td>{v['n']}</td>"
            f"<td>{100*v['near']/v['n']:.1f}%</td><td>{100*w['near']/w['n']:.1f}%</td></tr>")

_cells = [(k, v) for k, v in R.items() if k[0] == 'sub_hour' and k[4] == 41 and v.get('n', 0) >= 150]
_cells.sort(key=lambda kv: -kv[1]['near'] / kv[1]['n'])
hot = "".join(cellrow(k, v) for k, v in _cells[:6])
g = lambda k, f: R[k].get(f, 0)
srows = "".join(
    f"<tr><td>{st}</td><td>{g(('stop',st,True,41),'n_all'):,}</td><td>{g(('stop',st,True,41),'n'):,}</td><td>{pct(('stop',st,True,41)):.1f}%</td>"
    f"<td>{100*g(('stop',st,True,41),'full')/g(('stop',st,True,41),'n'):.1f}%</td><td>{pct(('stop',st,True,37)):.1f}%</td></tr>"
    for st in ["暨南大學校內","桃米坑","暨南大學","九族文化村","牛耳石雕公園","崎下","大雁","埔里站","魚池","日月老茶廠"])
sub_rows = "".join(
    f"<tr><td>{s}</td><td>{g(('sub',s,True,41),'n_all')+g(('sub',s,False,41),'n_all'):,}</td><td>{g(('sub',s,True,41),'n')+g(('sub',s,False,41),'n'):,}</td>"
    f"<td>{100*g(('sub',s,False,41),'near')/max(g(('sub',s,False,41),'n'),1):.1f}%</td><td>{100*g(('sub',s,True,41),'near')/max(g(('sub',s,True,41),'n'),1):.1f}%</td></tr>"
    for s in ["6670A","6670B","6670F","6670D","6670H","6670E"])


def conc_svg():
    r = json.load(open(os.path.join(here, "analysis", "dispatch", "v3", "out", "results.json")))
    cv = r["cap41"]["curve"]
    W, H, L, B, T = 450, 204, 40, 40, 14
    X = lambda k: L + (k - 1) / 29 * (W - L - 12)
    Y = lambda v: T + (1 - v) * (H - T - B)
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="熱點窗口集中度">']
    for v in (0, .2, .4, .6, .8):
        s.append(f'<line x1="{L}" x2="{W-12}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#ddd"/><text x="{L-4}" y="{Y(v)+4:.1f}" text-anchor="end" font-size="12">{int(v*100)}%</text>')
    for k in (1, 5, 10, 15, 20, 25, 30):
        s.append(f'<text x="{X(k):.1f}" y="{H-24}" text-anchor="middle" font-size="12">{k}</text>')
    up = " ".join(f"{X(p['k']):.1f},{Y(p['ci'][1]):.1f}" for p in cv); lo = " ".join(f"{X(p['k']):.1f},{Y(p['ci'][0]):.1f}" for p in reversed(cv))
    s.append(f'<polygon points="{up} {lo}" fill="#2a6f97" opacity=".18"/>')
    s.append('<path d="' + " ".join(("M" if i == 0 else "L") + f"{X(p['k']):.1f},{Y(p['oracle']):.1f}" for i, p in enumerate(cv)) + '" fill="none" stroke="#888" stroke-dasharray="4 3"/>')
    s.append('<path d="' + " ".join(("M" if i == 0 else "L") + f"{X(p['k']):.1f},{Y(p['random']):.1f}" for i, p in enumerate(cv)) + '" fill="none" stroke="#999"/>')
    s.append('<path d="' + " ".join(("M" if i == 0 else "L") + f"{X(p['k']):.1f},{Y(p['coverage']):.1f}" for i, p in enumerate(cv)) + '" fill="none" stroke="#2a6f97" stroke-width="2.4"/>')
    s.append(f'<text x="{L+6}" y="{T+4}" font-size="12">前 k 個窗口涵蓋率（藍，含 95% 區間）、隨機（灰）、理論上限（虛線）</text>')
    s.append(f'<text x="{(W+L)//2}" y="{H-0}" text-anchor="middle" font-size="12">橫軸 k：窗口數（依訓練期座位不多次數排序）；縱軸：涵蓋率</text></svg>')
    return "".join(s)


def roadmap_svg():
    W, H = 560, 92
    cols = [("#2a6f97", "短期 約 0–2 年", "看見現在、預知到站", "G0 量測 → G1 影子運行"),
            ("#4f8f8b", "中期 約 1–5 年", "需求反應式服務", "G2 保留座；G3 暫不執行"),
            ("#7a7a7a", "長期 約 5 年以上", "完整基礎建設", "願景，不是承諾")]
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="三階段路線">']
    for i, (c, a, b, g) in enumerate(cols):
        x = 4 + i * 184
        s.append(f'<polygon points="{x},6 {x+170},6 {x+184},34 {x+170},62 {x},62 {x+14},34" fill="{c}"/>')
        s.append(f'<text x="{x+92}" y="27" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">{a}</text>')
        s.append(f'<text x="{x+92}" y="47" text-anchor="middle" font-size="13" fill="#fff">{b}</text>')
        s.append(f'<text x="{x+92}" y="82" text-anchor="middle" font-size="12" fill="#333">{g}</text>')
    s.append('</svg>')
    return "".join(s)

body = open(os.path.join(here, "content.html")).read()
body = (body.replace("{{ROADMAP}}", "<figure class='rm'>"+roadmap_svg()+"</figure>").replace("{{LINE}}", line_svg()).replace("{{CONC}}", conc_svg()).replace("{{STOPROWS}}", srows)
            .replace("{{HOTROWS}}", hot).replace("{{SUBROWS}}", sub_rows))
css = """
@page { size: A4; margin: 2.5cm 3cm; }
body { font-family: 'Noto Sans CJK TC','Noto Sans TC',sans-serif; font-size: 12pt; line-height: normal; color:#111; }
h1 { font-size: 18pt; margin: 0 0 6pt; break-after: avoid; } h2 { font-size: 14pt; margin: 12pt 0 4pt; break-after: avoid; } h3 { font-size: 12pt; margin: 8pt 0 3pt; break-after: avoid; }
p { margin: 0 0 5pt; text-align: justify; } ul, ol { margin: 0 0 5pt 1.2em; padding: 0; } li { margin: 0 0 2pt; }
table { border-collapse: collapse; width: 100%; margin: 3pt 0 6pt; font-size: 11pt; line-height: normal; }
table { break-inside: auto; } tr { break-inside: avoid; } thead { display: table-header-group; }
th, td { border: 0.5pt solid #666; padding: 2pt 4pt; vertical-align: top; } th { background: #eee; }
table.big tr { break-inside: auto; }
.ref { font-size: 11pt; margin: 4pt 0; }
.cap { font-size: 11pt; margin: 0 0 6pt; color:#333; } .cover { page-break-after: always; text-align: center; padding-top: 5cm; }
.cover h1 { font-size: 24pt; } .small { font-size: 10.5pt; } figure { margin: 4pt 0 2pt; text-align: center; } figure svg { width: 80%; } figure.rm svg { width: 100%; }
"""
html = f"<!doctype html><html lang='zh-TW'><head><meta charset='utf-8'><title>提案計畫書</title><style>{css}</style></head><body>{body}</body></html>"
out_html = os.path.join(here, "proposal.html"); open(out_html, "w").write(html)
chrome = os.path.expanduser("~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome")
out_pdf = os.path.join(here, "proposal.pdf")
subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", f"--print-to-pdf={out_pdf}", "--no-pdf-header-footer", f"file://{out_html}"], check=True, capture_output=True)
pdf = open(out_pdf, "rb").read()
pages = len(re.findall(rb"/Type\s*/Page[^s]", pdf))
print("總頁數（含封面）:", pages, "→ 不含封面:", pages - 1)
