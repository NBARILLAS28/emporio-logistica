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
