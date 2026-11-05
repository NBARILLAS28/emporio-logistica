/* =====================================================================
   INTERFAZ: iconos, modales, rutas, barra de periodo
   ===================================================================== */
const IC = {
  dash: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 006 0zM19 7l-3 7a4 4 0 006 0z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  down: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  up: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  wa: '<path d="M21 11.5a8.4 8.4 0 01-12.6 7.3L3 20l1.3-5.2A8.4 8.4 0 1121 11.5z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  l: '<path d="M15 18l-6-6 6-6"/>', r: '<path d="M9 18l6-6-6-6"/>',
  out: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>', clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  box2: '<path d="M20 7H4a1 1 0 00-1 1v3h18V8a1 1 0 00-1-1zM5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8M10 15h4"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;
const ACT = {}, SUB = {}, INP = {}, CHG = {};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); const fn = SUB[f.dataset.submit]; if (fn) fn(f, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && INP[el.dataset.input]) INP[el.dataset.input](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHG[el.dataset.change]) CHG[el.dataset.change](el, e); });

/* ---------- modal / confirmación / aviso ---------- */
function openModal({ title, body, foot = '', size = '' }) {
  $('#modal-root').innerHTML = `<div class="mback" data-act="mback"><div class="modal ${size}" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button data-act="mclose" aria-label="Cerrar">${ic('x')}</button></div><div class="mbody">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div></div>`;
  const f = $('#modal-root input:not([type=hidden]):not([readonly]),#modal-root select'); if (f && !/Mobi/i.test(navigator.userAgent)) setTimeout(() => f.focus(), 30);
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
ACT.mclose = () => { closeModal(); if (S.user) render(); };
ACT.mback = (el, e) => { if (e.target === el) { /* clic fuera: no cerrar para no perder datos */ } };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal2-root').innerHTML) $('#modal2-root').innerHTML = ''; else ACT.mclose(); } });
function confirmBox(msg, ok = 'Confirmar', danger = false) {
  return new Promise(res => {
    $('#modal2-root').innerHTML = `<div class="mback" style="z-index:200"><div class="modal" style="width:min(420px,100%)"><div class="mbody"><p style="margin:4px 0 0;font-size:15px">${msg}</p></div><div class="mf"><button class="btn" id="cb-no">Cancelar</button><button class="btn ${danger ? 'danger' : 'pri'}" id="cb-ok">${ok}</button></div></div></div>`;
    $('#cb-no').onclick = () => { $('#modal2-root').innerHTML = ''; res(false); };
    $('#cb-ok').onclick = () => { $('#modal2-root').innerHTML = ''; res(true); };
    $('#cb-ok').focus();
  });
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toast-root').appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 5200 : 2800);
}
function fillForm(f, data) { for (const [k, v] of Object.entries(data)) { const el = f.elements[k]; if (el && !(el instanceof RadioNodeList)) el.value = v; } }

/* ---------- tema ---------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('emp_theme', t); } catch (e) { } if (window.Chart) chartDefaults(); }
function initTheme() {
  let t = ''; try { t = localStorage.getItem('emp_theme') || ''; } catch (e) { }
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
}
ACT.theme = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (S.user) render(); };

/* ---------- navegación ---------- */
const PAGES = {};
const NAV = [
  { id: 'dashboard', t: 'Tablero', i: 'dash', p: 'ver' },
  { id: 'inventario', t: 'Inventario', i: 'box', p: 'ver' },
  { id: 'movimientos', t: 'Movimientos', i: 'swap', p: 'ver' },
  { sec: 'Operación diaria' },
  { id: 'turno', t: 'Cierre de turno', i: 'check', p: 'turno' },
  { id: 'conteo', t: 'Conteo físico', i: 'scale', p: 'ajuste' },
  { id: 'solicitudes', t: 'Solicitudes', i: 'send', p: 'ver' },
  { id: 'cierre', t: 'Cierre de mes', i: 'clock', p: 'reportes' },
  { sec: 'Análisis' },
  { id: 'reportes', t: 'Reportes', i: 'file', p: 'reportes' },
  { sec: 'Administración' },
  { id: 'usuarios', t: 'Usuarios y roles', i: 'users', p: 'usuarios' },
  { id: 'config', t: 'Configuración', i: 'gear', p: 'config' },
];
const PAGES_WITH_PERIOD = ['dashboard', 'movimientos', 'reportes'];
function buildNav() {
  let h = '', pend = '';
  for (const n of NAV) {
    if (n.sec) { pend = `<div class="sec">${n.sec}</div>`; continue; }
    if (!can(n.p)) continue;
    const bd = n.id === 'inventario' && DB && ix().items.length ? expiryAlerts().length : 0;
    h += pend + `<a data-act="go" data-page="${n.id}" class="${S.page === n.id ? 'on' : ''}">${ic(n.i)}<span>${n.t}</span>${bd ? `<em class="navbadge" title="Lotes vencidos o por vencer">${bd}</em>` : ''}</a>`; pend = '';
  }
  $('#nav').innerHTML = h;
  const u = S.user;
  $('#who').innerHTML = `<div class="av">${esc(u.nombre.trim()[0] || '?').toUpperCase()}</div><div><b>${esc(u.nombre)}</b><small>${ROLES[u.rol].n}</small></div><button data-act="logout" title="Cerrar sesión">${ic('out')}</button>`;
}
ACT.go = el => { if (el.dataset.rep) S.rep = el.dataset.rep; go(el.dataset.page); };
ACT.menu = () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('open'); };
ACT.logout = () => cloudLogout();
function go(page, opts = {}) {
  if (!PAGES[page]) page = 'dashboard';
  const n = NAV.find(x => x.id === page); if (n && !can(n.p)) page = 'dashboard';
  S.page = page; Object.assign(S, opts.state || {});
  $('#side').classList.remove('open'); $('#scrim').classList.remove('open');
  render(); window.scrollTo(0, 0);
}
function render() {
  if (!S.user) return;
  destroyCharts();
  const pg = PAGES[S.page];
  $('#title').textContent = pg.title;
  buildNav();
  $('#pbar').hidden = !PAGES_WITH_PERIOD.includes(S.page) || (S.page === 'dashboard' && simpleDash());
  if (!$('#pbar').hidden) renderPbar();
  $('#view').innerHTML = pg.html();
  if (pg.mount) pg.mount();
  setSaveStatus('ok');
  if (typeof updateBanner === 'function') updateBanner();
  const th = $('#themebtn'); if (th) th.innerHTML = ic('moon');
}
function softRender() { // re-render sin molestar si el usuario está escribiendo
  if ($('#modal-root').innerHTML || $('#modal2-root').innerHTML) return;
  const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && $('#view').contains(a)) return;
  render();
}
function onRemoteChange() { if (S.user) { softRender(); toast('Datos actualizados'); } }

