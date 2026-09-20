// AV Look Book — smoke probe. Runs INSIDE the app page (tests/run_smoke.mjs evaluates it over the DevTools protocol).
// It opens one example show and returns a JSON snapshot of what the core produces: the show model, every preset's
// layout (BG, layers, crops, effects, AUX), the I/O list, the Excel cue-sheet rows, the Look Book HTML (dates, build
// stamps and pictures normalised) and the Simple wire diagram's labels. The runner compares it with tests/golden/.
// Every section is wrapped so a renamed helper reports 'ERR …' for that section instead of killing the run.
(async function lbSmokeProbe(showId){
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = { show: showId, sections: {} };
  const S = (k, f) => { try { out.sections[k] = f(); } catch (e) { out.sections[k] = 'ERR ' + String(e); } };
  const norm = html => String(html || '')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, 'DATE')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/build 2026-06-16[a-z0-9]+/g, 'BUILD')
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, m => 'data:X(' + m.length + ')')
    .replace(/\s+/g, ' ');

  lbOpenExample(showId);
  await wait(1500);
  const fresh = [...document.querySelectorAll('button')].find(b => /start fresh/i.test(b.textContent));
  if (fresh) { fresh.click(); await wait(600); }
  document.querySelectorAll('.dlg-overlay,#dlg-overlay,#qs-modal').forEach(e => { e.style.display = 'none'; });
  await wait(300);

  S('meta', () => ({
    presets: presets.map(p => ({ code: p.code, name: p.name, notes: p.notes || '' })),
    screens: screens.map(s => ({ name: s.name, w: s.w, h: s.h })),
    dsms: (typeof dsms !== 'undefined' ? dsms : []).map(d => ({ name: d.name, type: d.type || '' })),
  }));

  S('layout', () => presets.map(p => ({
    code: p.code,
    screens: screens.map(s => {
      const sw = parseInt(s.w) || 1, sh = parseInt(s.h) || 1;
      return {
        screen: s.name,
        bg: getBgName(p.id, s.id) || '',
        bgDetail: (typeof _bgExportInfo === 'function') ? _bgExportInfo(p.id, s.id).detail : 'n/a',
        aoi: getAOI(p.id, s.id) || null,
        layers: getLayerNums(p.id).filter(n => getL(p.id, s.id, n)).map(n => {
          const g = _lfxGeo(p.id, s.id, n, sw, sh);
          return { n, name: getL(p.id, s.id, n), x: g.x, y: g.y, w: g.w, h: g.h, crop: getCrop(p.id, s.id, n) || null, fx: _lfxSummary(p.id, s.id, n) };
        }),
      };
    }),
    dsm: (typeof dsms !== 'undefined' ? dsms : []).map(d => ({ name: d.name, on: getDSMOn(p.id, d.id), content: getDSMContent(p.id, d.id) || '' })),
  })));

  S('sources', () => (typeof sources !== 'undefined' ? sources : []).map(s => ({
    name: s.name, connectorType: s.connectorType || '', resolution: s.resolution || '', type: s.type || '',
  })));

  S('excelRows', () => {
    const orig = _buildXlsx; let rows = null;
    window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); };
    try { _doExportExcel(true); } finally { window._buildXlsx = orig; }
    return rows;
  });

  S('lookbook', () => norm(exportPDF(true)));

  S('wireSimple', () => {
    openWireMode();
    wireSettings.wireView = 'simple';
    _wireRender();
    const svg = document.querySelector('#wire-diagram svg');
    const labels = svg ? [...svg.querySelectorAll('text, .r-static, .wire-source-name')].map(e => e.textContent.trim()).filter(Boolean) : [];
    const cards = [...document.querySelectorAll('#wire-sources-panel .wire-source-name')].map(e => e.textContent.trim());
    closeWireMode();
    return { labels, cards };
  });

  return out;
})
