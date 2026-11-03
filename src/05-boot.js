/* =====================================================================
   ARRANQUE: inicio de sesión · registro · aprobación · app
   ===================================================================== */
function showScreen(name) {
  ['boot', 'setup', 'login', 'app'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = id !== name; });
}
function brandHTML() { return `<div class="brand"><img class="logo-app" src="icons/logo-app.png" alt="EMPORIO Logística" width="900" height="608"><div><b>EMPORIO</b><small>Logística interna · inventarios</small></div></div>`; }
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
  authCard(`<h2 style="margin:4px 0 12px;font-size:18px">${tab === 'up' ? 'Crea tu cuenta' : tab === 'forgot' ? 'Recupera tu contraseña' : 'Bienvenido'}</h2>${tab === 'forgot' ? '' : tabs}${notes}${tab === 'in' ? inForm : tab === 'up' ? upForm : forgot}`);
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
