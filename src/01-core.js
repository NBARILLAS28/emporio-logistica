'use strict';
/* =====================================================================
   EMPORIO · Logística interna — NÚCLEO (datos, almacenamiento, cálculos)
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 864e5);
const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '.')); return isFinite(n) ? n : 0; };
const fmtN = (n, dec = 0) => Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtQty = n => fmtN(n, Math.abs(n % 1) > 0 ? 2 : 0);
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dowName = iso => DIAS[fromISO(iso).getDay()];

/* ---------- catálogos fijos ---------- */
const TIPOS_IN = { compra: 'Compra / reposición', inicial: 'Inventario inicial', devolucion: 'Devolución de cliente', donacion: 'Donación / obsequio recibido', ajuste_mas: 'Ajuste de inventario (+)' };
const TIPOS_OUT = { venta: 'Venta', uso: 'Uso / consumo interno', merma: 'Merma / dañado / vencido', cortesia: 'Cortesía / muestra', consumo_personal: 'Consumo de colaborador', devolucion_prov: 'Devolución a proveedor', ajuste_menos: 'Ajuste de inventario (−)' };
const TIPO_LABEL = { ...TIPOS_IN, ...TIPOS_OUT };
const G_IN = ['compra', 'devolucion', 'donacion'];
const G_OUT = ['venta', 'uso', 'merma', 'cortesia', 'consumo_personal', 'devolucion_prov'];
const G_ADJ = ['inicial', 'ajuste_mas', 'ajuste_menos'];
const CONSUMO = ['venta', 'uso', 'merma', 'cortesia', 'consumo_personal'];
const UNIDADES = ['unidad', 'botella', 'lata', 'caja', 'paquete', 'bolsa', 'galón', 'litro', 'kg', 'libra', 'rollo', 'par', 'juego', 'frasco'];

const ROLES = {
  admin: { n: 'Administrador', d: 'Control total: usuarios, configuración, respaldo y todo lo demás.', p: ['ver', 'mov', 'turno', 'catalogo', 'ajuste', 'solicitud', 'reportes', 'costos', 'anular', 'usuarios', 'config', 'respaldo'] },
  supervisor: { n: 'Supervisor', d: 'Administra el inventario, aprueba ajustes y ve costos. No gestiona usuarios.', p: ['ver', 'mov', 'turno', 'catalogo', 'ajuste', 'solicitud', 'reportes', 'costos', 'anular'] },
  operador: { n: 'Operador / Bodega', d: 'Registra ingresos, egresos y cierres de turno; crea solicitudes. No ve costos ni edita el catálogo.', p: ['ver', 'mov', 'turno', 'solicitud', 'reportes'] },
  consulta: { n: 'Solo consulta', d: 'Puede ver el tablero, inventario y reportes. No modifica nada.', p: ['ver', 'reportes'] },
};
const PERM_LABEL = {
  ver: 'Ver tablero e inventario', mov: 'Registrar ingresos y egresos', turno: 'Cierre de turno diario', catalogo: 'Crear / editar artículos, categorías y proveedores',
  ajuste: 'Conteo físico y ajustes', solicitud: 'Crear solicitudes (WhatsApp / correo)', reportes: 'Reportes, PDF, Excel e imprimir', costos: 'Ver y editar costos y precios',
  anular: 'Anular movimientos', usuarios: 'Gestionar usuarios y roles', config: 'Configuración del sistema', respaldo: 'Respaldo y base de datos compartida',
};

const DEFAULT_SETTINGS = {
  empresa: 'EMPORIO', sucursal: 'Chimaltenango', moneda: 'Q',
  turnoAM: 'Turno AM (5:00)', turnoPM: 'Turno PM (2:00)',
  ventanaConsumo: 30, diasReposicion: 7, diasObjetivo: 14, diasEspera: 7, diasCierre: 30,
  waDefault: '', emailDefault: '', pais: '502', u: 0,
};
const COLS = ['users', 'categories', 'suppliers', 'items', 'movements', 'requests', 'counts', 'audit'];

