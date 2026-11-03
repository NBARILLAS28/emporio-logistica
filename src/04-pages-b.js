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
