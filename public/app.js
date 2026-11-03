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
  ventanaConsumo: 30, diasReposicion: 7, diasObjetivo: 14,
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
  const moves = DB.movements.filter(m => !m.del && map.has(m.itemId));
  moves.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || '') || ((a.u || 0) - (b.u || 0)));
  const byItem = new Map();
  for (const m of moves) { let a = byItem.get(m.itemId); if (!a) { a = []; byItem.set(m.itemId, a); } a.push(m); }
  _ix = { items, map, moves, byItem, cats: new Map(L('categories').map(c => [c.id, c])), provs: new Map(L('suppliers').map(c => [c.id, c])), users: new Map(DB.users.map(u => [u.id, u])) };
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
function usage(id, win) {
  win = win || cfg().ventanaConsumo || 30;
  const arr = ix().byItem.get(id) || [];
  const end = today(); let start = addDays(end, -(win - 1));
  if (arr.length && arr[0].fecha > start) start = arr[0].fecha;
  if (start > end) start = end;
  const days = Math.max(1, daysBetween(start, end) + 1);
  let total = 0; for (const m of arr) if (m.fecha >= start && m.fecha <= end && CONSUMO.includes(m.tipo)) total += m.cant;
  return { total, days, perDay: total / days };
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
  return { st, u, min, cov, est, cls, agot: cov !== null && st > 0 ? addDays(today(), Math.floor(cov)) : null };
}
function suggestQty(it, s) {
  const target = it.max > 0 ? it.max : Math.ceil(s.u.perDay * (cfg().diasObjetivo || 14));
  let q = Math.max(0, Math.ceil(target - s.st));
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

'use strict';
/* =====================================================================
   NUBE: Supabase (cuentas, sincronización, tiempo real, modo sin conexión)
   - Cada dispositivo guarda una copia local (IndexedDB) y trabaja aunque no haya internet.
   - Los cambios pendientes se envían solos al volver la conexión.
   - Gana siempre el cambio más reciente de cada registro (nada se borra: borrado lógico).
   ===================================================================== */
const SYNC_COLS = ['categories', 'suppliers', 'items', 'movements', 'requests', 'counts', 'audit'];
const C = { sb: null, online: navigator.onLine, pending: 0, cursor: null, sv: {}, pushing: false, again: false, syncing: false, lastSync: 0, err: '', authErr: false, perfil: null, hayAdmin: true, ch: null, started: false, denied: 0 };

const cloudConfigured = () => { const c = window.EMP_CFG || {}; return !!(c.SUPABASE_URL && c.SUPABASE_KEY && !/PEGA|TU_CLAVE/i.test(c.SUPABASE_KEY)); };
const isNet = e => !navigator.onLine || /failed to fetch|networkerror|network request|load failed|timeout|fetch/i.test(String(e?.message || e));
const isAuthErr = e => /jwt|not authenticated|invalid token|expired/i.test(String(e?.message || '')) || e?.code === 'PGRST301' || e?.status === 401;
const isNoAccess = e => /sin_acceso|sin_sesion/.test(String(e?.message || ''));
const mapPerfil = p => ({ id: p.id, nombre: p.nombre || p.email || '—', usuario: p.email || '', email: p.email || '', tel: p.tel || '', rol: p.rol, estado: p.estado, activo: p.estado === 'activo' });

function cloudInit() {
  if (C.sb) return true;
  if (!cloudConfigured() || !window.supabase) return false;
  C.sb = window.supabase.createClient(EMP_CFG.SUPABASE_URL, EMP_CFG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'emporio-logistica-auth' } });
  C.sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { C.recovery = true; setTimeout(showResetPassword, 0); }
    if (ev === 'SIGNED_OUT' && S.user && !C.leaving) setTimeout(() => location.reload(), 0);
  });
  return true;
}

/* ---------- copia local ---------- */
async function cacheSave() {
  if (!S.user || !DB) return;
  await store.set('cache', { uid: S.user.id, perfil: C.perfil, DB: { ...DB, users: [] }, sv: C.sv, cursor: C.cursor });
}
async function cacheLoad(uid) { const c = await store.get('cache'); return c && c.uid === uid ? c : null; }