/* ---------- estado global ---------- */
let DB = null;
const S = { user: null, page: 'dashboard', scope: 'todo', P: { mode: 'mes', anchor: today(), from: '', to: '' }, dirty: false, saved: 0, invTab: 'producto', rep: 'resumen' };

/* ---------- almacenamiento local (IndexedDB con respaldo en localStorage) ---------- */
const store = {
  db: null, mem: {},
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('emporio_logistica', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; }
  },
  get(k) {
    if (this.db) return new Promise(res => { try { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } });
    try { const v = localStorage.getItem('emp_' + k); return Promise.resolve(v ? JSON.parse(v) : this.mem[k]); } catch (e) { return Promise.resolve(this.mem[k]); }
  },
  set(k, v) {
    if (this.db) return new Promise((res, rej) => { try { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); } catch (e) { rej(e); } });
    this.mem[k] = v; try { localStorage.setItem('emp_' + k, JSON.stringify(v)); } catch (e) { } return Promise.resolve();
  },
  del(k) { if (this.db) return new Promise(res => { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); try { localStorage.removeItem('emp_' + k); } catch (e) { } delete this.mem[k]; return Promise.resolve(); },
};

function emptyDB() {
  const d = { v: 1, id: uid(), settings: { ...DEFAULT_SETTINGS } };
  COLS.forEach(c => d[c] = []);
  return d;
}
function normalizeDB(d) {
  const base = emptyDB();
  const out = { ...base, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
  COLS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
  return out;
}

/* ---------- guardado local (caché sin conexión) + envío a la nube ---------- */
let saveT = null, _ix = null;
let saveVer = 0;
function commit() {
  _ix = null; S.dirty = true; saveVer++; clearTimeout(saveT);
  saveT = setTimeout(persist, 350); setSaveStatus('saving');
}
async function persist() {
  const v = saveVer;
  try { await cacheSave(); S.saved = Date.now(); } catch (e) { console.warn('cache', e); }
  if (typeof cloudPush === 'function') cloudPush();
  if (saveVer === v) S.dirty = false;
  setSaveStatus();
}
function setSaveStatus(st) {
  const el = $('#savestat'); if (!el) return;
  const c = (typeof C !== 'undefined' ? C : {}); const n = c.pending || 0;
  let cls = '', txt;
  if (st === 'saving') { cls = 'saving'; txt = 'Guardando…'; }
  else if (c.authErr) { cls = 'err'; txt = 'Sesión vencida'; }
  else if (c.online === false) { cls = 'err'; txt = 'Sin conexión' + (n ? ` · ${n} cambio${n > 1 ? 's' : ''} por enviar` : ''); }
  else if (c.err && n) { cls = 'err'; txt = `Sin enviar: ${n} cambio${n > 1 ? 's' : ''} (reintentando)`; }
  else if (n) { cls = 'saving'; txt = 'Enviando…'; }
  else if (c.lastSync) { txt = 'Sincronizado ' + pad(new Date(c.lastSync).getHours()) + ':' + pad(new Date(c.lastSync).getMinutes()); }
  else txt = 'Guardado';
  el.className = cls; el.innerHTML = `<span class="dot"></span>${txt}`;
}


/* ---------- validaciones de captura ---------- */
function chkDate(iso, { min = '', max = today(), label = 'La fecha' } = {}) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(fromISO(iso))) return `${label} no es válida.`;
  if (iso < '2020-01-01') return `${label} (${fmtDate(iso)}) es demasiado antigua; revisa el año.`;
  if (max && iso > max) return `${label} (${fmtDate(iso)}) no puede ser posterior a ${fmtDate(max)}.`;
  if (min && iso < min) return `${label} (${fmtDate(iso)}) no puede ser anterior a ${fmtDate(min)}.`;
  return '';
}
function chkQty(q, label = 'La cantidad', { max = 1e6 } = {}) {
  if (!(q > 0)) return `${label} debe ser un número mayor a 0.`;
  if (q > max) return `${label} (${fmtQty(q)}) es demasiado grande; revisa si falta un punto decimal.`;
  return '';
}

