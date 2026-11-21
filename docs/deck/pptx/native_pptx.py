"""Turns the built deck (docs/deck/deck.html) into an editable PowerPoint.

    node docs/deck/build.mjs        # writes docs/deck/deck.html
    uv run --with python-pptx --with playwright --with lxml --with pillow \
        python docs/deck/pptx/native_pptx.py   # writes $DECK_OUT/deck.pptx

Each slide gets its background as an image, then real shapes, lines and text
boxes on top, so the text stays editable in PowerPoint or Keynote.
"""
import asyncio, base64, io, json, os, re, sys
from playwright.async_api import async_playwright
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_AUTO_SIZE, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE
from pptx.oxml.ns import qn
from lxml import etree

SRC = os.environ.get('DECK_HTML', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'deck.html'))
OUT = os.environ.get('DECK_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out'))
TMP = OUT + '/native-tmp'
CHROME = os.environ.get('CHROME') or None
SW = 1440; SH = 960
EMU = 12192000 / SW          # emu per css px
PT = 960 / SW * 72 / 72 * (72 * 13.333333 / 960)  # pt per css px
PT = 13.333333 * 72 / SW     # = 0.6667

PRINT_CSS = """
@page{size:1440px 960px;margin:0}
html,body{height:auto!important;overflow:visible!important}
.ui-top,.ui-bot,.ui-prog,.nav-hit,.grid-view{display:none!important}
.stage,.canvas{position:static!important;transform:none!important;width:1440px!important;height:auto!important;overflow:visible!important;outline:0!important;border-radius:0!important;inset:auto!important}
#canvas>.slide{position:relative!important;display:grid!important;inset:auto!important}
*{animation:none!important;transition:none!important}
.head::before{display:none!important}
.xn{font-size:64px;font-weight:700;letter-spacing:-0.04em;line-height:.8;color:var(--accent-line);align-self:start;font-variant-numeric:tabular-nums}
.steps>li::before{display:none!important}
.xs{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:700;font-style:normal;margin-bottom:var(--space-xs);box-shadow:0 0 0 4px var(--paper);font-variant-numeric:tabular-nums}
.steps.flow .xs{width:24px;height:24px;font-size:12px;box-shadow:none}
"""
PREP_JS = """() => {
  document.querySelectorAll('.head[data-n]').forEach(h => { const s=document.createElement('span'); s.className='xn'; s.textContent=h.dataset.n; h.prepend(s); });
  document.querySelectorAll('.steps:not(.plain)').forEach(ol => [...ol.children].forEach((li,i) => { const s=document.createElement('i'); s.className='xs'; s.textContent=i+1; li.prepend(s); }));
  const inl = e => getComputedStyle(e).display==='inline';
  document.querySelectorAll('.katex').forEach(k => { if (k.closest('.katex-display')) return; let b=k.parentElement; while (b && inl(b)) b=b.parentElement; if (b) b.setAttribute('data-keep',''); });
}"""
BG_CSS = "#canvas>.slide>*{visibility:hidden!important}"
OV_CSS = """
html,body,.stage,.canvas{background:transparent!important}
#canvas>.slide{background:transparent!important}
#canvas>.slide::before,#canvas>.slide::after{display:none!important}
[data-xs]{background-color:transparent!important;border-color:transparent!important;box-shadow:none!important}
*{-webkit-text-fill-color:transparent!important}
li::marker{color:transparent!important}
.katex,.katex *,[data-keep],[data-keep] *,.xs{-webkit-text-fill-color:currentColor!important}
svg{visibility:hidden!important}
.katex svg{visibility:visible!important}
img{visibility:hidden!important}
"""
SVG_CSS = """
html,body,.stage,.canvas,#canvas>.slide{background:transparent!important}
*{visibility:hidden!important}
svg[data-svg],svg[data-svg] *,symbol,symbol *{visibility:visible!important}
svg[data-svg] text{visibility:hidden!important}
"""

