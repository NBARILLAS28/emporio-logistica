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
    <div class="grid g3"><div class="fld"><label>Días de espera antes de marcar una solicitud como «tarde»</label><input name="diasEspera" type="number" min="1" max="90" value="${c.diasEspera || 7}"></div><div class="fld"><label>Días a cubrir en el cierre de mes</label><input name="diasCierre" type="number" min="7" max="90" value="${c.diasCierre || 30}"></div><div class="fld"><label>Avisar productos por vencer con (días de anticipación)</label><input name="diasVencer" type="number" min="1" max="365" value="${c.diasVencer || 30}"></div></div>
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
  const g = n => f.elements[n].value; const c = { ...cfg(), empresa: g('empresa').trim() || 'EMPORIO', sucursal: g('sucursal').trim(), moneda: g('moneda').trim() || 'Q', turnoAM: g('turnoAM').trim() || 'Turno AM', turnoPM: g('turnoPM').trim() || 'Turno PM', ventanaConsumo: Math.max(7, num(g('ventanaConsumo')) || 30), diasReposicion: Math.max(1, num(g('diasReposicion')) || 7), diasObjetivo: Math.max(1, num(g('diasObjetivo')) || 14), diasEspera: Math.max(1, num(g('diasEspera')) || 7), diasCierre: Math.max(7, num(g('diasCierre')) || 30), diasVencer: Math.max(1, num(g('diasVencer')) || 30), waDefault: g('waDefault').trim(), emailDefault: g('emailDefault').trim(), pais: g('pais').replace(/\D/g, '') || '502', u: Date.now() };
  DB.settings = c; _expKey = null; commit(); log('Configuración', 'Parámetros actualizados'); toast('Configuración guardada', 'ok'); render();
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