/* ---------- acceso a colecciones ---------- */
const L = col => DB[col].filter(r => !r.del);
function put(col, rec) {
  rec.u = Date.now();
  const i = DB[col].findIndex(r => r.id === rec.id);
  if (i < 0) DB[col].push(rec); else DB[col][i] = rec;
  commit(); return rec;
}
function del(col, id) { const r = DB[col].find(r => r.id === id); if (r) { r.del = true; r.u = Date.now(); commit(); } }
function log(acc, det) { put('audit', { id: uid(), ts: Date.now(), userId: S.user?.id || '', acc, det: det || '' }); }
function ix() {
  if (_ix) return _ix;
  const items = DB.items.filter(r => !r.del);
  const map = new Map(items.map(i => [i.id, i]));
  const all = DB.movements.filter(m => !m.del && map.has(m.itemId));
  const moves = all.filter(m => m.dir !== 'ev');             // movimientos que cambian la existencia
  const evs = new Map();                                      // eventos que no mueven stock: abrir unidad, notas de cierre
  for (const m of all) if (m.dir === 'ev') { let a = evs.get(m.itemId); if (!a) { a = []; evs.set(m.itemId, a); } a.push(m); }
  evs.forEach(a => a.sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.hora || '').localeCompare(y.hora || '') || ((x.u || 0) - (y.u || 0))));
  moves.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || '') || ((a.u || 0) - (b.u || 0)));
  const byItem = new Map();
  for (const m of moves) { let a = byItem.get(m.itemId); if (!a) { a = []; byItem.set(m.itemId, a); } a.push(m); }
  _ix = { items, map, moves, byItem, evs, cats: new Map(L('categories').map(c => [c.id, c])), provs: new Map(L('suppliers').map(c => [c.id, c])), users: new Map(DB.users.map(u => [u.id, u])) };
  return _ix;
}
const itemById = id => ix().map.get(id);
const catName = id => ix().cats.get(id)?.nombre || '—';
const provName = id => ix().provs.get(id)?.nombre || '';
const userName = id => ix().users.get(id)?.nombre || '—';
const can = p => !!S.user && ROLES[S.user.rol]?.p.includes(p);
const cfg = () => DB.settings;
const money = n => (cfg().moneda || 'Q') + ' ' + fmtN(n, 2);

/* ---------- usuarios: vienen de la nube (Supabase Auth + inv_perfiles) ---------- */

/* =====================================================================
   PERIODOS (día / semana / quincena / mes / año / rango)
   ===================================================================== */