async def capture():
    os.makedirs(TMP, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        pg = await b.new_page(viewport={'width': SW, 'height': SH}, device_scale_factor=2)
        await pg.goto('file://' + SRC); await pg.wait_for_load_state('networkidle'); await pg.wait_for_timeout(1500)
        await pg.add_style_tag(content=PRINT_CSS)
        await pg.evaluate(PREP_JS)
        await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(400)
        data = await pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'native_extract.js')).read())
        slides = pg.locator('#canvas > .slide'); n = await slides.count()
        bg = await pg.add_style_tag(content=BG_CSS)
        for i in range(n): await slides.nth(i).screenshot(path=f'{TMP}/bg-{i:02d}.png')
        await bg.evaluate('e=>e.remove()')
        ov = await pg.add_style_tag(content=OV_CSS)
        for i in range(n): await slides.nth(i).screenshot(path=f'{TMP}/ov-{i:02d}.png', omit_background=True)
        await ov.evaluate('e=>e.remove()')
        await pg.add_style_tag(content=SVG_CSS)
        for i in range(n):
            sv = slides.nth(i).locator('svg[data-svg]')
            for k in range(await sv.count()):
                el = sv.nth(k); idx = await el.get_attribute('data-svg')
                await el.screenshot(path=f'{TMP}/svg-{i:02d}-{int(idx):03d}.png', omit_background=True)
        await b.close()
    json.dump(data, open(TMP + '/data.json', 'w'))
    return data

def e(v): return Emu(int(round(v * EMU)))
def nostyle(shape):
    st = shape._element.find(qn('p:style'))
    if st is not None: shape._element.remove(st)
def color(hexs): return RGBColor.from_string(hexs.upper())

def add_shape(sl, s):
    r = s['radius']; mn = min(s['w'], s['h'])
    kind = MSO_SHAPE.OVAL if r >= mn / 2 - 0.5 and r > 0 else (MSO_SHAPE.ROUNDED_RECTANGLE if r > 0.5 else MSO_SHAPE.RECTANGLE)
    if s['fill'] or s['outline']:
        sh = sl.shapes.add_shape(kind, e(s['x']), e(s['y']), e(s['w']), e(s['h'])); nostyle(sh)
        if kind == MSO_SHAPE.ROUNDED_RECTANGLE: sh.adjustments[0] = min(0.5, r / mn)
        if s['fill']: sh.fill.solid(); sh.fill.fore_color.rgb = color(s['fill'])
        else: sh.fill.background()
        o = s['outline']
        if o:
            sh.line.color.rgb = color(o['c']); sh.line.width = Pt(o['w'] * PT)
            if o['dash']: sh.line.dash_style = MSO_LINE.DASH
        else: sh.line.fill.background()
    if s['sides']:
        x, y, w, h = s['x'], s['y'], s['w'], s['h']
        for k, sd in enumerate(s['sides']):
            if not sd: continue
            hw = sd['w'] / 2
            pts = [(x, y + hw, x + w, y + hw), (x + w - hw, y, x + w - hw, y + h), (x, y + h - hw, x + w, y + h - hw), (x + hw, y, x + hw, y + h)][k]
            ln = sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, e(pts[0]), e(pts[1]), e(pts[2]), e(pts[3])); nostyle(ln)
            ln.line.color.rgb = color(sd['c']); ln.line.width = Pt(sd['w'] * PT)
            if sd['dash']: ln.line.dash_style = MSO_LINE.DASH

