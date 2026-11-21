// Runs in the page after print CSS + prep. Returns per-slide geometry for a native PPTX.
() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgb = c => {
    if (!c || c === 'transparent') return null;
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 8) return null;
    return [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const SKIP = 'svg,.katex,[data-keep],.xs,img,script,style';
  const skipped = el => el.closest(SKIP);
  const px = v => parseFloat(v) || 0;
  const slides = [...document.querySelectorAll('#canvas > .slide')];
  return slides.map(slide => {
    const S = slide.getBoundingClientRect();
    const rel = r => ({ x: r.left - S.left, y: r.top - S.top, w: r.width, h: r.height });
    const shapes = [], texts = [], imgs = [], svgs = [];
    const all = [...slide.querySelectorAll('*')];
    // ---- shapes
    all.forEach(el => {
      if (skipped(el) || el.closest('.xs')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (cs.backgroundImage !== 'none') return;            // left to the overlay picture
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      const fill = rgb(cs.backgroundColor);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => {
        const w = px(cs['border' + s + 'Width']), st = cs['border' + s + 'Style'], c = rgb(cs['border' + s + 'Color']);
        return (w > 0 && st !== 'none' && st !== 'hidden' && c) ? { w, c, dash: st === 'dashed' || st === 'dotted' } : null;
      });
      if (!fill && !sides.some(Boolean)) return;
      const same = sides.every(s => s && s.w === sides[0].w && s.c === sides[0].c && s.dash === sides[0].dash);
      shapes.push({ ...rel(r), fill, radius: px(cs.borderTopLeftRadius), outline: same ? sides[0] : null, sides: same ? null : sides });
      el.setAttribute('data-xs', '');
    });
    // ---- text blocks
    const runsOf = B => {
      const out = [];
      (function walk(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) { if (c.textContent.length) out.push({ node: c, el: c.parentElement }); }
          else if (c.nodeType === 1) {
            if (c.matches(SKIP)) continue;
            const d = getComputedStyle(c);
            if (d.display === 'none') continue;
            if (c.tagName === 'BR') { out.push({ br: true }); continue; }
            if (d.display !== 'inline') continue;
            walk(c);
          }
        }
      })(B);
      return out;
    };
    all.forEach(B => {
      if (skipped(B)) return;
      const bcs = getComputedStyle(B);
      if (bcs.display === 'inline' || bcs.display === 'none' || bcs.visibility === 'hidden') return;
      const runs = runsOf(B);
      if (!runs.some(r => r.node && r.node.textContent.trim())) return;
      let L = 1e9, T = 1e9, R = -1e9, Bt = -1e9, F = null; const tops = new Set();
      runs.forEach(r => {
        if (!r.node || !r.node.textContent.trim()) return;
        const rg = document.createRange(); rg.selectNodeContents(r.node);
        for (const q of rg.getClientRects()) { if (q.width < 0.5) continue; if (F === null) F = q.left; L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); Bt = Math.max(Bt, q.bottom); tops.add(Math.round(q.top / 4)); }
      });
      if (L > R) return;
      // collapse whitespace across runs
      const out = []; let prevSpace = true;
      runs.forEach(r => {
        if (r.br) { out.push({ br: true }); prevSpace = true; return; }
        let t = r.node.textContent.replace(/\s+/g, ' ');
        if (prevSpace) t = t.replace(/^ /, '');
        if (!t) return;
        prevSpace = t.endsWith(' ');
        const cs = getComputedStyle(r.el);
        out.push({ t, size: px(cs.fontSize), bold: parseInt(cs.fontWeight) >= 600, italic: cs.fontStyle === 'italic',
          color: rgb(cs.color) || '000000', font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
          spc: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) });
      });
      while (out.length && out[out.length - 1].t && out[out.length - 1].t.endsWith(' ')) { const l = out[out.length - 1]; l.t = l.t.replace(/ $/, ''); if (!l.t) out.pop(); else break; }
      let bullet = null, indent = 0;
      if (bcs.display === 'list-item' && bcs.listStyleType !== 'none') {
        indent = px(getComputedStyle(B.parentElement).paddingLeft) || 16;
        bullet = bcs.listStyleType === 'decimal' ? { num: [...B.parentElement.children].indexOf(B) + 1 } : { ch: '•' };
      }
      const al = bcs.textAlign;
      const lh = bcs.lineHeight === 'normal' ? px(bcs.fontSize) * 1.2 : px(bcs.lineHeight);
      texts.push({ x: L - S.left - (bullet ? indent : 0), y: T - S.top, w: R - L + (bullet ? indent : 0), h: Bt - T, lines: tops.size, first: F === null ? 0 : F - L,
        align: al === 'center' ? 'c' : (al === 'right' || al === 'end') ? 'r' : 'l', lh, runs: out, bullet, indent });
    });
    // svg <text> (orbit labels)
    slide.querySelectorAll('svg text').forEach(t => {
      const r = t.getBoundingClientRect(); const cs = getComputedStyle(t);
      texts.push({ ...rel(r), lines: 1, align: cs.textAnchor === 'middle' ? 'c' : 'l', lh: r.height,
        runs: [{ t: t.textContent, size: px(cs.fontSize), bold: parseInt(cs.fontWeight) >= 600, italic: false, color: rgb(cs.fill) || '000000',
          font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), spc: 0 }] });
    });
    // ---- images and svgs
    slide.querySelectorAll('img').forEach(im => imgs.push({ ...rel(im.getBoundingClientRect()), src: im.currentSrc || im.src }));
    slide.querySelectorAll('svg').forEach(sv => {
      if (sv.parentElement.closest('svg') || sv.closest('.katex')) return;
      const r = sv.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      sv.setAttribute('data-svg', svgs.length); svgs.push(rel(r));
    });
    return { shapes, texts, imgs, svgs, name: slide.dataset.title };
  });
}