/* ---------- sesión ---------- */
async function cloudBoot() {
  if (!cloudInit()) return showNoConfig();
  if (/type=recovery/.test(location.hash)) { C.recovery = true; return; }
  const { data } = await C.sb.auth.getSession();
  if (!data.session) return showLogin();
  await enterWithSession(data.session);
}
async function enterWithSession(session) {
  const uid = session.user.id, meta = session.user.user_metadata || {};
  let info = null, offline = false;
  try {
    const { data, error } = await C.sb.rpc('inv_registrar', { p_nombre: meta.nombre || '', p_tel: meta.tel || '' });
    if (error) throw error; info = data;
  } catch (e) {
    if (isNet(e)) offline = true; else return showLogin('No se pudo verificar tu cuenta: ' + (e.message || e));
  }
  let cache = await cacheLoad(uid), perfil = info?.perfil;
  if (offline) {
    if (!cache) return showLogin('Sin conexión. Conéctate a internet para iniciar sesión la primera vez en este dispositivo.');
    perfil = cache.perfil; C.online = false;
  }
  C.hayAdmin = info ? info.hay_admin : true; C.perfil = perfil;
  if (!perfil || perfil.estado !== 'activo') return showPending(perfil);
  if (cache && cache.perfil && cache.perfil.rol !== perfil.rol) { await store.del('cache'); cache = null; }   // cambió de rol: empezar limpio
  DB = cache ? normalizeDB(cache.DB) : emptyDB(); C.sv = cache?.sv || {}; C.cursor = cache?.cursor || null;
  S.user = mapPerfil(perfil);
  if (!C.cursor) { showScreen('boot'); $('#boot').textContent = 'Sincronizando datos…'; }
  if (!offline) {
    try { await loadTeam(); await cloudPull(); C.lastSync = Date.now(); }
    catch (e) { if (isNet(e)) { if (!C.cursor && !DB.items.length) return showLogin('No se pudo descargar la información. Revisa tu conexión.'); } else if (isNoAccess(e)) return showPending(perfil); else return showLogin('Error al sincronizar: ' + (e.message || e)); }
  } else { DB.users = [mapPerfil(perfil)]; }
  await cacheSave();
  startApp(S.user);
  cloudLoops();
  cloudPush();
}
async function cloudLogin(email, pass) {
  const { data, error } = await C.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
  if (error) throw error; return data.session;
}
async function cloudSignUp({ nombre, email, pass, tel }) {
  const { data, error } = await C.sb.auth.signUp({ email: email.trim().toLowerCase(), password: pass, options: { data: { nombre, tel }, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error; return data;
}
async function cloudLogout() {
  C.leaving = true;
  try { if (S.user && C.sb) { await cloudPush(); } } catch (e) { }
  if (C.pending > 0 && !await confirmBox(`Hay <b>${C.pending}</b> cambio(s) que todavía no se han enviado a la nube (sin conexión). Si cierras sesión se perderán. ¿Cerrar sesión de todos modos?`, 'Cerrar sesión', true)) { C.leaving = false; return; }
  try { await store.del('cache'); } catch (e) { }
  try { await C.sb.auth.signOut(); } catch (e) { }
  location.reload();
}
function authFail(e) {   // la sesión ya no sirve
  if (isNoAccess(e)) { C.leaving = true; store.del('cache').finally(() => C.sb.auth.signOut().finally(() => location.reload())); return true; }
  if (isAuthErr(e)) { C.authErr = true; return true; }
  return false;
}

/* ---------- equipo ---------- */
async function loadTeam() {
  const { data, error } = await C.sb.rpc('inv_equipo'); if (error) throw error;
  DB.users = (data || []).map(mapPerfil);
  const me = DB.users.find(u => u.id === S.user.id);
  if (me) {
    if (me.estado !== 'activo') { C.leaving = true; await store.del('cache'); toast('Tu acceso fue desactivado', 'bad'); setTimeout(() => location.reload(), 1200); return; }
    if (me.rol !== S.user.rol) { await store.del('cache'); toast('Tu rol cambió. Recargando…', 'ok'); setTimeout(() => location.reload(), 1200); return; }
    S.user = { ...S.user, ...me };
  }
  _ix = null;
}

/* ---------- bajar cambios ---------- */
function applyRemote(r, idx) {
  const key = r.col + ':' + r.id, ru = Number(r.u) || 0;
  if (r.col === 'settings') {
    if (ru > (DB.settings.u || 0)) { DB.settings = { ...DEFAULT_SETTINGS, ...r.data, u: ru }; C.sv[key] = ru; return true; }
    if (ru === (DB.settings.u || 0)) C.sv[key] = ru;
    return false;
  }
  if (!SYNC_COLS.includes(r.col)) return false;
  let m = idx[r.col]; if (!m) { m = idx[r.col] = new Map(DB[r.col].map((x, i) => [x.id, i])); }
  const rec = { ...r.data, id: r.id, u: ru }; if (r.del) rec.del = true; else delete rec.del;
  if (!m.has(r.id)) { DB[r.col].push(rec); m.set(r.id, DB[r.col].length - 1); C.sv[key] = ru; return true; }
  const i = m.get(r.id), loc = DB[r.col][i];
  if (ru > (loc.u || 0)) { DB[r.col][i] = rec; C.sv[key] = ru; return true; }
  if (ru === (loc.u || 0)) C.sv[key] = ru;
  return false;
}
async function cloudPull() {
  let cur = C.cursor || { ts: '1970-01-01T00:00:00Z', col: '', id: '' }, changed = false, last = null, idx = {};
  for (let guard = 0; guard < 400; guard++) {
    const { data, error } = await C.sb.rpc('inv_pull', { p_ts: cur.ts, p_col: cur.col, p_id: cur.id, p_limit: 1000 });
    if (error) throw error;
    const rows = data.rows || [];
    for (const r of rows) changed = applyRemote(r, idx) || changed;
    if (rows.length) { last = rows[rows.length - 1]; cur = { ts: last.ts, col: last.col, id: last.id }; }
    if (rows.length < 1000) break;
  }
  if (last) C.cursor = { ts: last.ts, col: '', id: '' };
  if (changed) { _ix = null; await cacheSave(); }
  else if (last) await cacheSave();
  return changed;
}

/* ---------- subir cambios ---------- */
function dirtyRows() {
  const out = [];
  for (const col of SYNC_COLS) for (const r of DB[col]) { const u = r.u || 0; if (u > (C.sv[col + ':' + r.id] || 0)) out.push({ col, id: r.id, data: r, u, del: !!r.del }); }
  const su = DB.settings.u || 0; if (su > (C.sv['settings:main'] || 0)) out.push({ col: 'settings', id: 'main', data: DB.settings, u: su, del: false });
  return out;
}
async function cloudPush() {
  if (!C.sb || !S.user || C.leaving) return;
  if (C.pushing) { C.again = true; return; }
  C.pushing = true; const deniedRows = [];
  try {
    do {
      C.again = false;
      const rows = dirtyRows(); C.pending = rows.length;
      if (!rows.length) break;
      if (!navigator.onLine) { C.online = false; break; }
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { data, error } = await C.sb.rpc('inv_push', { p_rows: batch });
        if (error) throw error;
        const by = new Map(batch.map(b => [b.col + ':' + b.id, b]));
        for (const res of data) {
          const b = by.get(res.k); if (!b) continue;
          if (res.ok) C.sv[res.k] = b.u;
          else if (res.err === 'permiso') deniedRows.push(b);
          else { C.sv[res.k] = b.u; console.warn('registro rechazado', res); }
        }
      }
      C.err = ''; C.online = true; C.authErr = false;
    } while (C.again);
  } catch (e) {
    C.err = String(e?.message || e);
    if (isNet(e)) C.online = false; else if (!authFail(e)) console.warn('push', e);
  } finally {
    C.pushing = false; C.pending = dirtyRows().length;
    if (deniedRows.length) {   // el servidor no permitió esos cambios: volver a la versión de la nube
      for (const b of deniedRows) { if (b.col === 'settings') DB.settings.u = 0; else { const i = DB[b.col].findIndex(r => r.id === b.id); if (i >= 0) DB[b.col].splice(i, 1); } delete C.sv[b.col + ':' + b.id]; }
      C.cursor = null; _ix = null;
      toast(`${deniedRows.length} cambio(s) no se guardaron: tu rol no tiene permiso.`, 'bad'); setTimeout(cloudSync, 50);
    }
    try { await cacheSave(); } catch (e) { }
    setSaveStatus(); if (typeof updateBanner === 'function') updateBanner();
  }
}
async function cloudSync() {
  if (!C.sb || !S.user || C.syncing || C.leaving) return;
  C.syncing = true;
  try {
    if (!navigator.onLine) { C.online = false; return; }
    const changed = await cloudPull();
    C.online = true; C.authErr = false; C.err = ''; C.lastSync = Date.now();
    await cloudPush();
    if (++C.cycles % 6 === 0 || C.teamStale) { C.teamStale = false; await loadTeam(); }
    if (changed) onRemoteChange();
  } catch (e) {
    C.err = String(e?.message || e);
    if (isNet(e)) C.online = false; else if (!authFail(e)) console.warn('sync', e);
  } finally { C.syncing = false; setSaveStatus(); if (typeof updateBanner === 'function') updateBanner(); }
}
C.cycles = 0;
function cloudLoops() {
  if (C.started) return; C.started = true;
  setInterval(() => { if (document.visibilityState === 'visible') cloudSync(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloudSync(); });
  window.addEventListener('online', () => { C.online = true; cloudSync(); });
  window.addEventListener('offline', () => { C.online = false; setSaveStatus(); if (typeof updateBanner === 'function') updateBanner(); });
  window.addEventListener('focus', () => cloudSync());
  try {   // tiempo real (supervisores y administradores); los demás reciben los cambios cada 20 s
    C.ch = C.sb.channel('inv-registros').on('postgres_changes', { event: '*', schema: 'public', table: 'inv_registros' }, () => { clearTimeout(C.rt); C.rt = setTimeout(cloudSync, 500); }).subscribe();
  } catch (e) { }
}

/* =====================================================================
   EXPORTAR (PDF / Excel / imprimir), MENSAJES, IMPORTAR, SEMILLA
   ===================================================================== */
function cellVal(r, c) { return typeof c.k === 'function' ? c.k(r) : r[c.k]; }
function cellText(r, c) {
  const v = cellVal(r, c); if (v === null || v === undefined || v === '') return '';
  if (c.n) return fmtN(v, c.d || 0);
  return c.f ? c.f(v, r) : String(v);
}
function footText(ds, c) {
  if (!ds.foot) return '';
  const v = typeof c.k === 'function' ? ds.foot[c.t] : ds.foot[c.k];
  if (v === undefined || v === null || v === '') return '';
  return c.n && typeof v === 'number' ? fmtN(v, c.d || 0) : String(v);
}
function fileStamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; }
function safeName(s) { return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function downloadBlob(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportXLSX(ds, name) {
  const aoa = [[cfg().empresa + ' · ' + ds.title], [ds.sub || ''], [], ds.cols.map(c => c.t)];
  ds.rows.forEach(r => aoa.push(ds.cols.map(c => { const v = cellVal(r, c); return c.n ? (v === '' || v == null ? '' : Number(v)) : (c.f ? c.f(v, r) : (v ?? '')); })));
  if (ds.foot) aoa.push(ds.cols.map(c => { const v = typeof c.k === 'function' ? ds.foot[c.t] : ds.foot[c.k]; return v ?? ''; }));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = ds.cols.map((c, i) => ({ wch: Math.min(48, Math.max(c.t.length + 2, ...ds.rows.slice(0, 60).map(r => cellText(r, c).length + 2))) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, ds.title.slice(0, 30).replace(/[\\/?*\[\]:]/g, ' '));
  XLSX.writeFile(wb, (name || safeName(ds.title)) + '_' + fileStamp() + '.xlsx');
}
function exportPDF(ds, name) {
  const { jsPDF } = window.jspdf;
  const land = ds.cols.length > 6;
  const doc = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(211, 18, 30); doc.rect(36, 30, 6, 34, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20); doc.text(String(cfg().empresa).toUpperCase() + ' · Logística interna', 50, 44);
  doc.setFontSize(12); doc.text(ds.title, 50, 60);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(ds.sub || '', 50, 74);
  const gen = `Generado por ${S.user?.nombre || ''} · ${fmtDate(today())} ${nowHM()}`;
  doc.text(gen, W - 36, 44, { align: 'right' });
  const body = ds.rows.map(r => ds.cols.map(c => cellText(r, c)));
  const foot = ds.foot ? [ds.cols.map(c => footText(ds, c))] : undefined;
  const colStyles = {}; ds.cols.forEach((c, i) => { if (c.n || c.a === 'r') colStyles[i] = { halign: 'right' }; });
  doc.autoTable({
    startY: 86, head: [ds.cols.map(c => c.t)], body, foot, theme: 'grid', showFoot: 'lastPage',
    styles: { fontSize: ds.cols.length > 9 ? 7 : 8, cellPadding: 3, lineColor: [210, 210, 215], lineWidth: .4, textColor: 30 },
    headStyles: { fillColor: [14, 14, 16], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [238, 238, 242], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 247, 249] }, columnStyles: colStyles, margin: { left: 36, right: 36, bottom: 40 },
    didParseCell: d => { const c = ds.cols[d.column.index]; if (c && (c.n || c.a === 'r') && (d.section === 'head' || d.section === 'foot')) d.cell.styles.halign = 'right'; },
    didDrawPage: () => { const n = doc.internal.getNumberOfPages(); doc.setFontSize(8); doc.setTextColor(120); doc.text('Página ' + n, W - 36, doc.internal.pageSize.getHeight() - 20, { align: 'right' }); },
  });
  let y = doc.lastAutoTable.finalY + 46; const H = doc.internal.pageSize.getHeight();
  if (y > H - 60) { doc.addPage(); y = 90; }
  doc.setDrawColor(60); doc.setTextColor(60);
  doc.line(50, y, 220, y); doc.text('Elaboró', 135, y + 12, { align: 'center' });
  doc.line(260, y, 430, y); doc.text('Revisó', 345, y + 12, { align: 'center' });
  doc.save((name || safeName(ds.title)) + '_' + fileStamp() + '.pdf');
}
function printDS(ds) {
  const ths = ds.cols.map(c => `<th style="text-align:${c.n || c.a === 'r' ? 'right' : 'left'}">${esc(c.t)}</th>`).join('');
  const trs = ds.rows.map(r => '<tr>' + ds.cols.map(c => `<td style="text-align:${c.n || c.a === 'r' ? 'right' : 'left'}">${esc(cellText(r, c))}</td>`).join('') + '</tr>').join('');
  const tf = ds.foot ? '<tfoot><tr>' + ds.cols.map(c => `<th style="text-align:${c.n || c.a === 'r' ? 'right' : 'left'}">${esc(footText(ds, c))}</th>`).join('') + '</tr></tfoot>' : '';
  $('#printArea').innerHTML = `<div class="ph"><div><h2>${esc(cfg().empresa)} · Logística interna</h2><b>${esc(ds.title)}</b><br>${esc(ds.sub || '')}</div><div style="text-align:right">Generado por ${esc(S.user?.nombre || '')}<br>${fmtDate(today())} ${nowHM()}</div></div>
   <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>${tf}</table><div class="sig"><div>Elaboró</div><div>Revisó</div></div>`;
  setTimeout(() => window.print(), 60);
}
function printHTML(html) { $('#printArea').innerHTML = html; setTimeout(() => window.print(), 60); }

/* ---------- mensajes de solicitud (WhatsApp / correo) ---------- */
function requestMessage(rq, mode) {
  const B = t => mode === 'wa' ? `*${t}*` : t;
  const tipo = rq.tipo === 'insumo' ? 'INSUMOS' : 'PRODUCTOS PARA VENTA';
  const out = [];
  out.push(B(`SOLICITUD DE ${tipo} - ${cfg().empresa}${cfg().sucursal ? ' ' + cfg().sucursal : ''}`));
  out.push(`Folio: ${rq.folio}`);
  out.push(`Fecha: ${fmtDate(rq.fecha)}${rq.urgencia && rq.urgencia !== 'Normal' ? '  |  Urgencia: ' + rq.urgencia : ''}`);
  if (rq.fechaReq) out.push(`Fecha requerida: ${fmtDate(rq.fechaReq)}`);
  if (rq.solicitante) out.push(`Solicitante: ${rq.solicitante}`);
  if (rq.destNombre) out.push(`Para: ${rq.destNombre}`);
  out.push('');
  out.push(B('Detalle:'));
  rq.lines.forEach((l, i) => out.push(`${i + 1}. ${l.nombre} - ${fmtQty(l.cant)} ${l.unidad || 'unidad'}${l.stock !== undefined ? `  (existencia actual: ${fmtQty(l.stock)})` : ''}`));
  if (rq.nota) { out.push(''); out.push(B('Notas:')); out.push(rq.nota); }
  out.push(''); out.push('Gracias.');
  return out.join('\n');
}
function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 8) d = (cfg().pais || '502') + d;
  return d;
}
function waLink(rq) { const p = waPhone(rq.destTel || cfg().waDefault); return `https://wa.me/${p}?text=${encodeURIComponent(requestMessage(rq, 'wa'))}`; }
function mailLink(rq) {
  const to = rq.destEmail || cfg().emailDefault || '';
  const subj = `Solicitud ${rq.folio} - ${rq.tipo === 'insumo' ? 'Insumos' : 'Productos para venta'} - ${cfg().empresa}`;
  return `mailto:${encodeURIComponent(to).replace('%40', '@')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(requestMessage(rq, 'mail').replace(/\n/g, '\r\n'))}`;
}
function requestDS(rq) {
  return {
    title: `Solicitud ${rq.folio} · ${rq.tipo === 'insumo' ? 'Insumos' : 'Productos para venta'}`,
    sub: `Fecha ${fmtDate(rq.fecha)} · Solicitante: ${rq.solicitante || '-'} · Para: ${rq.destNombre || '-'} · Urgencia: ${rq.urgencia}${rq.fechaReq ? ' · Requerida: ' + fmtDate(rq.fechaReq) : ''}${rq.nota ? ' · Nota: ' + rq.nota : ''}`,
    cols: [{ t: '#', k: r => r._i }, { t: 'Artículo', k: 'nombre' }, { t: 'Unidad', k: 'unidad' }, { t: 'Existencia', k: 'stock', n: 1 }, { t: 'Cantidad solicitada', k: 'cant', n: 1 }],
    rows: rq.lines.map((l, i) => ({ ...l, _i: i + 1 })),
  };
}

/* ---------- importar catálogo desde Excel / CSV ---------- */
const IMP_MAP = {
  nombre: ['nombre', 'articulo', 'articulo por nombre', 'producto', 'insumo', 'descripcion', 'item'],
  tipo: ['tipo', 'clase'], categoria: ['categoria', 'rubro', 'grupo'], unidad: ['unidad', 'presentacion', 'medida', 'um'],
  stock: ['existencia', 'cantidad', 'stock', 'inventario', 'cantidad inicial', 'existencia inicial'],
  min: ['minimo', 'stock minimo', 'min'], max: ['maximo', 'stock maximo', 'max'], costo: ['costo', 'costo unitario', 'precio compra'],
  precio: ['precio', 'precio venta', 'precio de venta', 'pvp'], codigo: ['codigo', 'sku', 'cod'], proveedor: ['proveedor'], pack: ['caja', 'pack', 'unidades por caja', 'multiplo'],
};
function parseCatalogSheet(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  if (!rows.length) return { rows: [], map: {} };
  const heads = Object.keys(rows[0]); const map = {};
  for (const [k, al] of Object.entries(IMP_MAP)) { const h = heads.find(h => al.includes(norm(h))); if (h) map[k] = h; }
  const out = rows.map(r => ({
    nombre: String(r[map.nombre] ?? '').trim(), tipo: /ins/i.test(String(r[map.tipo] ?? '')) ? 'insumo' : 'producto',
    categoria: String(r[map.categoria] ?? '').trim(), unidad: String(r[map.unidad] ?? '').trim() || 'unidad', stock: num(r[map.stock]),
    min: num(r[map.min]), max: num(r[map.max]), costo: num(r[map.costo]), precio: num(r[map.precio]), codigo: String(r[map.codigo] ?? '').trim(),
    proveedor: String(r[map.proveedor] ?? '').trim(), pack: num(r[map.pack]),
  })).filter(r => r.nombre);
  return { rows: out, map };
}
function templateXLSX() {
  const data = [
    ['Nombre', 'Tipo', 'Categoría', 'Unidad', 'Existencia', 'Mínimo', 'Máximo', 'Costo', 'Precio', 'Código', 'Proveedor', 'Caja'],
    ['Agua pura 600ml', 'Producto', 'Agua', 'botella', 48, 12, 96, 3.5, 6, 'AG-001', 'Distribuidora X', 48],
    ['Desinfectante galón', 'Insumo', 'Limpieza', 'galón', 6, 2, 10, 38, '', 'LIM-010', 'Proveedor Y', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = data[0].map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Catálogo'); XLSX.writeFile(wb, 'plantilla_catalogo_emporio.xlsx');
}
function ensureCategory(nombre, tipo) {
  if (!nombre) return '';
  const f = L('categories').find(c => norm(c.nombre) === norm(nombre));
  if (f) return f.id;
  return put('categories', { id: uid(), nombre, tipo: tipo || 'ambos' }).id;
}
function ensureSupplier(nombre) {
  if (!nombre) return '';
  const f = L('suppliers').find(c => norm(c.nombre) === norm(nombre));
  if (f) return f.id;
  return put('suppliers', { id: uid(), nombre, tel: '', email: '', nota: '' }).id;
}
function importCatalog(rows, fecha) {
  let nuevos = 0, act = 0;
  for (const r of rows) {
    const ex = L('items').find(i => norm(i.nombre) === norm(r.nombre) && i.tipo === r.tipo);
    const base = { nombre: r.nombre, tipo: r.tipo, catId: ensureCategory(r.categoria, r.tipo), unidad: r.unidad || 'unidad', min: r.min || 0, max: r.max || 0, costo: r.costo || 0, precio: r.precio || 0, codigo: r.codigo, provId: ensureSupplier(r.proveedor), pack: r.pack || 0 };
    if (ex) { put('items', { ...ex, ...Object.fromEntries(Object.entries(base).filter(([k, v]) => v)) }); act++; }
    else {
      const it = put('items', { id: uid(), activo: true, ubicacion: '', nota: '', duracionEsp: 0, ...base }); nuevos++;
      if (r.stock > 0) put('movements', mkMove({ itemId: it.id, dir: 'in', tipo: 'inicial', cant: r.stock, fecha, costoU: r.costo, nota: 'Existencia inicial importada' }));
    }
  }
  log('Importar catálogo', `${nuevos} nuevos, ${act} actualizados`); return { nuevos, act };
}
function mkMove(o) {
  return { id: uid(), fecha: o.fecha || today(), hora: o.hora || nowHM(), turno: o.turno ?? (nowHM() < '14:00' ? 'AM' : 'PM'), itemId: o.itemId, dir: o.dir, tipo: o.tipo, cant: o.cant, costoU: o.costoU ?? 0, precioU: o.precioU ?? 0, doc: o.doc || '', provId: o.provId || '', vence: o.vence || '', nota: o.nota || '', userId: S.user?.id || '', src: o.src || 'manual', turnoKey: o.turnoKey || '', reqId: o.reqId || '', fisico: o.fisico };
}

/* ---------- semilla: datos del Excel INVENTARIO_DIARIO_EMPORIO ---------- */
function applySeed(withHistory) {
  const SEED = window.SEED_DATA; if (!SEED) return;
  const cats = { 'Agua': 'producto', 'Hidratación': 'producto', 'Energizantes': 'producto', 'Snacks y proteína': 'producto' };
  const catIds = {}; Object.entries(cats).forEach(([n, t]) => catIds[n] = ensureCategory(n, t));
  const ids = {};
  SEED.items.forEach(s => {
    const it = put('items', { id: uid(), tipo: 'producto', nombre: s.nombre, codigo: '', catId: catIds[s.cat], unidad: 'unidad', pack: 0, min: 0, max: 0, costo: 0, precio: 0, provId: '', ubicacion: 'Recepción', nota: '', activo: true, duracionEsp: 0 });
    ids[s.key] = it.id;
  });
  if (withHistory) SEED.moves.forEach(([fecha, hora, turno, key, dir, tipo, cant, nota]) => {
    put('movements', { id: uid(), fecha, hora, turno, itemId: ids[key], dir, tipo, cant, costoU: 0, precioU: 0, doc: '', provId: '', vence: '', nota, userId: S.user?.id || '', src: 'excel', turnoKey: '', reqId: '' });
  });
}
function applySupplyCategories() {
  ['Limpieza', 'Higiene y aseo', 'Papelería y oficina', 'Mantenimiento', 'Cafetería y consumibles', 'Toallas y lavandería', 'Equipo y accesorios', 'Otros insumos'].forEach(n => ensureCategory(n, 'insumo'));
}

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
    h += pend + `<a data-act="go" data-page="${n.id}" class="${S.page === n.id ? 'on' : ''}">${ic(n.i)}<span>${n.t}</span></a>`; pend = '';
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
  $('#pbar').hidden = !PAGES_WITH_PERIOD.includes(S.page);
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

/* =====================================================================
   PÁGINAS A: Tablero · Inventario · Movimientos
   ===================================================================== */
const EXPSRC = {};
function expBtns(src, extra = '') {
  if (!can('reportes')) return '';
  return `<div class="row" style="gap:6px">${extra}<button class="btn sm" data-act="exp" data-fmt="pdf" data-src="${src}">${ic('down')} PDF</button><button class="btn sm" data-act="exp" data-fmt="xlsx" data-src="${src}">${ic('down')} Excel</button><button class="btn sm" data-act="exp" data-fmt="print" data-src="${src}">${ic('print')} Imprimir</button></div>`;
}
ACT.exp = el => {
  const ds = EXPSRC[el.dataset.src](); if (!ds) return;
  try { if (el.dataset.fmt === 'pdf') exportPDF(ds); else if (el.dataset.fmt === 'xlsx') exportXLSX(ds); else printDS(ds); }
  catch (e) { console.error(e); toast('No se pudo generar el archivo: ' + e.message, 'bad'); }
};
const emptyCatalog = () => `<div class="card empty"><b>Aún no hay artículos</b>Crea tu primer artículo en <a href="#" data-act="go" data-page="inventario">Inventario</a> o impórtalos desde Excel en Configuración → Importar.</div>`;

/* ---------------------------- TABLERO ---------------------------- */
PAGES.dashboard = {
  title: 'Tablero',
  html() {
    const { from, to } = periodRange();
    const items = ix().items.filter(i => i.activo !== false && (S.scope === 'todo' || i.tipo === S.scope));
    const seg = `<div class="seg mb">${[['todo', 'Todo'], ['producto', 'Productos para venta'], ['insumo', 'Insumos']].map(([k, t]) => `<button data-act="scope" data-s="${k}" class="${S.scope === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    if (!ix().items.length) return seg + emptyCatalog();
    const rows = items.map(it => ({ it, s: summarize(it.id, from, to), st: itemStatus(it) }));
    const T = rows.reduce((a, r) => { a.ing += r.s.ing; a.egr += r.s.egr; a.ven += r.s.ven; a.venQ += r.s.venQ; a.ingQ += r.s.ingQ; a.cv += r.s.costoVen; a.stock += r.st.st; a.val += Math.max(0, r.st.st) * (r.it.costo || 0); return a; }, { ing: 0, egr: 0, ven: 0, venQ: 0, ingQ: 0, cv: 0, stock: 0, val: 0 });
    const alerts = rows.filter(r => NEEDS.includes(r.st.est)).sort((a, b) => (a.st.est === 'Agotado' ? 0 : 1) - (b.st.est === 'Agotado' ? 0 : 1) || (a.st.cov ?? 999) - (b.st.cov ?? 999));
    const agot = alerts.filter(r => r.st.est === 'Agotado').length;
    const costos = can('costos'), hasPrices = rows.some(r => r.it.precio > 0 || r.it.costo > 0);
    const util = T.venQ - T.cv;
    const kpi = (cls, lbl, val, sub) => `<div class="kpi ${cls}"><small>${lbl}</small><b>${val}</b><span>${sub}</span></div>`;
    const kp = [
      kpi('k-in', 'Ingresos del periodo', fmtQty(T.ing) + ' uds', costos && T.ingQ > 0 ? 'Compras: ' + money(T.ingQ) : 'Compras, devoluciones y donaciones'),
      kpi('k-out', 'Egresos del periodo', fmtQty(T.egr) + ' uds', `Ventas: ${fmtQty(T.ven)} uds${costos && T.venQ > 0 ? ' · ' + money(T.venQ) : ''}`),
      kpi('k-info', 'Existencia actual', fmtQty(T.stock) + ' uds', costos && T.val > 0 ? 'Valor al costo: ' + money(T.val) : rows.length + ' artículos activos'),
      costos ? kpi('k-info', 'Utilidad bruta estimada', T.venQ > 0 ? money(util) : '—', T.venQ > 0 ? 'Margen ' + fmtN(T.venQ ? util / T.venQ * 100 : 0, 1) + '% sobre ventas' : 'Asigna costo y precio a tus artículos') : '',
      kpi('k-warn', 'Alertas de reposición', alerts.length, `${agot} agotados · ${alerts.length - agot} por reponer`),
    ].join('');
    const tieneUso = rows.filter(r => r.st.u.perDay > 0 && r.st.st > 0).sort((a, b) => a.st.cov - b.st.cov).slice(0, 10);
    const maxCov = Math.max(1, (cfg().diasObjetivo || 14) * 2);
    const usoRows = tieneUso.map(r => {
      const lf = lotsOf(r.it.id), pct = Math.min(100, r.st.cov / maxCov * 100), cl = r.st.cov < (cfg().diasReposicion || 7) ? 'bad' : r.st.cov < (cfg().diasObjetivo || 14) ? 'warn' : '';
      return `<tr><td>${esc(r.it.nombre)}</td><td class="r">${fmtQty(r.st.st)}</td><td class="r">${fmtN(r.st.u.perDay, 1)}</td><td style="min-width:130px"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar ${cl}" style="flex:1"><i style="width:${pct}%"></i></div><b class="num" style="min-width:34px;text-align:right">${fmtN(r.st.cov, 1)}</b></div></td><td>${fmtDate(r.st.agot)}</td><td class="r">${lf.avgLife ? fmtN(lf.avgLife, 0) : '—'}</td></tr>`;
    }).join('');
    const alertRows = alerts.slice(0, 9).map(r => `<tr><td>${esc(r.it.nombre)} <small class="mut">${r.it.tipo === 'insumo' ? '· insumo' : ''}</small></td><td class="r">${fmtQty(r.st.st)}</td><td class="r">${r.st.min || '—'}</td><td>${statusChip(r.st)}</td><td class="r"><b>${fmtQty(suggestQty(r.it, r.st))}</b></td></tr>`).join('');
    const nProd = alerts.filter(r => r.it.tipo === 'producto').length, nIns = alerts.filter(r => r.it.tipo === 'insumo').length;
    const venc = []; items.forEach(it => lotsOf(it.id).lots.forEach(l => { if (l.rest > 0 && l.vence && l.vence <= addDays(today(), 30)) venc.push({ it, l }); })); venc.sort((a, b) => a.l.vence.localeCompare(b.l.vence));
    const vencHTML = venc.length ? `<h3 class="mt">Por vencer <small>próximos 30 días</small></h3><div class="tw"><table><thead><tr><th>Artículo</th><th class="r">Quedan</th><th>Vence</th></tr></thead><tbody>${venc.slice(0, 6).map(v => `<tr><td>${esc(v.it.nombre)}</td><td class="r">${fmtQty(v.l.rest)}</td><td>${fmtDate(v.l.vence)} ${v.l.vence < today() ? chip('Vencido', 'bad') : chip(daysBetween(today(), v.l.vence) + ' d', 'warn')}</td></tr>`).join('')}</tbody></table></div>` : '';
    return seg + (costos && !hasPrices ? `<div class="note">Los valores en ${cfg().moneda} (compras, ventas, utilidad, valor del inventario) se calculan con el <b>costo</b> y <b>precio</b> de cada artículo. Complétalos en Inventario → Editar para ver esos indicadores.</div>` : '') +
      `<div class="kpis">${kp}</div>
     <div class="cols2"><div class="card"><h3>Ingresos vs. egresos <small>${esc(periodLabel())} · unidades</small></h3><div class="chartbox"><canvas id="ch-flow"></canvas></div></div>
       <div class="card"><h3>Salud del inventario <small>artículos por estado</small></h3><div class="chartbox"><canvas id="ch-est"></canvas></div></div></div>
     <div class="cols3"><div class="card"><h3>Mayor salida en el periodo <small>unidades</small></h3><div class="chartbox sm"><canvas id="ch-top"></canvas></div></div>
       <div class="card"><h3>Alertas de reposición ${can('solicitud') && alerts.length ? `<span class="row" style="gap:6px">${nProd ? `<button class="btn sm pri" data-act="reqAlerts" data-t="producto">${ic('send')} Solicitar productos (${nProd})</button>` : ''}${nIns ? `<button class="btn sm pri" data-act="reqAlerts" data-t="insumo">${ic('send')} Solicitar insumos (${nIns})</button>` : ''}</span>` : ''}</h3>
       ${alertRows ? `<div class="tw"><table><thead><tr><th>Artículo</th><th class="r">Exist.</th><th class="r">Mín.</th><th>Estado</th><th class="r">Sugerido</th></tr></thead><tbody>${alertRows}</tbody></table></div>${alerts.length > 9 ? `<small class="mut">+${alerts.length - 9} más en el reporte «Pedido sugerido»</small>` : ''}` : '<div class="empty"><b>Todo en orden</b>No hay artículos por reponer.</div>'}${vencHTML}</div></div>
     <div class="card"><h3>Tiempo de uso y cobertura <small>según el consumo de los últimos ${cfg().ventanaConsumo} días</small><button class="btn sm" data-act="go" data-page="reportes" data-rep="consumo">Ver reporte completo</button></h3>
       ${usoRows ? `<div class="tw"><table><thead><tr><th>Artículo</th><th class="r">Existencia</th><th class="r">Consumo/día</th><th>Cobertura (días)</th><th>Se agota aprox.</th><th class="r" title="Días promedio que tarda en agotarse cada ingreso (método PEPS)">Vida prom. de lote (días)</th></tr></thead><tbody>${usoRows}</tbody></table></div>` : '<div class="empty">Aún no hay consumo suficiente para estimar la duración.</div>'}</div>`;
  },
  mount() {
    if (!window.Chart || !ix().items.length) return; chartDefaults();
    const { from, to } = periodRange();
    const items = ix().items.filter(i => i.activo !== false && (S.scope === 'todo' || i.tipo === S.scope));
    // flujo
    const fb = flowBuckets(from, to), idx = new Map(fb.out.map((b, i) => [b.key, i])), ing = fb.out.map(() => 0), egr = fb.out.map(() => 0);
    for (const m of ix().moves) {
      if (m.fecha < from || m.fecha > to) continue; const it = itemById(m.itemId); if (!it || it.activo === false || (S.scope !== 'todo' && it.tipo !== S.scope)) continue;
      const i = idx.get(fb.keyOf(m)); if (i === undefined) continue; if (G_IN.includes(m.tipo)) ing[i] += m.cant; else if (G_OUT.includes(m.tipo)) egr[i] += m.cant;
    }
    let labels = fb.out.map(b => b.label), di = ing, de = egr;
    if (daysBetween(from, to) === 0) { const keep = fb.out.map((b, i) => b.key !== '' || ing[i] || egr[i]); labels = labels.filter((_, i) => keep[i]); di = ing.filter((_, i) => keep[i]); de = egr.filter((_, i) => keep[i]); }
    const cOk = cssv('--ok'), cAcc = cssv('--acc');
    CH.flow = new Chart($('#ch-flow'), { type: 'bar', data: { labels, datasets: [{ label: 'Ingresos', data: di, backgroundColor: cOk, borderRadius: 4 }, { label: 'Egresos', data: de, backgroundColor: cAcc, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    // estado
    const ests = { 'OK': 0, 'Por agotarse': 0, 'Bajo mínimo': 0, 'Agotado': 0, 'Sin movimiento': 0 }; items.forEach(it => ests[itemStatus(it).est]++);
    const ec = [cOk, '#e0a31f', '#e06a1f', cAcc, '#8a8a96'];
    CH.est = new Chart($('#ch-est'), { type: 'doughnut', data: { labels: Object.keys(ests), datasets: [{ data: Object.values(ests), backgroundColor: ec, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
    // top
    const top = items.map(it => ({ n: it.nombre, v: summarize(it.id, from, to).egr })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
    CH.top = new Chart($('#ch-top'), { type: 'bar', data: { labels: top.map(x => x.n), datasets: [{ data: top.map(x => x.v), backgroundColor: cAcc, borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
  },
};
ACT.scope = el => { S.scope = el.dataset.s; render(); };
ACT.reqAlerts = el => openRequestForm({ tipo: el.dataset.t, fromAlerts: true });

/* ---------------------------- INVENTARIO ---------------------------- */
S.invQ = ''; S.invCat = ''; S.invEst = ''; S.invArch = false;
function invRows() {
  const q = norm(S.invQ);
  return ix().items.filter(i => i.tipo === S.invTab && (S.invArch || i.activo !== false) && (!S.invCat || i.catId === S.invCat) && (!q || norm(i.nombre + ' ' + (i.codigo || '')).includes(q)))
    .map(it => ({ it, st: itemStatus(it) })).filter(r => !S.invEst || r.st.est === S.invEst).sort((a, b) => a.it.nombre.localeCompare(b.it.nombre, 'es'));
}
function invDS() {
  const costos = can('costos');
  const cols = [{ t: 'Código', k: r => r.it.codigo || '' }, { t: 'Artículo', k: r => r.it.nombre }, { t: 'Categoría', k: r => catName(r.it.catId) }, { t: 'Unidad', k: r => r.it.unidad }, { t: 'Existencia', k: r => r.st.st, n: 1, d: 0 },
  { t: 'Mínimo', k: r => r.st.min, n: 1 }, { t: 'Consumo/día', k: r => r.st.u.perDay, n: 1, d: 1 }, { t: 'Cobertura (días)', k: r => r.st.cov === null ? '' : r.st.cov, n: 1, d: 1 }, { t: 'Estado', k: r => r.st.est }];
  if (costos) cols.push({ t: 'Costo', k: r => r.it.costo, n: 1, d: 2 }, { t: 'Precio', k: r => r.it.precio, n: 1, d: 2 }, { t: 'Valor al costo', k: r => Math.max(0, r.st.st) * r.it.costo, n: 1, d: 2 });
  const rows = invRows();
  return { title: S.invTab === 'producto' ? 'Inventario de productos para venta' : 'Inventario de insumos', sub: 'Existencias al ' + fmtDate(today()) + ' · ' + rows.length + ' artículos', cols, rows, foot: { 'Artículo': 'TOTAL', 'Existencia': rows.reduce((a, r) => a + r.st.st, 0), ...(costos ? { 'Valor al costo': rows.reduce((a, r) => a + Math.max(0, r.st.st) * r.it.costo, 0) } : {}) } };
}
EXPSRC.inv = invDS;
function invTable() {
  const rows = invRows(), costos = can('costos');
  if (!rows.length) return `<div class="empty"><b>Sin artículos</b>${S.invQ || S.invCat || S.invEst ? 'Prueba quitando los filtros.' : (can('catalogo') ? 'Pulsa «Nuevo artículo» para crear el primero.' : '')}</div>`;
  const body = rows.map(({ it, st }) => `<tr${it.activo === false ? ' style="opacity:.5"' : ''}><td>${esc(it.codigo || '')}</td><td><b>${esc(it.nombre)}</b>${it.activo === false ? ' <small>(archivado)</small>' : ''}<br><small class="mut">${esc(catName(it.catId))}${it.ubicacion ? ' · ' + esc(it.ubicacion) : ''}</small></td>
    <td class="r"><b>${fmtQty(st.st)}</b> <small class="mut">${esc(it.unidad)}</small></td><td class="r">${st.min || '—'}${it.min > 0 ? '' : st.min ? ' <small class="mut" title="Mínimo calculado según consumo">auto</small>' : ''}</td>
    <td class="r">${fmtN(st.u.perDay, 1)}</td><td class="r">${st.cov === null ? '—' : fmtN(st.cov, 1) + ' d'}</td><td>${statusChip(st)}</td>
    ${costos ? `<td class="r">${it.costo ? fmtN(it.costo, 2) : '—'}</td>${S.invTab === 'producto' ? `<td class="r">${it.precio ? fmtN(it.precio, 2) : '—'}</td>` : ''}<td class="r">${it.costo ? fmtN(Math.max(0, st.st) * it.costo, 2) : '—'}</td>` : ''}
    <td><div class="act">${can('mov') ? `<button class="btn sm icon-btn" title="Registrar ingreso" data-act="movFor" data-id="${it.id}" data-d="in">${ic('plus')}</button><button class="btn sm icon-btn" title="Registrar egreso" data-act="movFor" data-id="${it.id}" data-d="out" style="font-weight:900">−</button>` : ''}<button class="btn sm icon-btn" title="Historial y tiempo de uso" data-act="kardex" data-id="${it.id}">${ic('clock')}</button>${can('catalogo') ? `<button class="btn sm icon-btn" title="Editar" data-act="editItem" data-id="${it.id}">${ic('edit')}</button>` : ''}</div></td></tr>`).join('');
  return `<div class="tw"><table><thead><tr><th>Código</th><th>Artículo</th><th class="r">Existencia</th><th class="r">Mínimo</th><th class="r">Consumo/día</th><th class="r">Cobertura</th><th>Estado</th>${costos ? `<th class="r">Costo</th>${S.invTab === 'producto' ? '<th class="r">Precio</th>' : ''}<th class="r">Valor</th>` : ''}<th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}
PAGES.inventario = {
  title: 'Inventario',
  html() {
    const n = t => ix().items.filter(i => i.tipo === t && i.activo !== false).length;
    return `<div class="tabs"><button data-act="invtab" data-t="producto" class="${S.invTab === 'producto' ? 'on' : ''}">Productos para venta (${n('producto')})</button><button data-act="invtab" data-t="insumo" class="${S.invTab === 'insumo' ? 'on' : ''}">Insumos (${n('insumo')})</button></div>
    <div class="tools"><input class="search" id="invq" placeholder="Buscar por nombre o código…" value="${esc(S.invQ)}" data-input="invq">
      <select data-change="invcat">${catOptions(S.invCat, S.invTab).replace('— Sin categoría —', 'Todas las categorías')}</select>
      <select data-change="invest"><option value="">Todos los estados</option>${['OK', 'Por agotarse', 'Bajo mínimo', 'Agotado', 'Sin movimiento'].map(e => `<option ${S.invEst === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:500"><input type="checkbox" style="width:auto" ${S.invArch ? 'checked' : ''} data-change="invarch"> archivados</label>
      <span class="sp"></span>${expBtns('inv')}${can('catalogo') ? `<button class="btn pri" data-act="newItem">${ic('plus')} Nuevo artículo</button>` : ''}</div>
    <div id="invtable">${invTable()}</div>`;
  },
};
ACT.invtab = el => { S.invTab = el.dataset.t; S.invCat = ''; render(); };
INP.invq = el => { S.invQ = el.value; $('#invtable').innerHTML = invTable(); };
CHG.invcat = el => { S.invCat = el.value; $('#invtable').innerHTML = invTable(); };
CHG.invest = el => { S.invEst = el.value; $('#invtable').innerHTML = invTable(); };
CHG.invarch = el => { S.invArch = el.checked; $('#invtable').innerHTML = invTable(); };
ACT.newItem = () => openItem();
ACT.editItem = el => openItem(el.dataset.id);

function openItem(id) {
  const it = id ? itemById(id) : { tipo: S.invTab, nombre: '', codigo: '', catId: '', unidad: 'unidad', pack: 0, min: 0, max: 0, costo: 0, precio: 0, provId: '', ubicacion: '', nota: '', duracionEsp: 0, activo: true };
  const costos = can('costos');
  openModal({
    title: id ? 'Editar artículo' : 'Nuevo artículo', size: 'mid',
    body: `<form id="itemform" data-submit="item" data-tipo="${it.tipo}"><input type="hidden" name="id" value="${id || ''}">
     <div class="grid g3"><div class="fld"><label>Tipo</label><select name="tipo" ${id ? 'disabled' : ''} data-change="itemtipo"><option value="producto" ${it.tipo === 'producto' ? 'selected' : ''}>Producto para venta</option><option value="insumo" ${it.tipo === 'insumo' ? 'selected' : ''}>Insumo (uso interno)</option></select></div>
      <div class="fld" style="grid-column:span 2"><label>Nombre del artículo *</label><input name="nombre" required value="${esc(it.nombre)}" maxlength="80"></div></div>
     <div class="grid g3"><div class="fld"><label>Código / SKU</label><input name="codigo" value="${esc(it.codigo)}"></div>
      <div class="fld"><label>Categoría</label><select name="catId">${catOptions(it.catId, it.tipo)}</select></div>
      <div class="fld"><label>…o crear categoría nueva</label><input name="catNueva" placeholder="Ej. Limpieza"></div></div>
     <div class="grid g4"><div class="fld"><label>Unidad de medida</label><input name="unidad" list="unidades" value="${esc(it.unidad)}"><datalist id="unidades">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</datalist></div>
      <div class="fld"><label>Unidades por caja / paquete</label><input name="pack" type="number" min="0" step="any" value="${it.pack || ''}" placeholder="Ej. 24"></div>
      <div class="fld"><label>Stock mínimo</label><input name="min" type="number" min="0" step="any" value="${it.min || ''}" placeholder="auto"></div>
      <div class="fld"><label>Stock máximo</label><input name="max" type="number" min="0" step="any" value="${it.max || ''}" placeholder="auto"></div></div>
     <div class="grid g4">${costos ? `<div class="fld"><label>Costo unitario (${cfg().moneda})</label><input name="costo" type="number" min="0" step="any" value="${it.costo || ''}"></div><div class="fld only-prod"><label>Precio de venta (${cfg().moneda})</label><input name="precio" type="number" min="0" step="any" value="${it.precio || ''}"></div>` : ''}
      <div class="fld"><label>Proveedor habitual</label><select name="provId">${provOptions(it.provId)}</select></div>
      <div class="fld"><label>Ubicación</label><input name="ubicacion" value="${esc(it.ubicacion)}" placeholder="Bodega, recepción…"></div></div>
     <div class="grid g2"><div class="fld only-ins"><label>Duración esperada de 1 unidad (días)</label><input name="duracionEsp" type="number" min="0" step="any" value="${it.duracionEsp || ''}" placeholder="Opcional: para comparar con el uso real"></div>
      <div class="fld"><label>Notas</label><input name="nota" value="${esc(it.nota)}"></div></div>
     ${id ? `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="activo" style="width:auto" ${it.activo !== false ? 'checked' : ''}> Artículo activo (desmarca para archivarlo)</label>`
        : `<div class="card" style="background:var(--soft);box-shadow:none"><h3>Existencia inicial</h3><div class="grid g3"><div class="fld"><label>Fecha</label><input type="date" name="fechaIni" value="${today()}" max="${today()}"></div><div class="fld"><label>Cantidad</label><input type="number" name="cantIni" min="0" step="any" placeholder="0"></div><div class="fld"><label>Documento / referencia</label><input name="docIni"></div></div></div>`}
     <div class="mf" style="padding:12px 0 0;border:0">${id && !ix().byItem.get(id) && can('catalogo') ? `<button type="button" class="btn danger" data-act="delItem" data-id="${id}" style="margin-right:auto">${ic('trash')} Eliminar</button>` : ''}<button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">${id ? 'Guardar cambios' : 'Crear artículo'}</button></div></form>
     <style>#itemform[data-tipo=producto] .only-ins{display:none}#itemform[data-tipo=insumo] .only-prod{display:none}</style>`,
  });
}
CHG.itemtipo = el => { const f = el.form; f.dataset.tipo = el.value; f.elements.catId.innerHTML = catOptions('', el.value); };
SUB.item = async f => {
  const id = f.elements.id.value, old = id ? itemById(id) : null; const g = n => f.elements[n]?.value ?? '';
  const nombre = g('nombre').trim(); if (!nombre) return;
  const tipo = old ? old.tipo : g('tipo');
  if (ix().items.some(i => i.id !== id && i.tipo === tipo && norm(i.nombre) === norm(nombre))) return toast('Ya existe un artículo con ese nombre', 'bad');
  let catId = g('catId'); if (g('catNueva').trim()) catId = ensureCategory(g('catNueva').trim(), tipo);
  const rec = { ...(old || { id: uid(), activo: true }), tipo, nombre, codigo: g('codigo').trim(), catId, unidad: g('unidad').trim() || 'unidad', pack: num(g('pack')), min: num(g('min')), max: num(g('max')), provId: g('provId'), ubicacion: g('ubicacion').trim(), nota: g('nota').trim(), duracionEsp: num(g('duracionEsp')) };
  if (can('costos')) { rec.costo = num(g('costo')); rec.precio = tipo === 'producto' ? num(g('precio')) : 0; }
  else if (!old) { rec.costo = 0; rec.precio = 0; }
  if (old) rec.activo = f.elements.activo.checked;
  put('items', rec);
  if (!old) {
    const q = num(g('cantIni'));
    if (q > 0) put('movements', mkMove({ itemId: rec.id, dir: 'in', tipo: 'inicial', cant: q, fecha: g('fechaIni') || today(), doc: g('docIni'), costoU: rec.costo, nota: 'Existencia inicial', hora: '00:01' }));
    log('Nuevo artículo', nombre);
  } else log('Editar artículo', nombre);
  closeModal(); toast('Artículo guardado', 'ok'); render();
};
ACT.delItem = async el => { const it = itemById(el.dataset.id); if (await confirmBox(`¿Eliminar «${esc(it.nombre)}»? Solo es posible porque no tiene movimientos.`, 'Eliminar', true)) { del('items', it.id); log('Eliminar artículo', it.nombre); closeModal(); render(); } };

/* ---- historial / kardex / tiempo de uso ---- */
EXPSRC.kardexItem = () => kardexDS(S.kardexId, '0000-01-01', '9999-12-31');
function kardexDS(id, from, to) {
  const it = itemById(id); let saldo = stockBefore(id, from); const rows = [];
  if (from > '0000-01-01') rows.push({ fecha: '', hora: '', turno: '', concepto: 'Saldo inicial', ent: '', sal: '', saldo, doc: '', user: '', nota: '' });
  for (const m of (ix().byItem.get(id) || [])) {
    if (m.fecha < from || m.fecha > to) continue; saldo += signed(m);
    rows.push({ fecha: fmtDate(m.fecha), hora: m.hora, turno: m.turno, concepto: TIPO_LABEL[m.tipo], ent: m.dir === 'in' ? m.cant : '', sal: m.dir === 'out' ? m.cant : '', saldo, doc: m.doc || '', user: userName(m.userId), nota: m.nota || '' });
  }
  return { title: 'Kardex · ' + it.nombre, sub: `Unidad: ${it.unidad} · ${from > '0000-01-01' ? fmtDate(from) + ' al ' + fmtDate(to) : 'historial completo'}`, cols: [{ t: 'Fecha', k: 'fecha' }, { t: 'Hora', k: 'hora' }, { t: 'Turno', k: 'turno' }, { t: 'Concepto', k: 'concepto' }, { t: 'Entrada', k: 'ent', n: 1 }, { t: 'Salida', k: 'sal', n: 1 }, { t: 'Saldo', k: 'saldo', n: 1 }, { t: 'Documento', k: 'doc' }, { t: 'Usuario', k: 'user' }, { t: 'Notas', k: 'nota' }], rows };
}
ACT.kardex = el => {
  const it = itemById(el.dataset.id); S.kardexId = it.id; const s = itemStatus(it), lf = lotsOf(it.id);
  const lotRows = lf.lots.slice().reverse().slice(0, 12).map(l => `<tr><td>${fmtDate(l.fecha)}</td><td>${l.tipo === 'inicial' ? 'Existencia inicial' : TIPO_LABEL[l.tipo] || 'Ingreso'}</td><td class="r">${fmtQty(l.cant)}</td><td>${l.cierre ? fmtDate(l.cierre) : '<span class="chip info">en uso: ' + fmtQty(l.rest) + ' restantes</span>'}</td><td class="r">${l.dias ? l.dias + ' d' : l.cierre ? '1 d' : daysBetween(l.fecha, today()) + ' d (en curso)'}</td><td>${l.vence ? fmtDate(l.vence) : ''}</td></tr>`).join('');
  const ds = kardexDS(it.id, '0000-01-01', '9999-12-31');
  const stat = (l, v) => `<div class="kpi" style="padding:10px 12px"><small>${l}</small><b style="font-size:19px">${v}</b></div>`;
  const dur = it.duracionEsp > 0 && lf.avgLife ? `${fmtN(lf.avgLife, 0)} d real vs ${fmtN(it.duracionEsp, 0)} d esperado` : (lf.avgLife ? fmtN(lf.avgLife, 0) + ' días' : '—');
  openModal({
    title: `${esc(it.nombre)} <span style="margin-left:8px">${statusChip(s)}</span>`, size: 'wide',
    body: `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${stat('Existencia', fmtQty(s.st) + ' ' + esc(it.unidad))}${stat('Consumo / día', fmtN(s.u.perDay, 2))}${stat('Cobertura', s.cov === null ? '—' : fmtN(s.cov, 1) + ' días')}${stat('Se agota aprox.', s.agot ? fmtDate(s.agot) : '—')}${stat('Vida prom. de un lote', dur)}${stat('Cada cuánto se repone', lf.cicloRepo ? fmtN(lf.cicloRepo, 0) + ' días' : '—')}</div>
    <h4 class="mb">Lotes de ingreso y cuánto duraron <small class="mut">(método PEPS: lo primero que entra es lo primero que sale)</small></h4>
    <div class="tw mb"><table><thead><tr><th>Ingresó</th><th>Origen</th><th class="r">Cantidad</th><th>Se agotó</th><th class="r">Duración</th><th>Vence</th></tr></thead><tbody>${lotRows || '<tr><td colspan="6" class="empty">Sin ingresos registrados</td></tr>'}</tbody></table></div>
    <div class="row mb"><h4 class="sp">Historial de movimientos</h4>${expBtns('kardexItem')}</div>${dsTable({ ...ds, rows: ds.rows.slice().reverse().slice(0, 150) }, { maxh: '300px' })}`,
  });
};

/* ---------------------------- MOVIMIENTOS ---------------------------- */
S.mv = { q: '', dir: '', item: '', user: '', lim: 300 };
function movDS() {
  const { from, to } = periodRange(), q = norm(S.mv.q);
  let rows = ix().moves.filter(m => m.fecha >= from && m.fecha <= to);
  if (S.mv.dir) rows = rows.filter(m => S.mv.dir === 'in' ? G_IN.includes(m.tipo) : S.mv.dir === 'out' ? G_OUT.includes(m.tipo) : G_ADJ.includes(m.tipo));
  if (S.mv.item) rows = rows.filter(m => m.itemId === S.mv.item);
  if (S.mv.user) rows = rows.filter(m => m.userId === S.mv.user);
  if (q) rows = rows.filter(m => norm([itemById(m.itemId).nombre, m.doc, m.nota, userName(m.userId), TIPO_LABEL[m.tipo]].join(' ')).includes(q));
  rows = rows.slice().reverse();
  const costos = can('costos');
  const cols = [{ t: 'Fecha', k: m => fmtDate(m.fecha) }, { t: 'Hora', k: 'hora' }, { t: 'Turno', k: 'turno' }, { t: 'Artículo', k: m => itemById(m.itemId).nombre }, { t: 'Concepto', k: m => TIPO_LABEL[m.tipo] },
  { t: 'Entrada', k: m => m.dir === 'in' ? m.cant : '', n: 1 }, { t: 'Salida', k: m => m.dir === 'out' ? m.cant : '', n: 1 }];
  if (costos) cols.push({ t: 'Valor', k: m => { const v = m.tipo === 'venta' ? (m.precioU ?? itemById(m.itemId).precio) : m.costoU; return v ? m.cant * v : ''; }, n: 1, d: 2 });
  cols.push({ t: 'Documento', k: m => m.doc || '' }, { t: 'Proveedor', k: m => provName(m.provId) }, { t: 'Usuario', k: m => userName(m.userId) }, { t: 'Notas', k: m => m.nota || '' });
  const fin = rows.reduce((a, m) => a + (m.dir === 'in' ? m.cant : 0), 0), fout = rows.reduce((a, m) => a + (m.dir === 'out' ? m.cant : 0), 0);
  return { title: 'Movimientos de inventario', sub: `${periodLabel()} (${fmtDate(from)} al ${fmtDate(to)}) · ${rows.length} movimientos`, cols, rows, foot: { 'Concepto': 'TOTAL', 'Entrada': fin, 'Salida': fout } };
}
EXPSRC.mov = movDS;
function movTable() {
  const ds = movDS(), shown = ds.rows.slice(0, S.mv.lim);
  if (!ds.rows.length) return `<div class="empty"><b>Sin movimientos</b>No hay movimientos con estos filtros en el periodo.</div>`;
  const body = shown.map(m => `<tr><td>${fmtDate(m.fecha)}<br><small class="mut">${esc(m.hora || '')} ${esc(m.turno || '')}</small></td><td><b>${esc(itemById(m.itemId).nombre)}</b></td>
    <td><span class="${m.dir === 'in' ? 'in-chip' : 'out-chip'}">${m.dir === 'in' ? '▲' : '▼'}</span> ${esc(TIPO_LABEL[m.tipo])}</td><td class="r"><b class="${m.dir === 'in' ? 'in-chip' : 'out-chip'}">${m.dir === 'in' ? '+' : '−'}${fmtQty(m.cant)}</b></td>
    <td>${esc(m.doc || '')}${m.provId ? '<br><small class="mut">' + esc(provName(m.provId)) + '</small>' : ''}</td><td>${esc(userName(m.userId))}</td><td style="max-width:260px"><small>${esc(m.nota || '')}</small></td>
    <td><div class="act">${can('mov') && !m.src?.startsWith('turno') && m.src !== 'conteo' ? `<button class="btn sm icon-btn" title="Editar" data-act="editMov" data-id="${m.id}">${ic('edit')}</button>` : ''}${can('anular') ? `<button class="btn sm icon-btn" title="Anular" data-act="voidMov" data-id="${m.id}">${ic('trash')}</button>` : ''}</div></td></tr>`).join('');
  const ing = ds.foot.Entrada, egr = ds.foot.Salida;
  return `<div class="row mb"><span class="chip ok">Entradas: +${fmtQty(ing)}</span><span class="chip bad">Salidas: −${fmtQty(egr)}</span><span class="chip mut">Neto: ${fmtQty(ing - egr)}</span><small class="mut">${ds.rows.length} movimientos</small></div>
  <div class="tw"><table><thead><tr><th>Fecha</th><th>Artículo</th><th>Concepto</th><th class="r">Cantidad</th><th>Documento</th><th>Usuario</th><th>Notas</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
  ${ds.rows.length > S.mv.lim ? `<div class="mt" style="text-align:center"><button class="btn" data-act="mvmore">Mostrar más (${ds.rows.length - S.mv.lim} restantes)</button></div>` : ''}`;
}
PAGES.movimientos = {
  title: 'Movimientos',
  html() {
    return `<div class="tools"><input class="search" placeholder="Buscar artículo, documento, nota, usuario…" value="${esc(S.mv.q)}" data-input="mvq">
     <select data-change="mvdir"><option value="">Todos los tipos</option><option value="in" ${S.mv.dir === 'in' ? 'selected' : ''}>Ingresos</option><option value="out" ${S.mv.dir === 'out' ? 'selected' : ''}>Egresos</option><option value="adj" ${S.mv.dir === 'adj' ? 'selected' : ''}>Ajustes / inicial</option></select>
     <select data-change="mvitem">${itemOptions(S.mv.item).replace('— Seleccionar artículo —', 'Todos los artículos')}</select>
     <select data-change="mvuser"><option value="">Todos los usuarios</option>${L('users').map(u => `<option value="${u.id}" ${S.mv.user === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>
     <span class="sp"></span>${expBtns('mov')}${can('mov') ? `<button class="btn pri" data-act="newMov">${ic('plus')} Nuevo movimiento</button>` : ''}</div><div id="mvtable">${movTable()}</div>`;
  },
};
INP.mvq = el => { S.mv.q = el.value; S.mv.lim = 300; $('#mvtable').innerHTML = movTable(); };
CHG.mvdir = el => { S.mv.dir = el.value; $('#mvtable').innerHTML = movTable(); }; CHG.mvitem = el => { S.mv.item = el.value; $('#mvtable').innerHTML = movTable(); }; CHG.mvuser = el => { S.mv.user = el.value; $('#mvtable').innerHTML = movTable(); };
ACT.mvmore = () => { S.mv.lim += 300; $('#mvtable').innerHTML = movTable(); };
ACT.voidMov = async el => {
  const m = DB.movements.find(x => x.id === el.dataset.id); const it = itemById(m.itemId);
  if (!await confirmBox(`¿Anular este movimiento?<br><b>${esc(it.nombre)}</b> · ${m.dir === 'in' ? '+' : '−'}${m.cant} · ${fmtDate(m.fecha)}<br><small>Quedará registrado en la bitácora.</small>`, 'Anular', true)) return;
  del('movements', m.id); log('Anular movimiento', `${it.nombre} ${m.dir === 'in' ? '+' : '-'}${m.cant} (${fmtDate(m.fecha)}, ${TIPO_LABEL[m.tipo]})`); toast('Movimiento anulado'); render();
};

/* ---- ficha de movimiento (ingreso / egreso, varias líneas) ---- */
const tipoOpts = (dir, sel) => Object.entries(dir === 'in' ? TIPOS_IN : TIPOS_OUT).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
function movLine(l = {}) {
  const costos = can('costos');
  return `<tr class="ml"><td><select name="itemId" data-change="movitem">${itemOptions(l.itemId)}</select><span class="ex"></span></td><td><input class="q" name="cant" type="number" step="any" min="0" value="${l.cant ?? ''}" placeholder="0"></td>
   ${costos ? `<td class="only-in"><input class="q" name="costo" type="number" step="any" min="0" value="${l.costoU || ''}"></td><td class="only-venta"><input class="q" name="precio" type="number" step="any" min="0" value="${l.precioU || ''}"></td>` : ''}
   <td class="only-in"><input type="date" name="vence" value="${l.vence || ''}" style="width:135px"></td><td><button type="button" class="btn ghost icon-btn" data-act="mlrem" title="Quitar">${ic('x')}</button></td></tr>`;
}
function openMov(pre = {}) {
  const e = pre.edit ? DB.movements.find(m => m.id === pre.edit) : null, dir = e?.dir || pre.dir || 'in', tipo = e?.tipo || pre.tipo || (dir === 'in' ? 'compra' : 'venta'), hora = e?.hora || nowHM(), costos = can('costos');
  openModal({
    title: e ? 'Editar movimiento' : 'Registrar movimiento', size: 'wide',
    body: `<form id="movform" data-submit="mov" data-dir="${dir}" data-tipo="${tipo}"><input type="hidden" name="editId" value="${e?.id || ''}">
    <div class="row mb"><div class="seg red"><button type="button" data-act="movdir" data-d="in" class="${dir === 'in' ? 'on' : ''}">▲ Ingreso</button><button type="button" data-act="movdir" data-d="out" class="${dir === 'out' ? 'on' : ''}">▼ Egreso</button></div></div>
    <div class="grid g4"><div class="fld"><label>Fecha *</label><input type="date" name="fecha" required value="${e?.fecha || pre.fecha || today()}"></div><div class="fld"><label>Hora</label><input type="time" name="hora" value="${hora}"></div>
     <div class="fld"><label>Turno</label><select name="turno"><option value="AM" ${(e?.turno || (hora < '14:00' ? 'AM' : 'PM')) === 'AM' ? 'selected' : ''}>${esc(cfg().turnoAM)}</option><option value="PM" ${(e?.turno || (hora < '14:00' ? 'AM' : 'PM')) === 'PM' ? 'selected' : ''}>${esc(cfg().turnoPM)}</option></select></div>
     <div class="fld"><label>Concepto *</label><select name="tipo" data-change="movtipo">${tipoOpts(dir, tipo)}</select></div></div>
    <div class="grid g3"><div class="fld"><label>Documento / factura / referencia</label><input name="doc" value="${esc(e?.doc || pre.doc || '')}"></div><div class="fld only-in"><label>Proveedor</label><select name="provId">${provOptions(e?.provId || pre.provId)}</select></div></div>
    <div class="tw mb"><table class="lines"><thead><tr><th>Artículo *</th><th class="r">Cantidad *</th>${costos ? '<th class="r only-in">Costo unit.</th><th class="r only-venta">Precio unit.</th>' : ''}<th class="only-in">Vence</th><th></th></tr></thead><tbody id="mlines">${movLine(e ? { itemId: e.itemId, cant: e.cant, costoU: e.costoU, precioU: e.precioU, vence: e.vence } : { itemId: pre.itemId })}</tbody></table></div>
    ${e ? '' : `<button type="button" class="btn sm mb" data-act="mladd">${ic('plus')} Agregar otro artículo</button>`}
    <div class="fld"><label>Notas / observaciones</label><textarea name="nota" placeholder="Ej. Pedido semanal, entregado por…">${esc(e?.nota || '')}</textarea></div>
    <div class="mf" style="padding:8px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button>${e ? '' : '<button class="btn" name="again" value="1">Guardar y registrar otro</button>'}<button class="btn pri">Guardar</button></div></form>`,
  });
  $$('#mlines select[name=itemId]').forEach(s => CHG.movitem(s));
}
ACT.newMov = () => openMov({});
ACT.movFor = el => openMov({ itemId: el.dataset.id, dir: el.dataset.d });
ACT.editMov = el => openMov({ edit: el.dataset.id });
ACT.mladd = () => { $('#mlines').insertAdjacentHTML('beforeend', movLine()); };
ACT.mlrem = el => { if ($$('#mlines .ml').length > 1) el.closest('tr').remove(); };
ACT.movdir = el => { const f = $('#movform'), d = el.dataset.d; f.dataset.dir = d; $$('.seg button', f).forEach(b => b.classList.toggle('on', b.dataset.d === d)); const t = d === 'in' ? 'compra' : 'venta'; f.elements.tipo.innerHTML = tipoOpts(d, t); f.dataset.tipo = t; };
CHG.movtipo = el => { el.form.dataset.tipo = el.value; };
CHG.movitem = el => {
  const tr = el.closest('tr'), it = itemById(el.value), ex = tr.querySelector('.ex'); if (!it) { ex.textContent = ''; return; }
  ex.textContent = `Existencia: ${fmtQty(stockOf(it.id))} ${it.unidad}`;
  const c = tr.querySelector('[name=costo]'), p = tr.querySelector('[name=precio]'); if (c && !c.value && it.costo) c.value = it.costo; if (p && !p.value && it.precio) p.value = it.precio;
};
SUB.mov = async (f, e) => {
  const g = n => f.elements[n]?.value ?? '', dir = f.dataset.dir, tipo = g('tipo'), editId = g('editId');
  const lines = $$('.ml', f).map(tr => ({ itemId: tr.querySelector('[name=itemId]').value, cant: num(tr.querySelector('[name=cant]').value), costo: num(tr.querySelector('[name=costo]')?.value), precio: num(tr.querySelector('[name=precio]')?.value), vence: tr.querySelector('[name=vence]')?.value || '' })).filter(l => l.itemId || l.cant);
  if (!g('fecha')) return toast('Indica la fecha', 'bad');
  if (!lines.length || lines.some(l => !l.itemId || !(l.cant > 0))) return toast('Cada línea necesita un artículo y una cantidad mayor a 0', 'bad');
  if (dir === 'out') { // validar existencias
    const need = {}; lines.forEach(l => need[l.itemId] = (need[l.itemId] || 0) + l.cant);
    const bad = Object.entries(need).filter(([id, q]) => stockOf(id) + (editId ? (DB.movements.find(m => m.id === editId)?.itemId === id ? DB.movements.find(m => m.id === editId).cant : 0) : 0) < q);
    if (bad.length && !await confirmBox(`Existencia insuficiente en: <b>${bad.map(([id]) => esc(itemById(id).nombre)).join(', ')}</b>.<br>El inventario quedaría en negativo. ¿Registrar de todos modos?`, 'Registrar igual')) return;
  }
  if (editId) del('movements', editId);
  const nuevos = lines.map(l => {
    const it = itemById(l.itemId);
    return put('movements', mkMove({ itemId: l.itemId, dir, tipo, cant: l.cant, fecha: g('fecha'), hora: g('hora') || nowHM(), turno: g('turno'), doc: g('doc'), provId: dir === 'in' ? g('provId') : '', vence: dir === 'in' ? l.vence : '', nota: g('nota'), costoU: can('costos') ? (dir === 'in' ? l.costo : (l.costo || it.costo)) : it.costo, precioU: tipo === 'venta' ? (can('costos') && l.precio ? l.precio : it.precio) : 0 }));
  });
  if (can('costos') && dir === 'in' && tipo === 'compra') lines.forEach(l => { const it = itemById(l.itemId); if (l.costo > 0 && l.costo !== it.costo) put('items', { ...it, costo: l.costo }); }); // último costo de compra
  log(editId ? 'Editar movimiento' : (dir === 'in' ? 'Ingreso' : 'Egreso'), `${TIPO_LABEL[tipo]}: ` + lines.map(l => `${itemById(l.itemId).nombre} x${l.cant}`).join(', '));
  toast(`${nuevos.length} movimiento(s) guardado(s)`, 'ok');
  if (e.submitter?.name === 'again') { closeModal(); openMov({ dir, tipo, fecha: g('fecha'), doc: g('doc'), provId: g('provId') }); } else { closeModal(); render(); }
};

/* =====================================================================
   PÁGINAS B: Cierre de turno · Conteo físico · Solicitudes · Reportes
   ===================================================================== */

/* ---------------------------- CIERRE DE TURNO ---------------------------- */
S.turno = { fecha: today(), turno: nowHM() < '14:00' ? 'AM' : 'PM', tipo: 'producto' };
const shiftOf = m => m.turno || ((m.hora || '12:00') < '14:00' ? 'AM' : 'PM');
const turnoKey = () => `${S.turno.fecha}|${S.turno.turno}`;
function turnoCalc(it) {
  const key = turnoKey(), { fecha, turno } = S.turno; let ini = 0, otros = 0, vendio = 0, fisico = null, tuvo = false;
  for (const m of (ix().byItem.get(it.id) || [])) {
    if (m.turnoKey === key && (m.src === 'turno' || m.src === 'turno-aj')) { tuvo = true; if (m.src === 'turno') vendio += m.cant; else if (m.fisico !== undefined && m.fisico !== null) fisico = m.fisico; continue; }
    if (m.fecha > fecha) break;
    const sh = shiftOf(m);
    if (m.fecha < fecha || (turno === 'PM' && sh === 'AM')) ini += signed(m);
    else if (m.fecha === fecha && sh === turno) otros += signed(m);
  }
  return { ini, otros, vendio, fisico, tuvo };
}
PAGES.turno = {
  title: 'Cierre de turno',
  html() {
    const T = S.turno, items = ix().items.filter(i => i.activo !== false && i.tipo === T.tipo).sort((a, b) => catName(a.catId).localeCompare(catName(b.catId), 'es') || a.nombre.localeCompare(b.nombre, 'es'));
    const verbo = T.tipo === 'producto' ? 'Vendió' : 'Usó';
    const rows = items.map(it => ({ it, c: turnoCalc(it) }));
    const ya = rows.some(r => r.c.tuvo);
    const prev = DB.movements.find(m => !m.del && m.turnoKey === turnoKey() && m.src === 'turno');
    const body = rows.map(({ it, c }) => {
      const tot = c.ini + c.otros - c.vendio, dif = c.fisico === null ? null : c.fisico - tot;
      return `<tr data-id="${it.id}" data-ini="${c.ini}" data-otros="${c.otros}"><td><b>${esc(it.nombre)}</b></td><td class="r">${fmtQty(c.ini)}</td><td class="r">${c.otros ? (c.otros > 0 ? '+' : '') + fmtQty(c.otros) : '—'}</td>
      <td class="r"><input class="q" type="number" min="0" step="any" name="vendio" value="${c.vendio || ''}" placeholder="0" data-input="turnorow"></td><td class="r"><b class="tot">${fmtQty(tot)}</b></td>
      <td class="r"><input class="q" type="number" min="0" step="any" name="fisico" value="${c.fisico ?? ''}" placeholder="—" data-input="turnorow"></td><td class="r dif">${dif === null ? '' : dif === 0 ? '✓' : (dif > 0 ? '+' : '') + fmtQty(dif)}</td></tr>`;
    }).join('');
    return `<div class="note">Replica tu hoja de <b>INVENTARIO INTERNO</b>: la existencia al inicio del turno sale del sistema; solo escribe lo que se <b>${verbo.toLowerCase()}</b> y, si cuentas físicamente, la <b>existencia contada</b> al cerrar. Si hay diferencia, se registra automáticamente un ajuste.</div>
    <div class="tools"><div class="fld" style="margin:0"><label>Fecha</label><input type="date" value="${T.fecha}" max="${today()}" data-change="turnofecha" style="width:auto"></div>
     <div class="fld" style="margin:0"><label>Turno</label><div class="seg"><button data-act="turnoset" data-k="turno" data-v="AM" class="${T.turno === 'AM' ? 'on' : ''}">${esc(cfg().turnoAM)}</button><button data-act="turnoset" data-k="turno" data-v="PM" class="${T.turno === 'PM' ? 'on' : ''}">${esc(cfg().turnoPM)}</button></div></div>
     <div class="fld" style="margin:0"><label>Qué registras</label><div class="seg"><button data-act="turnoset" data-k="tipo" data-v="producto" class="${T.tipo === 'producto' ? 'on' : ''}">Productos para venta</button><button data-act="turnoset" data-k="tipo" data-v="insumo" class="${T.tipo === 'insumo' ? 'on' : ''}">Insumos</button></div></div>
     <span class="sp"></span>${ya ? `<span class="chip info">Ya registrado${prev ? ' por ' + esc(userName(prev.userId)) : ''} · puedes corregirlo</span>` : ''}</div>
    ${rows.length ? `<div class="tw"><table id="turnotbl"><thead><tr><th>Artículo</th><th class="r">Inicio de turno</th><th class="r" title="Ingresos y otros movimientos de este turno">Otros mov.</th><th class="r">${verbo} en turno</th><th class="r">Total</th><th class="r">Existencia contada</th><th class="r">Diferencia</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="fld mt"><label>Observaciones del turno</label><textarea id="turnonota" placeholder="Ej. Ingreso de mercadería, faltante pendiente de reponer…"></textarea></div>
    <div class="row"><span class="sp"></span><button class="btn pri" data-act="turnoSave">${ic('check')} Guardar cierre de ${esc(T.turno === 'AM' ? cfg().turnoAM : cfg().turnoPM)}</button></div>`
        : `<div class="card empty"><b>No hay ${T.tipo === 'producto' ? 'productos' : 'insumos'} registrados</b>Agrégalos en Inventario.</div>`}`;
  },
};
ACT.turnoset = el => { S.turno[el.dataset.k] = el.dataset.v; render(); };
CHG.turnofecha = el => { if (el.value) { S.turno.fecha = el.value; render(); } };
INP.turnorow = el => {
  const tr = el.closest('tr'), v = tr.querySelector('[name=vendio]').value, f = tr.querySelector('[name=fisico]').value;
  const tot = num(tr.dataset.ini) + num(tr.dataset.otros) - num(v); tr.querySelector('.tot').textContent = fmtQty(tot);
  const d = tr.querySelector('.dif'); if (f === '') { d.textContent = ''; tr.classList.remove('diff'); } else { const df = num(f) - tot; d.textContent = df === 0 ? '✓' : (df > 0 ? '+' : '') + fmtQty(df); tr.classList.toggle('diff', df !== 0); }
};
ACT.turnoSave = async () => {
  const T = S.turno, key = turnoKey(), nota = ($('#turnonota')?.value || '').trim(), lbl = T.turno === 'AM' ? cfg().turnoAM : cfg().turnoPM;
  const rows = $$('#turnotbl tbody tr').map(tr => ({ id: tr.dataset.id, ini: num(tr.dataset.ini), otros: num(tr.dataset.otros), vendio: num(tr.querySelector('[name=vendio]').value), fisico: tr.querySelector('[name=fisico]').value === '' ? null : num(tr.querySelector('[name=fisico]').value) }));
  const neg = rows.filter(r => r.ini + r.otros - r.vendio < 0);
  if (neg.length && !await confirmBox(`Hay artículos con salida mayor a la existencia: <b>${neg.map(r => esc(itemById(r.id).nombre)).join(', ')}</b>. ¿Guardar de todos modos?`, 'Guardar igual')) return;
  // reemplazar cierre previo del mismo turno y tipo
  DB.movements.filter(m => !m.del && m.turnoKey === key && (m.src === 'turno' || m.src === 'turno-aj') && itemById(m.itemId)?.tipo === T.tipo).forEach(m => del('movements', m.id));
  let n = 0, adj = 0; const hSale = T.turno === 'AM' ? '11:00' : '19:00', hAdj = T.turno === 'AM' ? '11:01' : '19:01';
  for (const r of rows) {
    const it = itemById(r.id);
    if (r.vendio > 0) { put('movements', mkMove({ itemId: it.id, dir: 'out', tipo: T.tipo === 'producto' ? 'venta' : 'uso', cant: r.vendio, fecha: T.fecha, hora: hSale, turno: T.turno, src: 'turno', turnoKey: key, costoU: it.costo, precioU: T.tipo === 'producto' ? it.precio : 0, nota: `Cierre ${lbl}${nota ? ': ' + nota : ''}` })); n++; }
    if (r.fisico !== null) {
      const tot = r.ini + r.otros - r.vendio, dif = r.fisico - tot;
      if (dif !== 0) { put('movements', mkMove({ itemId: it.id, dir: dif > 0 ? 'in' : 'out', tipo: dif > 0 ? 'ajuste_mas' : 'ajuste_menos', cant: Math.abs(dif), fecha: T.fecha, hora: hAdj, turno: T.turno, src: 'turno-aj', turnoKey: key, fisico: r.fisico, costoU: it.costo, nota: `Diferencia al cerrar ${lbl}: sistema ${fmtQty(tot)}, contado ${fmtQty(r.fisico)}${nota ? '. ' + nota : ''}` })); adj++; }
    }
  }
  log('Cierre de turno', `${fmtDate(T.fecha)} ${lbl} · ${T.tipo === 'producto' ? 'productos' : 'insumos'} · ${n} salidas, ${adj} ajustes`);
  toast(`Cierre guardado: ${n} salidas${adj ? ` y ${adj} ajuste(s) por diferencia` : ''}`, 'ok'); render();
};

/* ---------------------------- CONTEO FÍSICO ---------------------------- */
S.cnt = { fecha: today(), tipo: 'todo' };
PAGES.conteo = {
  title: 'Conteo físico y cuadre',
  html() {
    const C = S.cnt, items = ix().items.filter(i => i.activo !== false && (C.tipo === 'todo' || i.tipo === C.tipo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const body = items.map(it => { const sis = stockOf(it.id, C.fecha); return `<tr data-id="${it.id}" data-sis="${sis}"><td><b>${esc(it.nombre)}</b><br><small class="mut">${it.tipo === 'insumo' ? 'Insumo' : 'Producto'} · ${esc(it.unidad)}</small></td><td class="r"><b>${fmtQty(sis)}</b></td><td class="r"><input class="q" type="number" min="0" step="any" name="fis" placeholder="—" data-input="cntrow"></td><td class="r dif"></td>
      <td><select name="mot" style="min-width:170px;display:none"><option>Faltante sin explicar</option><option>Producto entregado sin cobrar</option><option>Consumo de colaborador</option><option>Error de registro</option><option>Producto dañado / vencido</option><option>Sobrante</option><option>Otro</option></select></td></tr>`; }).join('');
    const hist = L('counts').sort((a, b) => b.fecha.localeCompare(a.fecha) || b.u - a.u).slice(0, 25).map(c => { const dif = c.lines.filter(l => l.fisico !== l.sistema).length; return `<tr><td>${fmtDate(c.fecha)}</td><td>${esc(userName(c.userId))}</td><td class="r">${c.lines.length}</td><td class="r">${dif ? `<span class="chip warn">${dif} con diferencia</span>` : '<span class="chip ok">sin diferencias</span>'}</td><td>${c.aplicado ? '<span class="chip ok">ajustado</span>' : (dif ? '<span class="chip warn">pendiente de ajustar</span>' : '')}</td><td><div class="act"><button class="btn sm" data-act="cntView" data-id="${c.id}">Ver</button>${!c.aplicado && dif && can('ajuste') ? `<button class="btn sm pri" data-act="cntApply" data-id="${c.id}">Aplicar ajustes</button>` : ''}</div></td></tr>`; }).join('');
    return `<div class="note">Cuenta físicamente y escribe lo que hay. Solo se guardan los artículos donde ingreses una cantidad. Al aplicar, las diferencias se registran como <b>ajustes</b> (quedan en el historial y en la bitácora).</div>
    <div class="tools"><div class="fld" style="margin:0"><label>Fecha del conteo</label><input type="date" value="${C.fecha}" max="${today()}" data-change="cntfecha" style="width:auto"></div>
     <div class="fld" style="margin:0"><label>Artículos</label><div class="seg">${[['todo', 'Todos'], ['producto', 'Productos'], ['insumo', 'Insumos']].map(([k, t]) => `<button data-act="cntset" data-v="${k}" class="${C.tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div></div></div>
    ${items.length ? `<div class="tw"><table id="cnttbl"><thead><tr><th>Artículo</th><th class="r">Existencia sistema</th><th class="r">Existencia física</th><th class="r">Diferencia</th><th>Motivo</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="row mt"><label style="display:flex;gap:8px;align-items:center;margin:0;font-weight:600;color:var(--ink)"><input type="checkbox" id="cntapply" style="width:auto" ${can('ajuste') ? 'checked' : 'disabled'}> Aplicar de inmediato los ajustes al sistema</label><span class="sp"></span><button class="btn pri" data-act="cntSave">${ic('scale')} Guardar conteo</button></div>` : emptyCatalog()}
    <h3 class="mt mb" style="font-size:16px">Conteos anteriores</h3>${hist ? `<div class="tw"><table><thead><tr><th>Fecha</th><th>Responsable</th><th class="r">Artículos</th><th class="r">Resultado</th><th>Estado</th><th></th></tr></thead><tbody>${hist}</tbody></table></div>` : '<div class="empty">Aún no se han guardado conteos.</div>'}`;
  },
};
ACT.cntset = el => { S.cnt.tipo = el.dataset.v; render(); };
CHG.cntfecha = el => { if (el.value) { S.cnt.fecha = el.value; render(); } };
INP.cntrow = el => {
  const tr = el.closest('tr'), f = tr.querySelector('[name=fis]').value, d = tr.querySelector('.dif'), mot = tr.querySelector('[name=mot]');
  if (f === '') { d.textContent = ''; tr.classList.remove('diff'); mot.style.display = 'none'; return; }
  const df = num(f) - num(tr.dataset.sis); d.textContent = df === 0 ? '✓' : (df > 0 ? '+' : '') + fmtQty(df); tr.classList.toggle('diff', df !== 0); mot.style.display = df === 0 ? 'none' : ''; if (df > 0) mot.value = 'Sobrante';
};
function applyCountLines(c) {
  let n = 0;
  c.lines.filter(l => l.fisico !== l.sistema && itemById(l.itemId)).forEach(l => {
    const it = itemById(l.itemId), dif = l.fisico - l.sistema;
    put('movements', mkMove({ itemId: it.id, dir: dif > 0 ? 'in' : 'out', tipo: dif > 0 ? 'ajuste_mas' : 'ajuste_menos', cant: Math.abs(dif), fecha: c.fecha, hora: '23:58', turno: 'PM', src: 'conteo', reqId: c.id, costoU: it.costo, nota: `Conteo físico ${fmtDate(c.fecha)}: sistema ${fmtQty(l.sistema)}, físico ${fmtQty(l.fisico)}. ${l.motivo || ''}` })); n++;
  });
  return n;
}
ACT.cntSave = async () => {
  const lines = $$('#cnttbl tbody tr').filter(tr => tr.querySelector('[name=fis]').value !== '').map(tr => ({ itemId: tr.dataset.id, sistema: num(tr.dataset.sis), fisico: num(tr.querySelector('[name=fis]').value), motivo: num(tr.querySelector('[name=fis]').value) !== num(tr.dataset.sis) ? tr.querySelector('[name=mot]').value : '' }));
  if (!lines.length) return toast('Escribe al menos una cantidad contada', 'bad');
  const c = { id: uid(), fecha: S.cnt.fecha, userId: S.user.id, lines, aplicado: false };
  const dif = lines.filter(l => l.fisico !== l.sistema).length;
  if ($('#cntapply').checked && dif) { applyCountLines(c); c.aplicado = true; }
  put('counts', c); log('Conteo físico', `${fmtDate(c.fecha)} · ${lines.length} artículos, ${dif} con diferencia${c.aplicado ? ' (ajustado)' : ''}`);
  toast(dif ? `Conteo guardado · ${dif} diferencia(s)${c.aplicado ? ' ajustadas' : ''}` : 'Conteo guardado sin diferencias', 'ok'); render();
};
ACT.cntApply = async el => {
  const c = DB.counts.find(x => x.id === el.dataset.id);
  if (!await confirmBox('¿Aplicar al sistema las diferencias de este conteo? Se crearán movimientos de ajuste.', 'Aplicar ajustes')) return;
  const n = applyCountLines(c); put('counts', { ...c, aplicado: true }); log('Aplicar ajustes de conteo', `${fmtDate(c.fecha)} · ${n} ajustes`); toast(n + ' ajuste(s) aplicados', 'ok'); render();
};
ACT.cntView = el => {
  const c = DB.counts.find(x => x.id === el.dataset.id);
  const ds = { title: 'Conteo físico ' + fmtDate(c.fecha), sub: `Responsable: ${userName(c.userId)} · ${c.aplicado ? 'ajustes aplicados' : 'sin ajustar'}`, cols: [{ t: 'Artículo', k: l => itemById(l.itemId)?.nombre || '(eliminado)' }, { t: 'Sistema', k: 'sistema', n: 1 }, { t: 'Físico', k: 'fisico', n: 1 }, { t: 'Diferencia', k: l => l.fisico - l.sistema, n: 1 }, { t: 'Motivo', k: 'motivo' }], rows: c.lines };
  S._cview = ds; EXPSRC.cview = () => S._cview;
  openModal({ title: ds.title, size: 'mid', body: `<div class="row mb"><span class="mut sp">${esc(ds.sub)}</span>${expBtns('cview')}</div>${dsTable(ds, { rowCls: l => l.fisico !== l.sistema ? 'diff' : '' })}` });
};

/* ---------------------------- SOLICITUDES ---------------------------- */
S.reqF = '';
const REQ_ST = { Borrador: 'mut', Enviada: 'info', Parcial: 'warn', Recibida: 'ok', Cancelada: 'bad' };
PAGES.solicitudes = {
  title: 'Solicitudes de insumos y productos',
  html() {
    const all = L('requests').sort((a, b) => b.fecha.localeCompare(a.fecha) || b.u - a.u), rows = all.filter(r => !S.reqF || r.estado === S.reqF);
    const body = rows.map(r => `<tr><td><b>${esc(r.folio)}</b></td><td>${fmtDate(r.fecha)}</td><td>${r.tipo === 'insumo' ? 'Insumos' : 'Productos para venta'}</td><td>${esc(r.destNombre || '—')}</td><td class="r">${r.lines.length}</td><td>${r.urgencia === 'Urgente' ? '<span class="chip bad">Urgente</span>' : 'Normal'}</td><td>${chip(r.estado, REQ_ST[r.estado])}${r.via ? ` <small class="mut">${r.via === 'wa' ? 'WhatsApp' : 'correo'}</small>` : ''}</td><td>${esc(r.solicitante || '')}</td><td><div class="act"><button class="btn sm" data-act="reqOpen" data-id="${r.id}">Ver / enviar</button></div></td></tr>`).join('');
    return `<div class="tools"><div class="seg">${['', 'Borrador', 'Enviada', 'Parcial', 'Recibida', 'Cancelada'].map(e => `<button data-act="reqfilter" data-v="${e}" class="${S.reqF === e ? 'on' : ''}">${e || 'Todas'}</button>`).join('')}</div><span class="sp"></span>
     ${can('solicitud') ? `<button class="btn" data-act="reqNew" data-t="insumo">${ic('plus')} Solicitud de insumos</button><button class="btn pri" data-act="reqNew" data-t="producto">${ic('plus')} Solicitud de productos para venta</button>` : ''}</div>
    ${rows.length ? `<div class="tw"><table><thead><tr><th>Folio</th><th>Fecha</th><th>Tipo</th><th>Para</th><th class="r">Líneas</th><th>Urgencia</th><th>Estado</th><th>Solicitante</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card empty"><b>Sin solicitudes</b>Crea una solicitud y envíala por WhatsApp o correo al proveedor o a la gerencia. También puedes generarla desde las alertas del Tablero.</div>`}`;
  },
};
ACT.reqfilter = el => { S.reqF = el.dataset.v; render(); };
ACT.reqNew = el => openRequestForm({ tipo: el.dataset.t });
function reqLine(l = {}, tipo) {
  const it = l.itemId ? itemById(l.itemId) : null;
  return `<tr class="rl"><td><select name="itemId" data-change="reqitem">${itemOptions(l.itemId, tipo)}</select><span class="ex">${it ? 'Existencia: ' + fmtQty(stockOf(it.id)) + ' ' + esc(it.unidad) : ''}</span></td><td class="r"><input class="q" name="cant" type="number" min="0" step="any" value="${l.cant ?? ''}"></td><td><button type="button" class="btn ghost icon-btn" data-act="rlrem">${ic('x')}</button></td></tr>`;
}
function openRequestForm({ tipo = 'producto', fromAlerts = false, id } = {}) {
  const r = id ? DB.requests.find(x => x.id === id) : null; tipo = r?.tipo || tipo;
  let lines = r ? r.lines.map(l => ({ itemId: l.itemId, cant: l.cant })) : [];
  if (!r && fromAlerts) lines = ix().items.filter(i => i.tipo === tipo && i.activo !== false).map(it => ({ it, s: itemStatus(it) })).filter(x => NEEDS.includes(x.s.est)).map(x => ({ itemId: x.it.id, cant: suggestQty(x.it, x.s) || '' }));
  if (!lines.length) lines = [{}];
  const defProv = r?.provId || '';
  openModal({
    title: r ? 'Editar solicitud ' + r.folio : (tipo === 'insumo' ? 'Nueva solicitud de insumos' : 'Nueva solicitud de productos para venta'), size: 'mid',
    body: `<form id="reqform" data-submit="req" data-tipo="${tipo}"><input type="hidden" name="id" value="${r?.id || ''}">
    <div class="grid g3"><div class="fld"><label>Fecha</label><input type="date" name="fecha" value="${r?.fecha || today()}"></div><div class="fld"><label>Solicitante</label><input name="solicitante" value="${esc(r?.solicitante || S.user.nombre)}"></div><div class="fld"><label>Urgencia</label><select name="urgencia">${['Normal', 'Urgente'].map(u => `<option ${r?.urgencia === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div class="grid g3"><div class="fld"><label>Enviar a (proveedor / contacto)</label><select name="provId" data-change="reqprov">${provOptions(defProv)}</select></div><div class="fld"><label>WhatsApp destino</label><input name="destTel" placeholder="Ej. 5555 1234" value="${esc(r?.destTel || '')}"></div><div class="fld"><label>Correo destino</label><input name="destEmail" type="email" value="${esc(r?.destEmail || '')}"></div></div>
    <div class="grid g2"><div class="fld"><label>Nombre del destinatario</label><input name="destNombre" value="${esc(r?.destNombre || '')}" placeholder="Ej. Distribuidora…"></div><div class="fld"><label>Fecha requerida</label><input type="date" name="fechaReq" value="${r?.fechaReq || ''}"></div></div>
    <div class="row mb"><h4 class="sp">Artículos solicitados</h4><button type="button" class="btn sm" data-act="reqSuggest">${ic('alert')} Sugerir según existencias</button><button type="button" class="btn sm" data-act="rladd">${ic('plus')} Agregar</button></div>
    <div class="tw mb"><table class="lines"><thead><tr><th>Artículo</th><th class="r">Cantidad</th><th></th></tr></thead><tbody id="rlines">${lines.map(l => reqLine(l.it ? { itemId: l.it.id, cant: l.cant } : l, tipo)).join('')}</tbody></table></div>
    <div class="fld"><label>Notas para el destinatario</label><textarea name="nota">${esc(r?.nota || '')}</textarea></div>
    <div class="mf" style="padding:8px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">Guardar y continuar</button></div></form>`,
  });
}
CHG.reqprov = el => { const p = ix().provs.get(el.value), f = el.form; if (p) { f.elements.destNombre.value = p.nombre; f.elements.destTel.value = p.tel || ''; f.elements.destEmail.value = p.email || ''; } };
CHG.reqitem = el => { const it = itemById(el.value), ex = el.closest('tr').querySelector('.ex'); ex.textContent = it ? `Existencia: ${fmtQty(stockOf(it.id))} ${it.unidad}` : ''; if (it && !el.closest('tr').querySelector('[name=cant]').value) { const s = itemStatus(it), q = suggestQty(it, s) || it.pack; if (q) el.closest('tr').querySelector('[name=cant]').value = q; } };
ACT.rladd = () => { $('#rlines').insertAdjacentHTML('beforeend', reqLine({}, $('#reqform').dataset.tipo)); };
ACT.rlrem = el => { if ($$('#rlines .rl').length > 1) el.closest('tr').remove(); };
ACT.reqSuggest = () => {
  const tipo = $('#reqform').dataset.tipo;
  const sug = ix().items.filter(i => i.tipo === tipo && i.activo !== false).map(it => ({ it, s: itemStatus(it) })).filter(x => NEEDS.includes(x.s.est));
  if (!sug.length) return toast('No hay artículos por reponer');
  $('#rlines').innerHTML = sug.map(x => reqLine({ itemId: x.it.id, cant: suggestQty(x.it, x.s) || '' }, tipo)).join('');
};
SUB.req = f => {
  const g = n => f.elements[n]?.value ?? '', id = g('id'), tipo = f.dataset.tipo;
  const lines = $$('.rl', f).map(tr => ({ itemId: tr.querySelector('[name=itemId]').value, cant: num(tr.querySelector('[name=cant]').value) })).filter(l => l.itemId && l.cant > 0);
  if (!lines.length) return toast('Agrega al menos un artículo con cantidad', 'bad');
  const old = id ? DB.requests.find(x => x.id === id) : null;
  const folio = old?.folio || 'SOL-' + String(1 + Math.max(0, ...DB.requests.map(r => parseInt((r.folio || '').replace(/\D/g, '')) || 0))).padStart(4, '0');
  const rec = { ...(old || { id: uid(), estado: 'Borrador', userId: S.user.id }), folio, fecha: g('fecha') || today(), tipo, solicitante: g('solicitante'), urgencia: g('urgencia'), provId: g('provId'), destNombre: g('destNombre'), destTel: g('destTel'), destEmail: g('destEmail'), fechaReq: g('fechaReq'), nota: g('nota'), lines: lines.map(l => { const it = itemById(l.itemId); return { itemId: it.id, nombre: it.nombre, unidad: it.unidad, cant: l.cant, stock: stockOf(it.id) }; }) };
  put('requests', rec); log(old ? 'Editar solicitud' : 'Crear solicitud', folio); closeModal(); render(); openRequest(rec.id);
};
function openRequest(id) {
  const r = DB.requests.find(x => x.id === id); if (!r) return; S.reqId = id; EXPSRC.req = () => requestDS(r);
  const cerrada = r.estado === 'Recibida' || r.estado === 'Cancelada';
  const to = encodeURIComponent(r.destEmail || cfg().emailDefault || ''), subj = encodeURIComponent(`Solicitud ${r.folio} - ${cfg().empresa}`), bodyTxt = encodeURIComponent(requestMessage(r, 'mail'));
  openModal({
    title: `${esc(r.folio)} ${chip(r.estado, REQ_ST[r.estado])}`, size: 'mid',
    body: `<div class="row mb"><span class="mut sp">${r.tipo === 'insumo' ? 'Insumos' : 'Productos para venta'} · ${fmtDate(r.fecha)} · ${esc(r.destNombre || 'sin destinatario')}${r.destTel ? ' · WhatsApp ' + esc(r.destTel) : ''}${r.destEmail ? ' · ' + esc(r.destEmail) : ''}</span></div>
     <div class="tabs"><button class="on" data-act="reqfmt" data-f="wa">Mensaje WhatsApp</button><button data-act="reqfmt" data-f="mail">Mensaje de correo</button></div>
     <div class="msgbox" id="reqmsg">${esc(requestMessage(r, 'wa'))}</div>
     ${!r.destTel && !cfg().waDefault ? '<small class="mut">Sin número de WhatsApp: se abrirá WhatsApp para que elijas el contacto.</small>' : ''}
     <div class="row mt"><a class="btn wa" href="${waLink(r)}" target="_blank" rel="noopener" data-sent="wa" data-rid="${r.id}">${ic('wa')} Enviar por WhatsApp</a>
      <a class="btn dark" href="${mailLink(r)}" data-sent="mail" data-rid="${r.id}">${ic('mail')} Correo</a>
      <a class="btn" href="https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subj}&body=${bodyTxt}" target="_blank" rel="noopener" data-sent="mail" data-rid="${r.id}">Gmail</a>
      <a class="btn" href="https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subj}&body=${bodyTxt}" target="_blank" rel="noopener" data-sent="mail" data-rid="${r.id}">Outlook</a>
      <button class="btn" data-act="reqCopy">${ic('copy')} Copiar</button></div>
     <div class="row mt">${expBtns('req')}</div>
     <small class="mut" style="display:block;margin-top:8px">Al enviar, WhatsApp o tu correo se abren con el mensaje listo; solo confirma el envío allí. Si el correo es largo y tu programa lo corta, usa «Copiar».</small>`,
    foot: `${can('solicitud') && !cerrada ? `<button class="btn danger" data-act="reqCancel" data-id="${r.id}" style="margin-right:auto">Cancelar solicitud</button>` : ''}${can('solicitud') && r.estado === 'Borrador' ? `<button class="btn" data-act="reqEdit" data-id="${r.id}">${ic('edit')} Editar</button>` : ''}${can('mov') && !cerrada ? `<button class="btn pri" data-act="reqReceive" data-id="${r.id}">${ic('box2')} Registrar recepción</button>` : ''}<button class="btn" data-act="mclose">Cerrar</button>`,
  });
}
ACT.reqOpen = el => openRequest(el.dataset.id);
ACT.reqEdit = el => { closeModal(); openRequestForm({ id: el.dataset.id }); };
ACT.reqfmt = el => { const r = DB.requests.find(x => x.id === S.reqId); $$('.tabs button', el.parentNode).forEach(b => b.classList.toggle('on', b === el)); $('#reqmsg').textContent = requestMessage(r, el.dataset.f); };
ACT.reqCopy = async () => { const t = $('#reqmsg').textContent; try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('Mensaje copiado', 'ok'); };
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-sent]'); if (!a) return;
  const r = DB.requests.find(x => x.id === a.dataset.rid); if (r && (r.estado === 'Borrador')) { put('requests', { ...r, estado: 'Enviada', via: a.dataset.sent, enviada: Date.now() }); log('Enviar solicitud', `${r.folio} por ${a.dataset.sent === 'wa' ? 'WhatsApp' : 'correo'}`); }
});
ACT.reqCancel = async el => { const r = DB.requests.find(x => x.id === el.dataset.id); if (await confirmBox(`¿Cancelar la solicitud ${esc(r.folio)}?`, 'Cancelar solicitud', true)) { put('requests', { ...r, estado: 'Cancelada' }); log('Cancelar solicitud', r.folio); closeModal(); render(); } };
ACT.reqReceive = el => {
  const r = DB.requests.find(x => x.id === el.dataset.id), costos = can('costos');
  openModal({
    title: 'Registrar recepción · ' + esc(r.folio), size: 'mid',
    body: `<form id="recform" data-submit="rec" data-id="${r.id}"><div class="grid g3"><div class="fld"><label>Fecha de recepción</label><input type="date" name="fecha" value="${today()}" max="${today()}"></div><div class="fld"><label>Documento / factura</label><input name="doc"></div><div class="fld"><label>Proveedor</label><select name="provId">${provOptions(r.provId)}</select></div></div>
    <div class="tw"><table class="lines"><thead><tr><th>Artículo</th><th class="r">Solicitado</th><th class="r">Recibido</th>${costos ? '<th class="r">Costo unit.</th>' : ''}</tr></thead><tbody>${r.lines.map(l => `<tr data-id="${l.itemId}"><td>${esc(l.nombre)}</td><td class="r">${fmtQty(l.cant)}</td><td class="r"><input class="q" name="rec" type="number" min="0" step="any" value="${l.cant}"></td>${costos ? `<td class="r"><input class="q" name="costo" type="number" min="0" step="any" value="${itemById(l.itemId)?.costo || ''}"></td>` : ''}</tr>`).join('')}</tbody></table></div>
    <small class="mut">Se crearán los ingresos en el inventario con la fecha indicada.</small>
    <div class="mf" style="padding:12px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">Registrar ingreso</button></div></form>`,
  });
};
SUB.rec = f => {
  const r = DB.requests.find(x => x.id === f.dataset.id); let full = true, n = 0;
  $$('tbody tr', f).forEach(tr => {
    const q = num(tr.querySelector('[name=rec]').value), l = r.lines.find(x => x.itemId === tr.dataset.id), it = itemById(tr.dataset.id);
    if (q < l.cant) full = false; if (q > 0 && it) { const c = num(tr.querySelector('[name=costo]')?.value) || it.costo; put('movements', mkMove({ itemId: it.id, dir: 'in', tipo: 'compra', cant: q, fecha: f.elements.fecha.value, doc: f.elements.doc.value || r.folio, provId: f.elements.provId.value, reqId: r.id, src: 'solicitud', costoU: c, nota: 'Recepción de ' + r.folio })); if (c > 0 && c !== it.costo && can('costos')) put('items', { ...it, costo: c }); n++; }
  });
  put('requests', { ...r, estado: full ? 'Recibida' : 'Parcial', recibida: f.elements.fecha.value }); log('Recepción de solicitud', `${r.folio} · ${n} artículos`);
  closeModal(); toast('Ingreso registrado en el inventario', 'ok'); render();
};

/* ---------------------------- REPORTES ---------------------------- */
S.repTipo = 'todo'; S.repItem = '';
const repItems = () => ix().items.filter(i => i.activo !== false && (S.repTipo === 'todo' || i.tipo === S.repTipo)).sort((a, b) => a.tipo.localeCompare(b.tipo) || catName(a.catId).localeCompare(catName(b.catId), 'es') || a.nombre.localeCompare(b.nombre, 'es'));
const REP = {
  resumen: {
    n: 'Resumen del periodo', d: 'Inicial · ingresos · ventas · cierre (como tu INVENTARIO MENSUAL)',
    build() {
      const { from, to } = periodRange(), costos = can('costos'); const rows = repItems().map(it => ({ it, s: summarize(it.id, from, to) }));
      const cols = [{ t: 'Artículo', k: r => r.it.nombre }, { t: 'Categoría', k: r => catName(r.it.catId) }, { t: 'Inicial', k: r => r.s.ini, n: 1 }, { t: 'Ingresos', k: r => r.s.ing, n: 1 }, { t: 'Total', k: r => r.s.ini + r.s.ing, n: 1 }, { t: 'Ventas', k: r => r.s.ven, n: 1 }, { t: 'Uso interno', k: r => r.s.uso, n: 1 }, { t: 'Otras salidas', k: r => r.s.otras, n: 1 }, { t: 'Ajustes', k: r => r.s.aj, n: 1 }, { t: 'Cierre', k: r => r.s.cierre, n: 1 }];
      if (costos) cols.push({ t: 'Valor cierre', k: r => Math.max(0, r.s.cierre) * r.it.costo, n: 1, d: 2 }, { t: 'Ventas (' + cfg().moneda + ')', k: r => r.s.venQ, n: 1, d: 2 });
      const sum = k => rows.reduce((a, r) => a + r.s[k], 0);
      return { title: 'Resumen de inventario', sub: `${periodLabel()} (${fmtDate(from)} al ${fmtDate(to)})`, cols, rows, foot: { 'Artículo': 'TOTAL', 'Inicial': sum('ini'), 'Ingresos': sum('ing'), 'Total': sum('ini') + sum('ing'), 'Ventas': sum('ven'), 'Uso interno': sum('uso'), 'Otras salidas': sum('otras'), 'Ajustes': sum('aj'), 'Cierre': sum('cierre'), ...(costos ? { 'Valor cierre': rows.reduce((a, r) => a + Math.max(0, r.s.cierre) * r.it.costo, 0), ['Ventas (' + cfg().moneda + ')']: sum('venQ') } : {}) } };
    },
  },
  cuadre: {
    n: 'Cuadre sistema vs. físico', d: 'Existencia del sistema contra el último conteo físico del periodo (cuadre semanal)',
    build() {
      const { from, to } = periodRange(); const cnts = L('counts').filter(c => c.fecha >= from && c.fecha <= to).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rows = repItems().map(it => { const s = summarize(it.id, from, to); let cl = null, cf = ''; cnts.forEach(c => { const l = c.lines.find(x => x.itemId === it.id); if (l) { cl = l; cf = c.fecha; } }); return { it, s, cl, cf }; });
      const cols = [{ t: 'Artículo', k: r => r.it.nombre }, { t: 'Existencia sistema inicial', k: r => r.s.ini, n: 1 }, { t: 'Ingreso', k: r => r.s.ing, n: 1 }, { t: 'Venta / uso', k: r => r.s.consumo, n: 1 }, { t: 'Otras salidas y ajustes', k: r => r.s.egr - r.s.consumo - r.s.aj, n: 1 }, { t: 'Existencia sistema final', k: r => r.s.cierre, n: 1 }, { t: 'Último conteo físico', k: r => r.cl ? r.cl.fisico : '', n: 1 }, { t: 'Fecha conteo', k: r => r.cf ? fmtDate(r.cf) : '' }, { t: 'Diferencia en conteo', k: r => r.cl ? r.cl.fisico - r.cl.sistema : '', n: 1 }];
      return { title: 'Cuadre de inventario (sistema vs. físico)', sub: `${periodLabel()} (${fmtDate(from)} al ${fmtDate(to)}) · ${cnts.length} conteo(s) en el periodo`, cols, rows };
    },
  },
  inventario: {
    n: 'Inventario actual', d: 'Existencias, estado y valor al costo de hoy', noPeriod: true,
    build() {
      const costos = can('costos'), rows = repItems().map(it => ({ it, st: itemStatus(it) }));
      const cols = [{ t: 'Código', k: r => r.it.codigo || '' }, { t: 'Artículo', k: r => r.it.nombre }, { t: 'Tipo', k: r => r.it.tipo === 'insumo' ? 'Insumo' : 'Producto' }, { t: 'Categoría', k: r => catName(r.it.catId) }, { t: 'Unidad', k: r => r.it.unidad }, { t: 'Existencia', k: r => r.st.st, n: 1 }, { t: 'Mínimo', k: r => r.st.min, n: 1 }, { t: 'Estado', k: r => r.st.est }, { t: 'Ubicación', k: r => r.it.ubicacion || '' }];
      if (costos) cols.push({ t: 'Costo', k: r => r.it.costo, n: 1, d: 2 }, { t: 'Valor', k: r => Math.max(0, r.st.st) * r.it.costo, n: 1, d: 2 });
      return { title: 'Inventario actual', sub: 'Al ' + fmtDate(today()) + ' ' + nowHM(), cols, rows, foot: { 'Artículo': 'TOTAL', 'Existencia': rows.reduce((a, r) => a + r.st.st, 0), ...(costos ? { 'Valor': rows.reduce((a, r) => a + Math.max(0, r.st.st) * r.it.costo, 0) } : {}) } };
    },
  },
  kardex: {
    n: 'Kardex por artículo', d: 'Entradas, salidas y saldo de un artículo', needItem: true,
    build() { const { from, to } = periodRange(); if (!S.repItem || !itemById(S.repItem)) return { title: 'Kardex', sub: 'Selecciona un artículo', cols: [{ t: 'Fecha', k: 'x' }], rows: [] }; const d = kardexDS(S.repItem, from, to); d.sub = `${periodLabel()} · ${d.sub}`; return d; },
  },
  consumo: {
    n: 'Consumo y tiempo de uso', d: 'Cuánto dura cada artículo: consumo, cobertura, fecha de agotamiento y vida de cada lote',
    build() {
      const { from, to } = periodRange(); const hasta = to > today() ? today() : to, dias = Math.max(1, daysBetween(from, hasta) + 1);
      const rows = repItems().map(it => { const s = summarize(it.id, from, to), st = itemStatus(it), lf = lotsOf(it.id); return { it, s, st, lf }; });
      const cols = [{ t: 'Artículo', k: r => r.it.nombre }, { t: 'Tipo', k: r => r.it.tipo === 'insumo' ? 'Insumo' : 'Producto' }, { t: 'Consumo en el periodo', k: r => r.s.consumo, n: 1 }, { t: 'Promedio por día (periodo)', k: r => r.s.consumo / dias, n: 1, d: 2 }, { t: 'Existencia', k: r => r.st.st, n: 1 }, { t: 'Cobertura (días)', k: r => r.st.cov === null ? '' : r.st.cov, n: 1, d: 1 }, { t: 'Se agota aprox.', k: r => r.st.agot ? fmtDate(r.st.agot) : '' }, { t: 'Vida prom. de un lote (días)', k: r => r.lf.avgLife ?? '', n: 1, d: 0 }, { t: 'Se repone cada (días)', k: r => r.lf.cicloRepo ?? '', n: 1, d: 0 }, { t: 'Duración esperada (días)', k: r => r.it.duracionEsp || '', n: 1, d: 0 }, { t: 'Estado', k: r => r.st.est }];
      return { title: 'Consumo y tiempo de uso', sub: `${periodLabel()} · cobertura calculada con el consumo de los últimos ${cfg().ventanaConsumo} días · vida de lote por método PEPS`, cols, rows };
    },
  },
  pedido: {
    n: 'Pedido sugerido', d: 'Artículos agotados, bajo mínimo o por agotarse, con cantidad sugerida', noPeriod: true,
    build() {
      const rows = repItems().map(it => ({ it, st: itemStatus(it) })).filter(r => NEEDS.includes(r.st.est)).map(r => ({ ...r, q: suggestQty(r.it, r.st) }));
      return { title: 'Pedido sugerido', sub: `Al ${fmtDate(today())} · objetivo: ${cfg().diasObjetivo} días de cobertura o stock máximo del artículo`, cols: [{ t: 'Artículo', k: r => r.it.nombre }, { t: 'Tipo', k: r => r.it.tipo === 'insumo' ? 'Insumo' : 'Producto' }, { t: 'Existencia', k: r => r.st.st, n: 1 }, { t: 'Mínimo', k: r => r.st.min, n: 1 }, { t: 'Consumo/día', k: r => r.st.u.perDay, n: 1, d: 1 }, { t: 'Cobertura (días)', k: r => r.st.cov === null ? '' : r.st.cov, n: 1, d: 1 }, { t: 'Estado', k: r => r.st.est }, { t: 'Cantidad sugerida', k: r => r.q, n: 1 }, { t: 'Proveedor', k: r => provName(r.it.provId) }], rows };
    },
  },
  flujo: {
    n: 'Ingresos vs. egresos', d: 'Detalle por día (o por mes) de lo que entra y sale',
    build() {
      const { from, to } = periodRange(), costos = can('costos'), fb = flowBuckets(from, to), idx = new Map(fb.out.map((b, i) => [b.key, i]));
      const rows = fb.out.map(b => ({ label: b.label, ing: 0, egr: 0, ven: 0, ingQ: 0, venQ: 0 }));
      for (const m of ix().moves) { if (m.fecha < from || m.fecha > to) continue; const i = idx.get(fb.keyOf(m)); if (i === undefined) continue; const it = itemById(m.itemId); if (S.repTipo !== 'todo' && it.tipo !== S.repTipo) continue; if (G_IN.includes(m.tipo)) { rows[i].ing += m.cant; rows[i].ingQ += m.cant * (m.costoU || 0); } else if (G_OUT.includes(m.tipo)) { rows[i].egr += m.cant; if (m.tipo === 'venta') { rows[i].ven += m.cant; rows[i].venQ += m.cant * ((m.precioU ?? it.precio) || 0); } } }
      const cols = [{ t: 'Periodo', k: 'label' }, { t: 'Ingresos (uds)', k: 'ing', n: 1 }, { t: 'Egresos (uds)', k: 'egr', n: 1 }, { t: 'Neto', k: r => r.ing - r.egr, n: 1 }, { t: 'De ellos, ventas (uds)', k: 'ven', n: 1 }];
      if (costos) cols.push({ t: 'Compras (' + cfg().moneda + ')', k: 'ingQ', n: 1, d: 2 }, { t: 'Ventas (' + cfg().moneda + ')', k: 'venQ', n: 1, d: 2 });
      const s = k => rows.reduce((a, r) => a + r[k], 0);
      return { title: 'Ingresos y egresos', sub: `${periodLabel()} (${fmtDate(from)} al ${fmtDate(to)})`, cols, rows, foot: { 'Periodo': 'TOTAL', 'Ingresos (uds)': s('ing'), 'Egresos (uds)': s('egr'), 'Neto': s('ing') - s('egr'), 'De ellos, ventas (uds)': s('ven'), ...(costos ? { ['Compras (' + cfg().moneda + ')']: s('ingQ'), ['Ventas (' + cfg().moneda + ')']: s('venQ') } : {}) } };
    },
  },
  bitacora: {
    n: 'Bitácora de actividad', d: 'Quién hizo qué y cuándo', admin: true,
    build() {
      const { from, to } = periodRange(); const rows = L('audit').filter(a => toISO(new Date(a.ts)) >= from && toISO(new Date(a.ts)) <= to).sort((a, b) => b.ts - a.ts);
      return { title: 'Bitácora de actividad', sub: `${periodLabel()} · ${rows.length} registros`, cols: [{ t: 'Fecha y hora', k: a => fmtDate(toISO(new Date(a.ts))) + ' ' + pad(new Date(a.ts).getHours()) + ':' + pad(new Date(a.ts).getMinutes()) }, { t: 'Usuario', k: a => userName(a.userId) }, { t: 'Acción', k: 'acc' }, { t: 'Detalle', k: 'det' }], rows };
    },
  },
};
EXPSRC.rep = () => REP[S.rep].build();
PAGES.reportes = {
  title: 'Reportes',
  html() {
    if (!REP[S.rep] || (REP[S.rep].admin && !can('usuarios'))) S.rep = 'resumen';
    const R = REP[S.rep], ds = R.build();
    return `<div class="tabs">${Object.entries(REP).filter(([k, r]) => !r.admin || can('usuarios')).map(([k, r]) => `<button data-act="repset" data-k="${k}" class="${S.rep === k ? 'on' : ''}">${r.n}</button>`).join('')}</div>
    <div class="tools"><span class="mut sp">${esc(R.d)}</span>
      ${S.rep !== 'bitacora' ? `<select data-change="reptipo"><option value="todo">Productos e insumos</option><option value="producto" ${S.repTipo === 'producto' ? 'selected' : ''}>Solo productos</option><option value="insumo" ${S.repTipo === 'insumo' ? 'selected' : ''}>Solo insumos</option></select>` : ''}
      ${R.needItem ? `<select data-change="repitem">${itemOptions(S.repItem)}</select>` : ''}${expBtns('rep')}</div>
    ${R.noPeriod ? '<div class="note">Este reporte muestra la situación de hoy; el filtro de periodo no aplica.</div>' : ''}
    <div class="card"><h3>${esc(ds.title)} <small>${esc(ds.sub || '')}</small></h3>${dsTable(ds)}</div>`;
  },
};
ACT.repset = el => { S.rep = el.dataset.k; render(); };
CHG.reptipo = el => { S.repTipo = el.value; render(); };
CHG.repitem = el => { S.repItem = el.value; render(); };

/* =====================================================================
   PÁGINAS C: Usuarios y roles · Configuración
   ===================================================================== */
PAGES.usuarios = {
  title: 'Usuarios y roles',
  async mount() { try { await loadTeam(); if (S.page === 'usuarios') { const v = $('#view'); if (v && !$('#modal-root').innerHTML) v.innerHTML = this.html(); } } catch (e) { } },
  html() {
    const users = DB.users.slice().sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1) || a.nombre.localeCompare(b.nombre, 'es'));
    const pend = users.filter(u => u.estado === 'pendiente').length;
    const est = u => u.estado === 'activo' ? chip('Activo', 'ok') : u.estado === 'pendiente' ? chip('Pendiente de aprobar', 'warn') : chip('Inactivo', 'mut');
    const rows = users.map(u => `<tr><td><b>${esc(u.nombre)}</b>${u.id === S.user.id ? ' <small class="mut">(tú)</small>' : ''}<br><small class="mut">${esc(u.tel || '')}</small></td><td>${esc(u.email || '')}</td><td>${u.estado === 'pendiente' ? '<span class="mut">—</span>' : chip(ROLES[u.rol].n, u.rol === 'admin' ? 'bad' : u.rol === 'supervisor' ? 'info' : u.rol === 'operador' ? 'ok' : 'mut')}</td><td>${est(u)}</td><td><div class="act"><button class="btn sm ${u.estado === 'pendiente' ? 'pri' : ''}" data-act="editUser" data-id="${u.id}">${u.estado === 'pendiente' ? 'Aprobar' : ic('edit')}</button></div></td></tr>`).join('');
    const perms = Object.keys(PERM_LABEL), rl = Object.keys(ROLES);
    return `<div class="tools"><span class="mut sp">Cada persona crea su cuenta con su correo; aquí la apruebas y le asignas un rol. El rol decide qué puede ver y hacer.</span><button class="btn pri" data-act="newUser">${ic('plus')} Invitar persona</button></div>
    ${pend ? `<div class="note warn">Hay <b>${pend}</b> cuenta(s) esperando tu aprobación.</div>` : ''}
    <div class="tw mb"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card"><h3>Qué puede hacer cada rol</h3><div class="tw"><table><thead><tr><th>Permiso</th>${rl.map(r => `<th class="c">${ROLES[r].n}</th>`).join('')}</tr></thead><tbody>${perms.map(p => `<tr><td>${PERM_LABEL[p]}</td>${rl.map(r => `<td class="c">${ROLES[r].p.includes(p) ? '<b style="color:var(--ok)">✓</b>' : '<span class="mut">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="grid g4 mt">${rl.map(r => `<div><b>${ROLES[r].n}</b><br><small class="mut">${ROLES[r].d}</small></div>`).join('')}</div></div>`;
  },
};
ACT.newUser = () => {
  const link = location.origin + location.pathname, msg = `Hola, crea tu cuenta de ${cfg().empresa} (logística interna) aquí: ${link}\nUsa tu correo y una contraseña de al menos 8 caracteres. Cuando termines avísame para activarte.`;
  openModal({ title: 'Invitar persona', body: `<p style="margin-top:0">Para sumar a alguien: <b>1)</b> envíale este enlace, <b>2)</b> que cree su cuenta con su correo, <b>3)</b> aparecerá aquí como «Pendiente» y tú le asignas el rol.</p>
    <div class="fld"><label>Enlace de la app</label><input readonly value="${esc(link)}" onclick="this.select()"></div>
    <div class="row"><a class="btn pri" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ic('send')} Enviar por WhatsApp</a><button class="btn" data-act="copyInvite">Copiar mensaje</button><span class="sp"></span><button class="btn" data-act="mclose">Cerrar</button></div>
    <p class="mut" style="font-size:12px;margin-bottom:0">Si la persona ya tiene cuenta en otra app de Emporio (equipo, pantalla), puede entrar con ese mismo correo y contraseña.</p>` });
  ACT.copyInvite = async () => { try { await navigator.clipboard.writeText(msg); toast('Mensaje copiado', 'ok'); } catch (e) { toast('No se pudo copiar', 'bad'); } };
};
ACT.editUser = el => openUser(el.dataset.id);
function openUser(id) {
  const u = DB.users.find(x => x.id === id); if (!u) return;
  const pend = u.estado === 'pendiente';
  openModal({
    title: pend ? 'Aprobar cuenta' : 'Editar usuario',
    body: `<form data-submit="user"><input type="hidden" name="id" value="${id}">
    <div class="fld"><label>Nombre</label><input name="nombre" required value="${esc(u.nombre)}"></div>
    <div class="grid g2"><div class="fld"><label>Correo</label><input readonly value="${esc(u.email || '')}"></div><div class="fld"><label>Teléfono</label><input name="tel" value="${esc(u.tel || '')}"></div></div>
    <div class="grid g2"><div class="fld"><label>Rol *</label><select name="rol">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${(pend ? 'operador' : u.rol) === k ? 'selected' : ''}>${r.n}</option>`).join('')}</select></div>
    <div class="fld"><label>Estado</label><select name="estado">${[['activo', 'Activo'], ['inactivo', 'Inactivo (sin acceso)'], ['pendiente', 'Pendiente']].map(([k, t]) => `<option value="${k}" ${(pend ? 'activo' : u.estado) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    ${u.id !== S.user.id && u.email ? `<p class="mut" style="font-size:12.5px">¿Olvidó su contraseña? <a href="#" data-act="resetUser" data-id="${u.id}">Enviarle un correo para cambiarla</a>.</p>` : ''}
    <div class="mf" style="padding:12px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">${pend ? 'Aprobar y guardar' : 'Guardar'}</button></div></form>`,
  });
}
SUB.user = async f => {
  const g = n => f.elements[n]?.value ?? '', id = g('id');
  const { data, error } = await C.sb.rpc('inv_admin_perfil', { p_id: id, p_rol: g('rol'), p_estado: g('estado'), p_nombre: g('nombre'), p_tel: g('tel') });
  if (error) return toast(/ultimo_admin/.test(error.message) ? 'Debe quedar al menos un administrador activo' : errMsg(error), 'bad');
  log('Usuario', `${g('nombre')} → ${ROLES[g('rol')].n} (${g('estado')})`);
  await loadTeam(); closeModal(); toast('Usuario guardado', 'ok'); render();
};
ACT.resetUser = async el => {
  const u = DB.users.find(x => x.id === el.dataset.id); if (!u?.email) return;
  const { error } = await C.sb.auth.resetPasswordForEmail(u.email, { redirectTo: location.origin + location.pathname });
  toast(error ? errMsg(error) : 'Correo enviado a ' + u.email, error ? 'bad' : 'ok');
};

/* ---------------------------- CONFIGURACIÓN ---------------------------- */
S.cfgTab = 'general';
PAGES.config = {
  title: 'Configuración',
  html() {
    const tabs = [['general', 'General'], ['categorias', 'Categorías'], ['proveedores', 'Proveedores y contactos'], ['respaldo', 'Nube y respaldo'], ['importar', 'Importar desde Excel'], ['avanzado', 'Avanzado']];
    return `<div class="tabs">${tabs.map(([k, t]) => `<button data-act="cfgtab" data-k="${k}" class="${S.cfgTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>` + CFG[S.cfgTab]();
  },
};
ACT.cfgtab = el => { S.cfgTab = el.dataset.k; render(); };
const CFG = {
  general() {
    const c = cfg();
    return `<form class="card" data-submit="cfg" style="max-width:820px"><div class="grid g3"><div class="fld"><label>Nombre de la empresa</label><input name="empresa" value="${esc(c.empresa)}"></div><div class="fld"><label>Sucursal / ubicación</label><input name="sucursal" value="${esc(c.sucursal)}"></div><div class="fld"><label>Símbolo de moneda</label><input name="moneda" value="${esc(c.moneda)}" maxlength="4"></div></div>
    <div class="grid g2"><div class="fld"><label>Nombre del turno AM</label><input name="turnoAM" value="${esc(c.turnoAM)}"></div><div class="fld"><label>Nombre del turno PM</label><input name="turnoPM" value="${esc(c.turnoPM)}"></div></div>
    <h3 class="mb mt">Parámetros de reposición</h3><div class="grid g3"><div class="fld"><label>Ventana para calcular consumo (días)</label><input name="ventanaConsumo" type="number" min="7" max="365" value="${c.ventanaConsumo}"></div><div class="fld"><label>Alertar cuando queden menos de (días)</label><input name="diasReposicion" type="number" min="1" max="90" value="${c.diasReposicion}"></div><div class="fld"><label>Pedir hasta cubrir (días)</label><input name="diasObjetivo" type="number" min="1" max="180" value="${c.diasObjetivo}"></div></div>
    <small class="mut">Si un artículo no tiene stock mínimo, el sistema usa: consumo diario × días de alerta. El pedido sugerido llega hasta el stock máximo del artículo o, si no lo tiene, hasta cubrir los días objetivo.</small>
    <h3 class="mb mt">Solicitudes por WhatsApp y correo</h3><div class="grid g3"><div class="fld"><label>WhatsApp por defecto (con o sin 502)</label><input name="waDefault" value="${esc(c.waDefault)}" placeholder="5555 1234"></div><div class="fld"><label>Correo por defecto</label><input name="emailDefault" type="email" value="${esc(c.emailDefault)}"></div><div class="fld"><label>Código de país</label><input name="pais" value="${esc(c.pais)}"></div></div>
    <div class="row mt"><span class="sp"></span><button class="btn pri">Guardar configuración</button></div></form>`;
  },
  categorias() {
    const rows = L('categories').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td>${c.tipo === 'ambos' ? 'Productos e insumos' : c.tipo === 'insumo' ? 'Insumos' : 'Productos'}</td><td class="r">${ix().items.filter(i => i.catId === c.id).length}</td><td><div class="act"><button class="btn sm" data-act="editCat" data-id="${c.id}">${ic('edit')}</button></div></td></tr>`).join('');
    return `<div class="tools"><span class="mut sp">Las categorías ordenan y filtran tu inventario.</span><button class="btn pri" data-act="newCat">${ic('plus')} Nueva categoría</button></div>${rows ? `<div class="tw"><table><thead><tr><th>Categoría</th><th>Aplica a</th><th class="r">Artículos</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Sin categorías</div>'}`;
  },
  proveedores() {
    const rows = L('suppliers').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => `<tr><td><b>${esc(p.nombre)}</b></td><td>${esc(p.tel || '')}</td><td>${esc(p.email || '')}</td><td>${esc(p.nota || '')}</td><td><div class="act"><button class="btn sm" data-act="editProv" data-id="${p.id}">${ic('edit')}</button></div></td></tr>`).join('');
    return `<div class="tools"><span class="mut sp">Proveedores y contactos a quienes envías solicitudes (con su WhatsApp y correo).</span><button class="btn pri" data-act="newProv">${ic('plus')} Nuevo proveedor</button></div>${rows ? `<div class="tw"><table><thead><tr><th>Nombre</th><th>WhatsApp / teléfono</th><th>Correo</th><th>Notas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><b>Sin proveedores</b>Agrega uno para llenar rápido tus solicitudes.</div>'}`;
  },
  respaldo() {
    const n = c => L(c).length, ok = C.online !== false && !C.err;
    return `<div class="grid g2"><div class="card"><h3>${ic('db')} Base de datos en la nube</h3>
      <div class="note ${ok ? 'ok' : 'warn'}">${ok ? '<b>Conectado.</b> Todo lo que se registra se guarda en la nube y lo ven al instante todas las personas con acceso, desde cualquier lugar.' : '<b>Sin conexión ahora.</b> Puedes seguir trabajando; se enviará al reconectar.'}</div>
      <p style="margin:10px 0 0">Última sincronización: <b>${C.lastSync ? new Date(C.lastSync).toLocaleString('es-GT') : '—'}</b><br>Cambios pendientes de enviar: <b>${C.pending || 0}</b></p>
      <div class="row mt"><button class="btn pri" data-act="syncNow">Sincronizar ahora</button></div>
      <small class="mut" style="display:block;margin-top:8px">Cada dispositivo guarda una copia para trabajar sin internet. Los datos viven en Supabase; el plan Pro incluye respaldos diarios automáticos.</small></div>
     <div class="card"><h3>${ic('down')} Respaldo manual</h3><p style="margin-top:0">Descarga una copia completa (artículos, movimientos, solicitudes, conteos) en un archivo .json. Se recomienda una vez por semana.</p>
      <div class="row mb"><button class="btn pri" data-act="backup">${ic('down')} Descargar respaldo (.json)</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><small class="mut">Contenido: ${n('items')} artículos · ${DB.movements.filter(m => !m.del).length} movimientos · ${n('requests')} solicitudes · ${n('counts')} conteos.</small></div></div>`;
  },
  importar() {
    return `<div class="card" style="max-width:900px"><h3>Importar artículos desde Excel o CSV</h3><p style="margin-top:0">Sirve para cargar el <b>inventario de suministros</b> (o cualquier lista). Columnas reconocidas: <i>Nombre, Tipo (Producto/Insumo), Categoría, Unidad, Existencia, Mínimo, Máximo, Costo, Precio, Código, Proveedor, Caja</i>. Solo «Nombre» es obligatoria.</p>
     <div class="row mb"><button class="btn" data-act="tpl">${ic('down')} Descargar plantilla de Excel</button></div>
     <div class="grid g3"><div class="fld"><label>Archivo (.xlsx, .xls, .csv)</label><input type="file" id="impfile" accept=".xlsx,.xls,.csv" data-change="impfile"></div><div class="fld"><label>Fecha de la existencia inicial</label><input type="date" id="impfecha" value="${today()}" max="${today()}"></div>
      <div class="fld"><label>Si no trae columna «Tipo», tratar como</label><select id="imptipo"><option value="insumo">Insumo</option><option value="producto">Producto para venta</option></select></div></div>
     <div id="imppreview"></div></div>`;
  },
  avanzado() {
    return `<div class="card" style="max-width:780px"><h3>Zona de cuidado</h3><p style="margin-top:0">Estas acciones no se pueden deshacer. Descarga un respaldo antes.</p>
     <div class="fld"><label>Para confirmar escribe <b>BORRAR</b></label><input id="wipeconf" placeholder="BORRAR" style="max-width:220px"></div>
     <div class="row"><button class="btn danger" data-act="wipe" data-m="mov">Borrar movimientos, conteos y solicitudes (conserva artículos y usuarios)</button></div></div>`;
  },
};
SUB.cfg = f => {
  const g = n => f.elements[n].value; const c = { ...cfg(), empresa: g('empresa').trim() || 'EMPORIO', sucursal: g('sucursal').trim(), moneda: g('moneda').trim() || 'Q', turnoAM: g('turnoAM').trim() || 'Turno AM', turnoPM: g('turnoPM').trim() || 'Turno PM', ventanaConsumo: Math.max(7, num(g('ventanaConsumo')) || 30), diasReposicion: Math.max(1, num(g('diasReposicion')) || 7), diasObjetivo: Math.max(1, num(g('diasObjetivo')) || 14), waDefault: g('waDefault').trim(), emailDefault: g('emailDefault').trim(), pais: g('pais').replace(/\D/g, '') || '502', u: Date.now() };
  DB.settings = c; commit(); log('Configuración', 'Parámetros actualizados'); toast('Configuración guardada', 'ok'); render();
};
/* categorías / proveedores */
function openCat(id) {
  const c = id ? DB.categories.find(x => x.id === id) : { nombre: '', tipo: 'ambos' };
  openModal({ title: id ? 'Editar categoría' : 'Nueva categoría', body: `<form data-submit="cat"><input type="hidden" name="id" value="${id || ''}"><div class="fld"><label>Nombre *</label><input name="nombre" required value="${esc(c.nombre)}"></div><div class="fld"><label>Aplica a</label><select name="tipo">${[['ambos', 'Productos e insumos'], ['producto', 'Solo productos para venta'], ['insumo', 'Solo insumos']].map(([k, t]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
   <div class="mf" style="padding:8px 0 0;border:0">${id && !ix().items.some(i => i.catId === id) ? `<button type="button" class="btn danger" data-act="delCat" data-id="${id}" style="margin-right:auto">Eliminar</button>` : ''}<button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">Guardar</button></div></form>` });
}
ACT.newCat = () => openCat(); ACT.editCat = el => openCat(el.dataset.id);
SUB.cat = f => { const id = f.elements.id.value, nombre = f.elements.nombre.value.trim(); if (L('categories').some(c => c.id !== id && norm(c.nombre) === norm(nombre))) return toast('Esa categoría ya existe', 'bad'); put('categories', { id: id || uid(), nombre, tipo: f.elements.tipo.value }); closeModal(); render(); };
ACT.delCat = el => { del('categories', el.dataset.id); closeModal(); render(); };
function openProv(id) {
  const p = id ? DB.suppliers.find(x => x.id === id) : { nombre: '', tel: '', email: '', nota: '' };
  openModal({ title: id ? 'Editar proveedor' : 'Nuevo proveedor', body: `<form data-submit="prov"><input type="hidden" name="id" value="${id || ''}"><div class="fld"><label>Nombre *</label><input name="nombre" required value="${esc(p.nombre)}"></div><div class="grid g2"><div class="fld"><label>WhatsApp / teléfono</label><input name="tel" value="${esc(p.tel || '')}"></div><div class="fld"><label>Correo</label><input name="email" type="email" value="${esc(p.email || '')}"></div></div><div class="fld"><label>Notas</label><input name="nota" value="${esc(p.nota || '')}"></div>
   <div class="mf" style="padding:8px 0 0;border:0">${id ? `<button type="button" class="btn danger" data-act="delProv" data-id="${id}" style="margin-right:auto">Eliminar</button>` : ''}<button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">Guardar</button></div></form>` });
}
ACT.newProv = () => openProv(); ACT.editProv = el => openProv(el.dataset.id);
SUB.prov = f => { const g = n => f.elements[n].value.trim(); put('suppliers', { id: g('id') || uid(), nombre: g('nombre'), tel: g('tel'), email: g('email'), nota: g('nota') }); closeModal(); render(); };
ACT.delProv = async el => { if (await confirmBox('¿Eliminar este proveedor?', 'Eliminar', true)) { del('suppliers', el.dataset.id); closeModal(); render(); } };
/* respaldo */
ACT.syncNow = async () => { await cloudSync(); toast(C.err ? 'No se pudo sincronizar' : 'Sincronizado', C.err ? 'bad' : 'ok'); render(); };
ACT.backup = () => { downloadBlob(`EMPORIO_respaldo_${fileStamp()}.json`, JSON.stringify({ ...DB, users: [] }), 'application/json'); log('Respaldo', 'Descarga manual'); toast('Respaldo descargado', 'ok'); };
ACT.wipe = async el => {
  if ($('#wipeconf').value.trim().toUpperCase() !== 'BORRAR') return toast('Escribe BORRAR para confirmar', 'bad');
  if (!await confirmBox('¿Borrar movimientos, conteos y solicitudes de <b>todos</b> los usuarios?', 'Sí, borrar', true)) return;
  ['movements', 'counts', 'requests'].forEach(c => DB[c].forEach(r => { r.del = true; r.u = Date.now(); })); commit(); log('Borrar datos', 'Movimientos, conteos y solicitudes'); toast('Datos borrados', 'ok'); render();
};
/* importar catálogo */
let IMPORT = null;
CHG.impfile = async el => {
  const file = el.files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); const res = parseCatalogSheet(wb);
    const defTipo = $('#imptipo').value; if (!res.map.tipo) res.rows.forEach(r => r.tipo = defTipo);
    IMPORT = res;
    if (!res.map.nombre) { $('#imppreview').innerHTML = '<div class="note bad">No encontré una columna «Nombre» (o «Artículo»). Revisa los encabezados o descarga la plantilla.</div>'; return; }
    const ds = { title: 'Vista previa', cols: [{ t: 'Nombre', k: 'nombre' }, { t: 'Tipo', k: r => r.tipo }, { t: 'Categoría', k: 'categoria' }, { t: 'Unidad', k: 'unidad' }, { t: 'Existencia', k: 'stock', n: 1 }, { t: 'Mín.', k: 'min', n: 1 }, { t: 'Costo', k: 'costo', n: 1, d: 2 }, { t: 'Precio', k: 'precio', n: 1, d: 2 }], rows: res.rows.slice(0, 200) };
    $('#imppreview').innerHTML = `<div class="note ok">${res.rows.length} artículos detectados. Los que ya existen (mismo nombre y tipo) se actualizan sin duplicarse.</div>${dsTable(ds, { maxh: '320px' })}<div class="row mt"><span class="sp"></span><button class="btn pri" data-act="impgo">Importar ${res.rows.length} artículos</button></div>`;
  } catch (e) { $('#imppreview').innerHTML = '<div class="note bad">No se pudo leer el archivo: ' + esc(e.message) + '</div>'; }
};
ACT.impgo = () => { if (!IMPORT) return; const r = importCatalog(IMPORT.rows, $('#impfecha').value || today()); IMPORT = null; toast(`Importados: ${r.nuevos} nuevos, ${r.act} actualizados`, 'ok'); S.cfgTab = 'importar'; go('inventario'); };
ACT.tpl = () => templateXLSX();

/* =====================================================================
   ARRANQUE: inicio de sesión · registro · aprobación · app
   ===================================================================== */
function showScreen(name) {
  ['boot', 'setup', 'login', 'app'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = id !== name; });
}
function brandHTML() { return `<div class="brand"><span class="logo"><i></i><i></i><i></i></span><div><b>EMPORIO</b><small>Logística interna · inventarios</small></div></div>`; }
const authCard = html => { showScreen('login'); $('#login').innerHTML = `<div class="authwrap"><div class="authcard">${brandHTML()}${html}</div></div>`; };
const errMsg = e => {
  const m = String(e?.message || e || '');
  if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/not confirmed/i.test(m)) return 'Primero confirma tu correo (revisa tu bandeja y el spam).';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (/password should be|weak/i.test(m)) return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (isNet(e)) return 'No hay conexión con el servidor.';
  return m || 'Ocurrió un error.';
};

function showNoConfig() {
  authCard(`<h2 style="margin:4px 0 8px;font-size:18px">Falta conectar la base de datos</h2><div class="note warn">Abre el archivo <b>public/config.js</b> y escribe la <b>URL</b> y la clave <b>publishable</b> de tu proyecto de Supabase (Settings → API). Después vuelve a publicar.</div>`);
}

/* ----- inicio de sesión / registro / recuperar ----- */
function showLogin(msg = '', tab = 'in', ok = '') {
  const tabs = `<div class="tabs"><button data-act="atab" data-t="in" class="${tab === 'in' ? 'on' : ''}">Entrar</button><button data-act="atab" data-t="up" class="${tab === 'up' ? 'on' : ''}">Crear cuenta</button></div>`;
  const notes = (msg ? `<div class="note bad">${esc(msg)}</div>` : '') + (ok ? `<div class="note ok">${esc(ok)}</div>` : '');
  const inForm = `<form data-submit="login"><div class="fld"><label>Correo</label><input name="email" type="email" required autofocus autocapitalize="none" autocomplete="username"></div>
    <div class="fld"><label>Contraseña</label><input name="pass" type="password" required autocomplete="current-password"></div>
    <button class="btn pri" style="width:100%;justify-content:center">Entrar</button></form>
    <p style="margin:14px 0 0;font-size:13px"><a href="#" data-act="atab" data-t="forgot">¿Olvidaste tu contraseña?</a></p>`;
  const upForm = `<form data-submit="signup"><p class="mut" style="margin-top:0;font-size:13px">Crea tu cuenta. Después el administrador de Emporio la activa y te asigna un rol. Si ya tienes cuenta en otra app de Emporio, usa <b>Entrar</b> con ese mismo correo.</p>
    <div class="fld"><label>Nombre completo</label><input name="nombre" required autocomplete="name"></div>
    <div class="grid g2"><div class="fld"><label>Correo</label><input name="email" type="email" required autocapitalize="none" autocomplete="username"></div><div class="fld"><label>Teléfono (opcional)</label><input name="tel" inputmode="tel" autocomplete="tel"></div></div>
    <div class="fld"><label>Contraseña (mínimo 8)</label><input name="pass" type="password" minlength="8" required autocomplete="new-password"></div>
    <button class="btn pri" style="width:100%;justify-content:center">Crear cuenta</button></form>`;
  const forgot = `<form data-submit="forgot"><p class="mut" style="margin-top:0;font-size:13px">Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.</p>
    <div class="fld"><label>Correo</label><input name="email" type="email" required autofocus autocapitalize="none"></div>
    <button class="btn pri" style="width:100%;justify-content:center">Enviar enlace</button><p style="margin:14px 0 0;font-size:13px"><a href="#" data-act="atab" data-t="in">Volver</a></p></form>`;
  authCard(`<h2 style="margin:4px 0 12px;font-size:18px">${esc(cfg().empresa)}</h2>${tab === 'forgot' ? '' : tabs}${notes}${tab === 'in' ? inForm : tab === 'up' ? upForm : forgot}`);
}
ACT.atab = (el, ev) => { ev?.preventDefault?.(); showLogin('', el.dataset.t); };
SUB.login = async f => {
  try { const s = await cloudLogin(f.elements.email.value, f.elements.pass.value); await enterWithSession(s); }
  catch (e) { await new Promise(r => setTimeout(r, 400)); showLogin(errMsg(e), 'in'); }
};
SUB.signup = async f => {
  const g = n => f.elements[n].value.trim();
  try {
    const d = await cloudSignUp({ nombre: g('nombre'), email: g('email'), pass: f.elements.pass.value, tel: g('tel') });
    if (d.session) await enterWithSession(d.session);
    else showLogin('', 'in', 'Cuenta creada. Te enviamos un correo para confirmarla; ábrelo y luego inicia sesión.');
  } catch (e) { showLogin(errMsg(e), 'up'); }
};
SUB.forgot = async f => {
  try { const { error } = await C.sb.auth.resetPasswordForEmail(f.elements.email.value.trim().toLowerCase(), { redirectTo: location.origin + location.pathname }); if (error) throw error; showLogin('', 'in', 'Listo. Si el correo existe, recibirás un enlace para cambiar tu contraseña.'); }
  catch (e) { showLogin(errMsg(e), 'forgot'); }
};
function showResetPassword(msg = '') {
  authCard(`<h2 style="margin:4px 0 8px;font-size:18px">Crea tu nueva contraseña</h2>${msg ? `<div class="note bad">${esc(msg)}</div>` : ''}
   <form data-submit="newpass"><div class="fld"><label>Nueva contraseña (mínimo 8)</label><input name="pass" type="password" minlength="8" required autofocus autocomplete="new-password"></div>
   <button class="btn pri" style="width:100%;justify-content:center">Guardar y entrar</button></form>`);
}
SUB.newpass = async f => {
  try { const { error } = await C.sb.auth.updateUser({ password: f.elements.pass.value }); if (error) throw error; C.recovery = false; history.replaceState(null, '', location.pathname); const { data } = await C.sb.auth.getSession(); await enterWithSession(data.session); }
  catch (e) { showResetPassword(errMsg(e)); }
};

/* ----- pendiente de aprobación / primer administrador ----- */
function showPending(perfil) {
  const inactive = perfil?.estado === 'inactivo';
  const first = !C.hayAdmin && !inactive;
  authCard(`<h2 style="margin:4px 0 8px;font-size:18px">${inactive ? 'Acceso desactivado' : 'Cuenta pendiente de aprobación'}</h2>
   <p style="margin-top:0">${inactive ? 'El administrador desactivó tu acceso. Si crees que es un error, habla con él.' : `Hola <b>${esc(perfil?.nombre || '')}</b>. Tu cuenta (<b>${esc(perfil?.email || '')}</b>) ya está creada. El <b>administrador</b> de Emporio debe activarla y asignarte un rol. Cuando lo haga, pulsa «Revisar de nuevo».`}</p>
   ${first ? `<div class="note warn"><b>Primera configuración.</b> Todavía no hay administrador. Si eres quien configura el sistema, escribe el código de configuración que recibiste.</div>
   <form data-submit="firstadmin"><div class="fld"><label>Código de configuración</label><input name="code" required autocapitalize="characters" autocomplete="off" placeholder="EMP-XXXX-XXXX-XXXX-XXXX"></div><button class="btn pri" style="width:100%;justify-content:center;margin-bottom:8px">Activarme como administrador</button></form>` : ''}
   <div class="row"><button class="btn pri" data-act="recheck">Revisar de nuevo</button><button class="btn" data-act="logout">Cerrar sesión</button></div>`);
}
ACT.recheck = async () => { const { data } = await C.sb.auth.getSession(); if (data.session) await enterWithSession(data.session); else showLogin(); };
SUB.firstadmin = async f => {
  const { data, error } = await C.sb.rpc('inv_primer_admin', { p_code: f.elements.code.value });
  if (error) return toast(errMsg(error), 'bad');
  if (!data.ok) return toast(data.error, 'bad');
  toast('Listo, eres el administrador', 'ok'); ACT.recheck();
};

/* ----- app ----- */
function startApp(u) {
  S.user = u; showScreen('app');
  S.P = { mode: 'mes', anchor: today(), from: '', to: '' }; S.page = 'dashboard';
  if (window.Chart) chartDefaults();
  render();
}
function updateBanner() {
  const b = $('#banner'); if (!b) return;
  let h = '';
  if (C.authErr) h = `<div class="note bad row">Tu sesión venció. Tus cambios están guardados en este dispositivo. <button class="btn sm pri" data-act="logout">Iniciar sesión de nuevo</button></div>`;
  else if (C.online === false) h = `<div class="note warn">Sin conexión: puedes seguir registrando. Se enviará todo automáticamente cuando vuelva el internet${C.pending ? ` (${C.pending} pendiente${C.pending > 1 ? 's' : ''})` : ''}.</div>`;
  b.innerHTML = h;
}

/* ----- arranque ----- */
function registerSW() { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { }); }
async function boot() {
  initTheme(); DB = emptyDB();
  try { await store.open(); } catch (e) { console.error(e); }
  registerSW();
  cloudBoot();
}
document.addEventListener('DOMContentLoaded', () => {
  $('#themebtn').innerHTML = ic('moon');
  boot();
});