def add_text(sl, t):
    single = t['lines'] <= 1
    w = t['w'] + 2 if single else t['w'] * 1.02 + 3
    x = t['x'] - (1 if single and t['align'] == 'c' else 0)
    tb = sl.shapes.add_textbox(e(x), e(t['y']), e(w), e(max(t['h'], 4)))
    tf = tb.text_frame; tf.word_wrap = not single; tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0; tf.vertical_anchor = MSO_ANCHOR.TOP
    p = tf.paragraphs[0]
    p.alignment = {'l': PP_ALIGN.LEFT, 'c': PP_ALIGN.CENTER, 'r': PP_ALIGN.RIGHT}[t['align']]
    p.line_spacing = Pt(t['lh'] * PT)
    if not t.get('bullet') and t['lines'] > 1 and t.get('first', 0) > 1.5:
        p._p.get_or_add_pPr().set('indent', str(int(t['first'] * EMU)))
    if t.get('bullet'):
        pPr = p._p.get_or_add_pPr(); ind = int(t['indent'] * EMU)
        pPr.set('marL', str(ind)); pPr.set('indent', str(-ind))
        if 'num' in t['bullet']:
            bu = etree.SubElement(pPr, qn('a:buAutoNum')); bu.set('type', 'arabicPeriod'); bu.set('startAt', str(t['bullet']['num']))
        else:
            bu = etree.SubElement(pPr, qn('a:buChar')); bu.set('char', '•')
    for r in t['runs']:
        if r.get('br'): p.add_line_break(); continue
        run = p.add_run(); run.text = r['t']; f = run.font
        f.size = Pt(round(r['size'] * PT * 2) / 2); f.bold = r['bold']; f.italic = r['italic']
        f.color.rgb = color(r['color']); f.name = r['font']
        if r['spc']: run._r.get_or_add_rPr().set('spc', str(int(round(r['spc'] * PT * 100))))

def build(data):
    prs = Presentation(); prs.slide_width = Emu(12192000); prs.slide_height = Emu(int(12192000 * SH / SW))
    blank = prs.slide_layouts[6]
    for i, d in enumerate(data):
        sl = prs.slides.add_slide(blank)
        sl.shapes.add_picture(f'{TMP}/bg-{i:02d}.png', 0, 0, prs.slide_width, prs.slide_height).name = 'Background'
        for s in d['shapes']: add_shape(sl, s)
        sl.shapes.add_picture(f'{TMP}/ov-{i:02d}.png', 0, 0, prs.slide_width, prs.slide_height).name = 'Graphics overlay'
        for im in d['imgs']:
            m = re.match(r'data:image/\w+;base64,(.*)', im['src'])
            blob = io.BytesIO(base64.b64decode(m.group(1)))
            if 'webp' in im['src'][:30]:
                from PIL import Image
                o = io.BytesIO(); Image.open(blob).save(o, 'PNG'); blob = io.BytesIO(o.getvalue())
            sl.shapes.add_picture(blob, e(im['x']), e(im['y']), e(im['w']), e(im['h']))
        for k, s in enumerate(d['svgs']):
            fp = f'{TMP}/svg-{i:02d}-{k:03d}.png'
            if os.path.exists(fp): sl.shapes.add_picture(fp, e(s['x']), e(s['y']), e(s['w']), e(s['h'])).name = f'Icon {k+1}'
        for t in d['texts']: add_text(sl, t)
    prs.core_properties.title = 'Model-agnostic agentic research browser'
    prs.core_properties.author = 'Tashif Ahmad Khan'
    # theme fonts so new text matches the deck
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT
    master = prs.slide_masters[0]
    theme_part = master.part.part_related_by(RT.THEME)
    xml = theme_part.blob.decode('utf8').replace('typeface="Calibri Light"', 'typeface="Schibsted Grotesk"').replace('typeface="Calibri"', 'typeface="Schibsted Grotesk"')
    theme_part._blob = xml.encode('utf8')
    prs.save(OUT + '/deck.pptx')
    print('saved', len(prs.slides), 'texts', sum(len(d['texts']) for d in data), 'shapes', sum(len(d['shapes']) for d in data), 'svgs', sum(len(d['svgs']) for d in data))

if __name__ == '__main__':
    data = json.load(open(TMP + '/data.json')) if '--reuse' in sys.argv else asyncio.run(capture())
    build(data)