/* ---------- barra de periodo ---------- */
function renderPbar() {
  const P = S.P, r = periodRange();
  const modes = [['dia', 'Diario'], ['semana', 'Semanal'], ['quincena', 'Quincenal'], ['mes', 'Mensual'], ['anio', 'Anual'], ['rango', 'Rango']];
  $('#pbar').innerHTML = `<div class="seg">${modes.map(([k, t]) => `<button data-act="pmode" data-m="${k}" class="${P.mode === k ? 'on' : ''}">${t}</button>`).join('')}</div>
   ${P.mode === 'rango' ? `<input type="date" id="pfrom" value="${r.from}" data-change="prange"> <span class="mut">a</span> <input type="date" id="pto" value="${r.to}" data-change="prange">`
      : `<div class="nav"><button data-act="pprev" aria-label="Anterior">${ic('l')}</button><span class="plabel">${esc(periodLabel())}</span><button data-act="pnext" aria-label="Siguiente">${ic('r')}</button></div>
     <input type="date" value="${P.anchor}" data-change="pdate" style="width:auto" title="Ir a una fecha">`}
   <button class="btn sm" data-act="ptoday">Hoy</button>
   <span class="mut" style="font-size:12px">${fmtDate(r.from)} → ${fmtDate(r.to)}</span>`;
}
ACT.pmode = el => { if (el.dataset.m === 'rango') { const r = periodRange(); S.P.from = r.from; S.P.to = r.to; } S.P.mode = el.dataset.m; render(); };
ACT.pprev = () => { periodShift(-1); render(); }; ACT.pnext = () => { periodShift(1); render(); };
ACT.ptoday = () => { S.P.anchor = today(); if (S.P.mode === 'rango') { S.P.from = S.P.to = today(); } render(); };
CHG.pdate = el => { if (el.value) { S.P.anchor = el.value; render(); } };
CHG.prange = () => { S.P.from = $('#pfrom').value; S.P.to = $('#pto').value; S.P.anchor = S.P.from || today(); render(); };

/* ---------- helpers de presentación ---------- */
const chip = (txt, cls) => `<span class="chip ${cls}">${esc(txt)}</span>`;
const statusChip = s => chip(s.est, s.cls === 'warn2' ? 'warn' : s.cls);
function dsTable(ds, opts = {}) {
  if (!ds.rows.length) return `<div class="empty"><b>Sin datos en este periodo</b>Cambia el periodo o registra movimientos.</div>`;
  const al = c => (c.n || c.a === 'r') ? ' class="r"' : '';
  const head = ds.cols.map(c => `<th${al(c)}>${esc(c.t)}</th>`).join('');
  const body = ds.rows.map(r => `<tr${opts.rowCls ? ` class="${opts.rowCls(r) || ''}"` : ''}>` + ds.cols.map(c => {
    const t = esc(cellText(r, c)); return `<td${al(c)}>${c.cls ? `<span class="chip ${c.cls(r)}">${t}</span>` : t}</td>`;
  }).join('') + '</tr>').join('');
  const foot = ds.foot ? '<tfoot><tr>' + ds.cols.map(c => `<td${al(c)}>${esc(footText(ds, c))}</td>`).join('') + '</tr></tfoot>' : '';
  return `<div class="tw" ${opts.maxh ? `style="max-height:${opts.maxh}"` : ''}><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
const itemOptions = (sel, tipo) => {
  const items = ix().items.filter(i => i.activo !== false && (!tipo || i.tipo === tipo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const grp = (t, lbl) => { const a = items.filter(i => i.tipo === t); return a.length ? `<optgroup label="${lbl}">${a.map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</optgroup>` : ''; };
  return `<option value="">— Seleccionar artículo —</option>` + grp('producto', 'Productos para venta') + grp('insumo', 'Insumos');
};
const catOptions = (sel, tipo) => `<option value="">— Sin categoría —</option>` + L('categories').filter(c => !tipo || c.tipo === 'ambos' || c.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
const provOptions = sel => `<option value="">— Ninguno —</option>` + L('suppliers').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
function chartDefaults() {
  if (!window.Chart) return; const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--mut').trim() || '#666'; Chart.defaults.borderColor = cs.getPropertyValue('--line').trim() || '#ddd';
  Chart.defaults.font.family = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'; Chart.defaults.font.size = 12;
}
const CH = {};
function destroyCharts() { Object.values(CH).forEach(c => { try { c.destroy(); } catch (e) { } }); for (const k in CH) delete CH[k]; }
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
