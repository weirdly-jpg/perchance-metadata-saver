// injected.js — Perchance Meta-Saver page hook (v1).
// Runs in the page's MAIN world (no chrome.* APIs here). Content scripts
// live in an isolated world and CANNOT see JS expando properties like
// iframe.textToImagePluginOutput, so this hook reads finished tile outputs
// on their behalf and answers metadata queries.
(function () {
  const HOOK_V = 1;
  if (window.__pmsHookV >= HOOK_V) return;
  window.__pmsHookV = HOOK_V;

  function str(v) { return v == null ? '' : String(v); }

  function collectTiles() {
    const tiles = [];
    try {
      document.querySelectorAll('.t2i-image-ctn').forEach((ctn) => {
        try {
          if (!ctn.isConnected) return;
          // The history lightbox reuses the tile class but its frame output
          // carries prompt only (no seed) — the lightbox info panel, parsed
          // separately, is the seed source there.
          if (ctn.closest && ctn.closest('#history-lightbox')) return;
          const f = ctn.querySelector('iframe');
          const o = f && f.textToImagePluginOutput;
          if (!o || typeof o.dataUrl !== 'string' || o.dataUrl.indexOf('data:image/') !== 0) return;
          tiles.push({ ctn, dataUrl: o.dataUrl, inputs: o.inputs || {} });
        } catch (_e) {}
      });
    } catch (_e) {}
    return tiles;
  }

  function imgSrcs(root) {
    const out = [];
    try {
      root.querySelectorAll('img').forEach((img) => {
        try { const s = img.currentSrc || img.src || ''; if (s) out.push(s); } catch (_e) {}
      });
    } catch (_e) {}
    return out;
  }

  function metaOf(t) {
    const inp = t.inputs || {};
    return {
      prompt: str(inp.prompt),
      seed: str(inp.seed != null ? inp.seed : (inp.Seed || '')),
      guidance: str(
        inp.guidanceScale != null ? inp.guidanceScale
        : inp.guidance != null ? inp.guidance
        : inp.cfg != null ? inp.cfg : ''
      ),
    };
  }

  function findTile(src, x, y) {
    src = String(src || '');
    const tiles = collectTiles();
    if (src) {
      // Exact tile-pixel match (live frame clicks).
      for (const t of tiles) {
        if (t.dataUrl === src) return metaOf(t);
      }
      // Rendered copy inside the tile (titled/flattened comps).
      for (const t of tiles) {
        try {
          if (imgSrcs(t.ctn).indexOf(src) !== -1) return metaOf(t);
        } catch (_e) {}
      }
    }
    // Coordinate fallback (click point from the contextmenu event).
    if (typeof x === 'number' && typeof y === 'number') {
      try {
        const el = document.elementFromPoint(x, y);
        const img = el && (el.tagName === 'IMG' ? el : (el.closest ? el.closest('img') : null));
        const ctn = img && img.closest ? img.closest('.t2i-image-ctn') : null;
        if (ctn) {
          for (const t of tiles) {
            if (t.ctn === ctn) return metaOf(t);
          }
        }
      } catch (_e) {}
    }
    return null;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== 'pms-hook' || d.cmd !== 'tileMeta') return;
    let result = null;
    try { result = findTile(d.src, d.x, d.y); } catch (err) { result = null; }
    window.postMessage({ source: 'pms-hook', cmd: 'tileMeta-result', id: d.id, v: HOOK_V, result }, '*');
  });
})();