function periodRange(p = S.P) {
  const a = fromISO(p.anchor), y = a.getFullYear(), m = a.getMonth();
  switch (p.mode) {
    case 'dia': return { from: p.anchor, to: p.anchor };
    case 'semana': { const f = addDays(p.anchor, -((a.getDay() + 6) % 7)); return { from: f, to: addDays(f, 6) }; }
    case 'quincena': return a.getDate() <= 15 ? { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m, 15)) } : { from: toISO(new Date(y, m, 16)), to: toISO(new Date(y, m + 1, 0)) };
    case 'mes': return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
    case 'anio': return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) };
    default: { const f = p.from || p.anchor, t = p.to || p.anchor; return f <= t ? { from: f, to: t } : { from: t, to: f }; }
  }
}
function periodLabel(p = S.P) {
  const r = periodRange(p), a = fromISO(p.anchor);
  switch (p.mode) {
    case 'dia': return `${dowName(p.anchor)} ${fmtDate(p.anchor)}`;
    case 'semana': return `Semana ${fmtDate(r.from)} – ${fmtDate(r.to)}`;
    case 'quincena': return `${a.getDate() <= 15 ? '1ª' : '2ª'} quincena de ${MESES[a.getMonth()]} ${a.getFullYear()}`;
    case 'mes': return `${MESES[a.getMonth()]} ${a.getFullYear()}`;
    case 'anio': return `Año ${a.getFullYear()}`;
    default: return `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  }
}
function periodShift(dir, p = S.P) {
  const r = periodRange(p);
  if (p.mode === 'rango') { const n = daysBetween(r.from, r.to) + 1; p.from = addDays(r.from, dir * n); p.to = addDays(r.to, dir * n); p.anchor = p.from; return; }
  p.anchor = dir < 0 ? addDays(r.from, -1) : addDays(r.to, 1);
}

/* =====================================================================
   CÁLCULOS DE INVENTARIO
   ===================================================================== */
const signed = m => m.dir === 'in' ? m.cant : -m.cant;
function stockOf(id, upTo) {
  let s = 0; for (const m of (ix().byItem.get(id) || [])) { if (upTo && m.fecha > upTo) break; s += signed(m); } return s;
}
function stockBefore(id, date) {
  let s = 0; for (const m of (ix().byItem.get(id) || [])) { if (m.fecha >= date) break; s += signed(m); } return s;
}
function summarize(id, from, to) {
  const r = { ini: 0, ing: 0, ven: 0, uso: 0, otras: 0, egr: 0, aj: 0, cierre: 0, ingQ: 0, venQ: 0, costoVen: 0, consumo: 0 };
  const it = itemById(id);
  for (const m of (ix().byItem.get(id) || [])) {
    if (m.fecha < from) { r.ini += signed(m); continue; }
    if (m.fecha > to) break;
    const c = m.cant;
    if (G_IN.includes(m.tipo)) { r.ing += c; r.ingQ += c * (m.costoU || 0); }
    else if (G_ADJ.includes(m.tipo)) r.aj += signed(m);
    else {
      r.egr += c;
      if (m.tipo === 'venta') { r.ven += c; r.venQ += c * ((m.precioU ?? it?.precio) || 0); r.costoVen += c * ((m.costoU ?? it?.costo) || 0); }
      else if (m.tipo === 'uso') r.uso += c; else r.otras += c;
    }
    if (CONSUMO.includes(m.tipo)) r.consumo += c;
  }
  r.cierre = r.ini + r.ing + r.aj - r.egr;
  return r;
}
/* Consumo por día calculado automáticamente:
   · real      → lo medido en los movimientos de la ventana (salidas por uso, venta, merma…, incluye «Terminar unidad»)
   · estimado  → consumo inicial del artículo (tomado del Excel de Octubre) mientras no hay datos propios
   · mixto     → mezcla ponderada; el consumo real va ganando peso hasta cubrir 30 días de datos
   Así el programa se «autoajusta» sin que nadie capture reglas a mano. */
function usage(id, win) {
  win = win || cfg().ventanaConsumo || 30;
  const arr = ix().byItem.get(id) || [];
  const end = today(); let start = addDays(end, -(win - 1));
  if (arr.length && arr[0].fecha > start) start = arr[0].fecha;
  if (start > end) start = end;
  const days = Math.max(1, daysBetween(start, end) + 1);
  let total = 0; for (const m of arr) if (m.fecha >= start && m.fecha <= end && CONSUMO.includes(m.tipo)) total += m.cant;
  const real = total / days, base = ix().map.get(id)?.baseDia || 0;
  let perDay = real, origen = total > 0 ? 'real' : 'sin datos';
  if (base > 0) {
    if (total <= 0) { perDay = base; origen = 'estimado'; }
    else { const w = Math.min(1, days / 30); perDay = w * real + (1 - w) * base; origen = w >= 1 ? 'real' : 'mixto'; }
  }
  return { total, days, perDay, origen, real, base };
}

/* ---------- unidades: Sellado → En uso → Terminado ---------- */
/* «Terminar unidad» = salida por uso con src 'terminar'; «Abrir unidad» = evento (no mueve existencia).
   Existencia real = Sellado + En uso. Lo Terminado ya salió del inventario. */
function unitState(id, upTo) {
  let opened = 0, done = 0;
  for (const e of (ix().evs.get(id) || [])) { if (upTo && e.fecha > upTo) break; if (e.tipo === 'abrir') opened += e.cant; }
  for (const m of (ix().byItem.get(id) || [])) { if (upTo && m.fecha > upTo) break; if (m.src === 'terminar' && m.dir === 'out') done += m.cant; }
  const st = Math.max(0, stockOf(id, upTo)), uso = Math.min(st, Math.max(0, opened - done));
  return { st, uso, sellado: st - uso, opened, done };
}
/* Ciclos de vida de cada unidad (PEPS): cuándo se abrió y cuándo se terminó */
function unitCycles(id) {
  const opens = [], cyc = [];
  for (const e of (ix().evs.get(id) || [])) if (e.tipo === 'abrir') opens.push({ fecha: e.fecha, rest: e.cant, evId: e.id });
  for (const m of (ix().byItem.get(id) || [])) {
    if (m.src !== 'terminar' || m.dir !== 'out') continue;
    let q = m.cant;
    for (const o of opens) { if (q <= 0) break; if (o.rest > 0) { const t = Math.min(o.rest, q); o.rest -= t; q -= t; for (let i = 0; i < t; i++) cyc.push({ abrio: o.fecha, termino: m.fecha, dias: Math.max(1, daysBetween(o.fecha, m.fecha)) }); } }
  }
  const enUso = opens.filter(o => o.rest > 0).map(o => ({ abrio: o.fecha, cant: o.rest, dias: daysBetween(o.fecha, today()), evId: o.evId }));
  const avg = cyc.length ? cyc.reduce((a, c) => a + c.dias, 0) / cyc.length : null;
  return { cyc, enUso, avg, opens };
}

/* ---------- solicitudes: pedidos en camino y tiempos de entrega ---------- */
const reqActive = r => !r.del && !r.hist && (r.estado === 'Enviada' || r.estado === 'Parcial');
function onOrderMap() {
  const X = ix(); if (X.oo) return X.oo;
  const m = X.oo = new Map();
  for (const r of DB.requests) { if (!reqActive(r)) continue; for (const l of r.lines || []) { const pend = Math.max(0, (l.cant || 0) - (l.recCant || 0)); if (pend > 0 && !l.cerrada) m.set(l.itemId, (m.get(l.itemId) || 0) + pend); } }
  return m;
}
const onOrder = id => onOrderMap().get(id) || 0;
const reqWaitDays = r => Math.max(0, daysBetween(r.fecha, today()));
function pendingRequests() {
  return L('requests').filter(reqActive).map(r => ({ r, dias: reqWaitDays(r), tarde: reqWaitDays(r) > (cfg().diasEspera || 7), pend: (r.lines || []).filter(l => (l.cant || 0) > (l.recCant || 0) && !l.cerrada).length }))
    .sort((a, b) => b.dias - a.dias);
}
/* tiempo de entrega por artículo: de la fecha de solicitud a la fecha de recepción de cada línea */
function leadTimes() {
  const per = new Map(); let all = [];
  for (const r of L('requests')) {
    if (r.estado === 'Cancelada') continue;
    for (const l of r.lines || []) {
      if (!l.itemId) continue; let a = per.get(l.itemId); if (!a) { a = { n: 0, rec: 0, dias: [], pend: 0 }; per.set(l.itemId, a); }
      a.n++;
      if (l.recFecha) { const d = Math.max(0, daysBetween(r.fecha, l.recFecha)); a.rec++; a.dias.push(d); all.push(d); }
      else if (!r.hist && reqActive(r) && !l.cerrada) a.pend++;
    }
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  per.forEach(a => { a.avg = avg(a.dias); a.max = a.dias.length ? Math.max(...a.dias) : null; });
  // la mediana evita que un solo error de captura distorsione el promedio global
  const sorted = all.slice().sort((x, y) => x - y), med = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return { per, avg: avg(all), med, n: all.length };
}

/* Lotes FIFO: mide cuánto tiempo dura cada ingreso hasta agotarse */
function lotsOf(id) {
  const lots = [];
  for (const m of (ix().byItem.get(id) || [])) {
    if (m.dir === 'in') {
      if (m.tipo === 'ajuste_mas' && lots.length) { const l = lots[lots.length - 1]; l.cant += m.cant; l.rest += m.cant; }
      else lots.push({ fecha: m.fecha, cant: m.cant, rest: m.cant, vence: m.vence || '', cierre: null, tipo: m.tipo });
    } else {
      let q = m.cant;
      for (const l of lots) { if (q <= 0) break; if (l.rest > 0) { const t = Math.min(l.rest, q); l.rest -= t; q -= t; if (l.rest <= 0) l.cierre = m.fecha; } }
    }
  }
  lots.forEach(l => { l.dias = l.cierre ? Math.max(1, daysBetween(l.fecha, l.cierre)) : null; });
  const done = lots.filter(l => l.cierre && l.tipo !== 'inicial');
  const avgLife = done.length ? done.reduce((a, l) => a + l.dias, 0) / done.length : null;
  const ing = lots.filter(l => l.tipo !== 'inicial');
  let cicloRepo = null;
  if (ing.length > 1) cicloRepo = ing.slice(1).reduce((a, l, i) => a + daysBetween(ing[i].fecha, l.fecha), 0) / (ing.length - 1);
  return { lots, avgLife, cicloRepo };
}
function effMin(it, u) { return it.min > 0 ? it.min : Math.ceil((u.perDay || 0) * (cfg().diasReposicion || 7)); }
function itemStatus(it) {
  const st = stockOf(it.id), u = usage(it.id), min = effMin(it, u);
  const cov = u.perDay > 0 ? st / u.perDay : null;
  let est, cls;
  if (st <= 0) { est = 'Agotado'; cls = 'bad'; }
  else if (min > 0 && st <= min) { est = 'Bajo mínimo'; cls = 'warn'; }
  else if (cov !== null && cov < (cfg().diasReposicion || 7)) { est = 'Por agotarse'; cls = 'warn'; }
  else if (u.perDay === 0) { est = 'Sin movimiento'; cls = 'mut'; }
  else { est = 'OK'; cls = 'ok'; }
  return { st, u, min, cov, est, cls, camino: onOrder(it.id), agot: cov !== null && st > 0 ? addDays(today(), Math.floor(cov)) : null };
}
function suggestQty(it, s) {
  const target = it.max > 0 ? it.max : Math.ceil(s.u.perDay * (cfg().diasObjetivo || 14));
  let q = Math.max(0, Math.ceil(target - s.st - (s.camino ?? onOrder(it.id))));
  if (it.pack > 0 && q > 0) q = Math.ceil(q / it.pack) * it.pack;
  return q;
}
const NEEDS = ['Agotado', 'Bajo mínimo', 'Por agotarse'];

/* flujo ingresos / egresos por tramo de tiempo */
function flowBuckets(from, to) {
  const n = daysBetween(from, to) + 1, out = [];
  if (n === 1) { ['AM', 'PM', ''].forEach(t => out.push({ key: t, label: t || 'Sin turno' })); return { out, keyOf: m => m.turno || '' }; }
  if (n <= 62) { for (let i = 0; i < n; i++) { const d = addDays(from, i); out.push({ key: d, label: pad(fromISO(d).getDate()) + '/' + pad(fromISO(d).getMonth() + 1) }); } return { out, keyOf: m => m.fecha }; }
  const a = fromISO(from), b = fromISO(to);
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d.setMonth(d.getMonth() + 1)) out.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), label: MES_C[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) });
  return { out, keyOf: m => m.fecha.slice(0, 7) };
}
