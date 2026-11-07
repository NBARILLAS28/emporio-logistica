/* =====================================================================
   PÁGINAS D: Abrir / Terminar unidad · Cierre de mes
   ===================================================================== */

/* ---------------------------- ABRIR / TERMINAR UNIDAD ---------------------------- */
function openUnit(kind, id) {
  const it = itemById(id), un = unitState(id), abrir = kind === 'open';
  openModal({
    title: `${abrir ? 'Abrir unidad' : 'Terminar unidad'} · ${esc(it.nombre)}`,
    body: `<form id="unitform" data-submit="unit" data-kind="${kind}" data-id="${id}">
      <div class="note">${abrir ? 'Pasa unidades de <b>Sellado</b> a <b>En uso</b>. Desde ese día se mide cuánto dura.' : 'Da por <b>terminadas</b> unidades que estaban en uso. Salen del inventario y se calcula cuántos días duraron.'}<br>
      Ahora: <b>${fmtQty(un.sellado)}</b> sellado · <b>${fmtQty(un.uso)}</b> en uso · existencia real <b>${fmtQty(un.st)}</b> ${esc(it.unidad)}${can('ajuste') ? `<br><small>¿No coincide con lo que hay? <a href="#" data-act="unitFix" data-id="${id}">Corregir sellado / en uso</a></small>` : ''}</div>
      <div class="grid g3"><div class="fld"><label>Cantidad *</label><input name="cant" type="number" min="0" step="any" value="1" required></div>
       <div class="fld"><label>Fecha *</label><input type="date" name="fecha" value="${today()}" max="${today()}" required></div>
       <div class="fld"><label>Turno</label><select name="turno"><option value="AM" ${nowHM() < '14:00' ? 'selected' : ''}>${esc(cfg().turnoAM)}</option><option value="PM" ${nowHM() < '14:00' ? '' : 'selected'}>${esc(cfg().turnoPM)}</option></select></div></div>
      <div class="fld"><label>Nota (opcional)</label><input name="nota" maxlength="120" placeholder="${abrir ? 'Ej. Se abrió para el baño de mujeres' : 'Ej. Se terminó antes de lo esperado'}"></div>
      <div class="mf" style="padding:8px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">${abrir ? 'Abrir' : 'Terminar'}</button></div></form>`,
  });
}
/* Corregir unidades: el usuario dice cuántas hay realmente selladas y en uso; el sistema hace los ajustes necesarios */
ACT.unitFix = el => {
  const id = el.dataset.id, it = itemById(id), un = unitState(id); if (!it) return;
  openModal({
    title: `Corregir sellado / en uso · ${esc(it.nombre)}`,
    body: `<form id="unitfix" data-submit="unitfix" data-id="${id}">
      <div class="note mb">Ahora el sistema dice: <b>${fmtQty(un.sellado)}</b> sellado (en bodega) · <b>${fmtQty(un.uso)}</b> en uso · existencia <b>${fmtQty(un.st)}</b> ${esc(it.unidad)}.<br><small>Escribe lo que hay <b>realmente</b>. El sistema ajusta la existencia y las unidades en uso por ti, y deja el movimiento anotado.</small></div>
      <div class="grid g3"><div class="fld"><label>Sellado (en bodega) *</label><input name="sellado" data-input="unitfix" type="number" min="0" step="any" value="${un.sellado}" required></div>
       <div class="fld"><label>En uso *</label><input name="uso" data-input="unitfix" type="number" min="0" step="any" value="${un.uso}" required></div>
       <div class="fld"><label>Existencia total</label><input id="uf-total" value="${fmtQty(un.st)}" readonly></div></div>
      <div class="fld"><label>Motivo (opcional)</label><input name="nota" maxlength="120" placeholder="Ej. Conteo físico: había 2 en uso y 1 en bodega"></div>
      <div class="mf" style="padding:8px 0 0;border:0"><button type="button" class="btn" data-act="mclose">Cancelar</button><button class="btn pri">Corregir</button></div></form>`,
  });
};
INP.unitfix = el => { const f = el.form; $('#uf-total').value = fmtQty(num(f.elements.sellado.value) + num(f.elements.uso.value)); };
SUB.unitfix = async f => {
  const id = f.dataset.id, it = itemById(id), s = num(f.elements.sellado.value), u = num(f.elements.uso.value), nota = f.elements.nota.value.trim();
  if (!(s >= 0) || !(u >= 0) || s > 100000 || u > 100000) return toast('Escribe cantidades válidas (0 o más).', 'bad');
  const cur = unitState(id), T = s + u, dif = T - cur.st;
  if (!dif && u === cur.uso) { closeModal(); return toast('Ya estaba así, no hay nada que corregir.'); }
  const turno = nowHM() < '14:00' ? 'AM' : 'PM', fecha = today(), txt = `Corrección de unidades: sistema ${fmtQty(cur.sellado)} sellado / ${fmtQty(cur.uso)} en uso, real ${fmtQty(s)} / ${fmtQty(u)}${nota ? '. ' + nota : ''}`;
  if (dif) put('movements', mkMove({ itemId: id, dir: dif > 0 ? 'in' : 'out', tipo: dif > 0 ? 'ajuste_mas' : 'ajuste_menos', cant: Math.abs(dif), fecha, hora: nowHM(), turno, src: 'conteo', costoU: it.costo, nota: txt }));
  const un = unitState(id), delta = u - (un.opened - un.done);   // unidades abiertas que faltan (+) o sobran (−)
  if (delta > 0) put('movements', mkMove({ itemId: id, dir: 'ev', tipo: 'abrir', cant: delta, fecha, hora: '09:00', turno, src: 'abrir', nota: 'Corrección de unidades' }));
  else if (delta < 0) {
    let rem = -delta;
    for (const e of (ix().evs.get(id) || []).filter(x => x.tipo === 'abrir').reverse()) {   // se quitan primero las aperturas más recientes
      if (rem <= 0) break; const take = Math.min(e.cant, rem); rem -= take;
      if (take >= e.cant) del('movements', e.id); else put('movements', { ...e, cant: e.cant - take });
    }
  }
  log('Corregir unidades', `${it.nombre}: ${fmtQty(cur.sellado)}/${fmtQty(cur.uso)} → ${fmtQty(s)}/${fmtQty(u)} (sellado/en uso)`);
  toast('Unidades corregidas', 'ok'); closeModal(); render();
};
ACT.unitOpen = el => openUnit('open', el.dataset.id);
ACT.unitDone = el => openUnit('done', el.dataset.id);
SUB.unit = async f => {
  const kind = f.dataset.kind, id = f.dataset.id, it = itemById(id), un = unitState(id), q = num(f.elements.cant.value), fecha = f.elements.fecha.value;
  const er = chkDate(fecha, { label: 'La fecha' }) || chkQty(q, 'La cantidad', { max: 100000 }); if (er) return toast(er, 'bad');
  const turno = f.elements.turno.value, nota = f.elements.nota.value.trim();
  const mkOpen = (cant, n) => put('movements', mkMove({ itemId: id, dir: 'ev', tipo: 'abrir', cant, fecha, hora: '09:00', turno, src: 'abrir', nota: n }));
  if (kind === 'open') {
    if (q > un.sellado && !await confirmBox(`Solo hay <b>${fmtQty(un.sellado)}</b> sellado(s) de ${esc(it.nombre)}. ¿Abrir ${fmtQty(q)} de todos modos? (Si llegó mercadería, registra primero el ingreso.)`, 'Abrir igual')) return;
    mkOpen(q, nota); log('Abrir unidad', `${it.nombre} x${q}`); toast('Unidad abierta: ahora está En uso', 'ok');
  } else {
    if (q > un.st && !await confirmBox(`La existencia de ${esc(it.nombre)} es <b>${fmtQty(un.st)}</b>. Al terminar ${fmtQty(q)} quedaría en negativo. ¿Registrar de todos modos?`, 'Registrar igual')) return;
    const falta = q - un.uso; if (falta > 0) mkOpen(Math.min(falta, q), 'Apertura automática al terminar');   // se terminó algo que no se había abierto: se abre el mismo día
    put('movements', mkMove({ itemId: id, dir: 'out', tipo: 'uso', cant: q, fecha, hora: '18:00', turno, src: 'terminar', costoU: it.costo, nota: 'Unidad terminada' + (nota ? ': ' + nota : '') }));
    const uc = unitCycles(id); log('Terminar unidad', `${it.nombre} x${q}`); toast(uc.avg !== null ? `Unidad terminada · duración promedio ${fmtN(uc.avg, 1)} días` : 'Unidad terminada', 'ok');
  }
  closeModal(); render();
};

/* ---------------------------- CIERRE DE MES ---------------------------- */
const prevMonth = () => { const d = new Date(); d.setDate(1); if (new Date().getDate() <= 10) d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
S.cm = { mes: prevMonth(), area: '', draft: {} };
const mesRange = mes => { const [y, m] = mes.split('-').map(Number); return { from: `${mes}-01`, to: toISO(new Date(y, m, 0)) }; };
const mesLabel = mes => { const [y, m] = mes.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
const mesShift = (mes, n) => { const [y, m] = mes.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const cierreNote = (id, mes) => (ix().evs.get(id) || []).filter(e => e.tipo === 'cierre' && e.periodo === mes).pop();

function cierreRows(mes) {
  const { from, to } = mesRange(mes), hasta = to > today() ? today() : to, obj = cfg().diasCierre || 30;
  return ix().items.filter(i => i.tipo === 'insumo' && (i.activo !== false || stockOf(i.id) > 0)).map(it => {
    const s = summarize(it.id, from, to), st = itemStatus(it), fin = Math.max(0, stockOf(it.id, hasta)), un = unitState(it.id, hasta), perDay = st.u.perDay, cov = perDay > 0 ? fin / perDay : null;
    const need = Math.ceil(perDay * obj), camino = onOrder(it.id);
    let sug = Math.max(0, need - fin - camino); if (it.pack > 0 && sug > 0) sug = Math.ceil(sug / it.pack) * it.pack;
    const note = cierreNote(it.id, mes), d = S.cm.draft[it.id] || {};
    const pedir = d.pedir !== undefined ? d.pedir : (note ? note.cant : sug), texto = d.texto !== undefined ? d.texto : (note?.texto || '');
    const auto = `Consumo del mes: ${fmtQty(s.consumo)} ${it.unidad}; promedio ${fmtN(perDay, perDay < 1 ? 2 : 1)}/día (${st.u.origen}). Existencia al cierre: ${fmtQty(fin)} (${cov === null ? 'sin datos de consumo' : fmtN(cov, 0) + ' días'}${camino ? ', +' + fmtQty(camino) + ' en camino' : ''}). Para ${obj} días se necesitan ${fmtQty(need)}.`;
    return { it, s, st, fin, un, cov, sug, pedir, texto, auto, area: catName(it.catId), life: unitCycles(it.id).avg };
  }).sort((a, b) => a.area.localeCompare(b.area, 'es') || a.it.nombre.localeCompare(b.it.nombre, 'es'));
}
function cierreDS() {
  const mes = S.cm.mes, rows = cierreRows(mes).filter(r => !S.cm.area || r.it.catId === S.cm.area);
  return { title: 'Cierre de mes de insumos · ' + mesLabel(mes), sub: `${fmtDate(mesRange(mes).from)} al ${fmtDate(mesRange(mes).to)} · solicitud sugerida para ${cfg().diasCierre || 30} días`,
    cols: [{ t: 'Área', k: r => r.area }, { t: 'Artículo', k: r => r.it.nombre }, { t: 'Unidad', k: r => r.it.unidad }, { t: 'Inicial', k: r => r.s.ini, n: 1 }, { t: 'Ingresos', k: r => r.s.ing, n: 1 }, { t: 'Consumo', k: r => r.s.consumo, n: 1 }, { t: 'Existencia al cierre', k: r => r.fin, n: 1 }, { t: 'Sellado', k: r => r.un.sellado, n: 1 }, { t: 'En uso', k: r => r.un.uso, n: 1 }, { t: 'Cobertura (días)', k: r => r.cov ?? '', n: 1, d: 0 }, { t: 'Duración de 1 unidad (días)', k: r => r.life ?? '', n: 1, d: 1 }, { t: 'Pedir', k: r => r.pedir || '', n: 1 }, { t: 'Justificación', k: r => (r.pedir > 0 ? r.auto + (r.texto ? ' ' : '') : '') + r.texto }], rows };
}
EXPSRC.cierre = cierreDS;

PAGES.cierre = {
  title: 'Cierre de mes',
  html() {
    const mes = S.cm.mes, all = cierreRows(mes), rows = all.filter(r => !S.cm.area || r.it.catId === S.cm.area), edit = can('solicitud');
    const areas = [...new Map(all.map(r => [r.it.catId, r.area])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
    const nPed = all.filter(r => r.pedir > 0).length;
    let last = null;
    const body = rows.map(r => { const hdr = r.area !== last ? `<tr class="grp"><td colspan="12"><b>${esc(r.area)}</b></td></tr>` : ''; last = r.area;
      return hdr + `<tr data-id="${r.it.id}"><td><b>${esc(r.it.nombre)}</b><br><small class="mut">${esc(r.it.unidad)}${r.it.activo === false ? ' · archivado' : ''}</small></td><td class="r">${fmtQty(r.s.ini)}</td><td class="r">${r.s.ing ? '+' + fmtQty(r.s.ing) : '—'}</td><td class="r">${r.s.consumo ? fmtQty(r.s.consumo) : '—'}</td>
        <td class="r"><b>${fmtQty(r.fin)}</b></td><td class="r">${fmtQty(r.un.sellado)}/${fmtQty(r.un.uso)}</td><td class="r">${r.cov === null ? '—' : fmtN(r.cov, 0) + ' d'}</td><td class="r">${r.life !== null ? fmtN(r.life, 1) + ' d' : '—'}</td>
        <td class="r"><input class="q" type="number" min="0" step="any" name="pedir" value="${r.pedir || ''}" placeholder="0" ${edit ? '' : 'disabled'} data-input="cmrow" title="Sugerido por el programa: ${fmtQty(r.sug)}"><br><small class="mut">sug. ${fmtQty(r.sug)}</small></td>
        <td style="min-width:240px"><input name="texto" value="${esc(r.texto)}" maxlength="240" placeholder="Comentario del mes…" ${edit ? '' : 'disabled'} data-input="cmrow" style="width:100%"><small class="mut" style="display:block;margin-top:2px">${esc(r.auto)}</small></td></tr>`; }).join('');
    return `<div class="note">Al terminar el mes, revisa cada insumo: el programa calcula el <b>consumo real</b>, cuánto <b>cubre</b> lo que queda y <b>cuánto pedir</b> para el siguiente mes (consumo automático × ${cfg().diasCierre || 30} días − existencia − lo que ya viene en camino). Puedes ajustar la cantidad y escribir tu comentario; al generar la solicitud, cada línea lleva su justificación.</div>
    <div class="tools"><div class="nav" style="display:flex;align-items:center;gap:6px"><button class="btn sm icon-btn" data-act="cmshift" data-n="-1" aria-label="Mes anterior">${ic('l')}</button><b style="min-width:140px;text-align:center">${esc(mesLabel(mes))}</b><button class="btn sm icon-btn" data-act="cmshift" data-n="1" aria-label="Mes siguiente">${ic('r')}</button></div>
      <select data-change="cmarea"><option value="">Todas las áreas</option>${areas.map(([id, n]) => `<option value="${id}" ${S.cm.area === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <span class="sp"></span>${expBtns('cierre')}${edit ? `<button class="btn" data-act="cmSave">${ic('check')} Guardar comentarios</button><button class="btn pri" data-act="cmReq">${ic('send')} Generar solicitud del mes siguiente (${nPed})</button>` : ''}</div>
    ${rows.length ? `<div class="tw"><table id="cmtbl"><thead><tr><th>Artículo</th><th class="r">Inicial</th><th class="r">Ingresos</th><th class="r">Consumo</th><th class="r">Existencia al cierre</th><th class="r" title="Sellado / En uso">Sell./Uso</th><th class="r">Cobertura</th><th class="r" title="Días promedio entre abrir y terminar una unidad">Dura 1 unidad</th><th class="r">Pedir</th><th>Comentario y justificación</th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card empty"><b>No hay insumos</b>Carga el catálogo de insumos en Inventario.</div>`}`;
  },
};
ACT.cmshift = el => { S.cm.mes = mesShift(S.cm.mes, +el.dataset.n); S.cm.draft = {}; render(); };
CHG.cmarea = el => { S.cm.area = el.value; render(); };
INP.cmrow = el => { const tr = el.closest('tr'), id = tr.dataset.id; const d = S.cm.draft[id] || (S.cm.draft[id] = {}); d.pedir = el.name === 'pedir' ? num(el.value) : (d.pedir ?? num(tr.querySelector('[name=pedir]').value)); d.texto = el.name === 'texto' ? el.value : (d.texto ?? tr.querySelector('[name=texto]').value); };
function cierreSave() {
  const mes = S.cm.mes; let n = 0;
  const bad = Object.entries(S.cm.draft).map(([id, d]) => (d.pedir > 0 ? chkQty(d.pedir, 'La cantidad a pedir de ' + (itemById(id)?.nombre || ''), { max: 100000 }) : '')).find(Boolean);
  if (bad) { toast(bad, 'bad'); return false; }
  for (const [id, d] of Object.entries(S.cm.draft)) {
    const it = itemById(id); if (!it) continue;
    (ix().evs.get(id) || []).filter(e => e.tipo === 'cierre' && e.periodo === mes).forEach(e => del('movements', e.id));
    if (d.pedir > 0 || (d.texto || '').trim()) { const ev = mkMove({ itemId: id, dir: 'ev', tipo: 'cierre', cant: d.pedir || 0, fecha: mesRange(mes).to > today() ? today() : mesRange(mes).to, hora: '23:59', src: 'cierre' }); ev.periodo = mes; ev.texto = (d.texto || '').trim(); put('movements', ev); n++; }
  }
  S.cm.draft = {}; if (n) log('Cierre de mes', `${mesLabel(mes)} · ${n} artículos con pedido o comentario`);
  return true;
}
ACT.cmSave = () => { if (!Object.keys(S.cm.draft).length) return toast('No hay cambios por guardar'); if (cierreSave()) { toast('Cierre guardado', 'ok'); render(); } };
ACT.cmReq = async () => {
  if (Object.keys(S.cm.draft).length && !cierreSave()) return;
  const mes = S.cm.mes, rows = cierreRows(mes).filter(r => r.pedir > 0);
  if (!rows.length) return toast('No hay artículos con cantidad a pedir', 'bad');
  if (!await confirmBox(`Se creará una solicitud de insumos con <b>${rows.length}</b> artículos para el mes siguiente de ${esc(mesLabel(mes))}, con su justificación en cada línea.`, 'Crear solicitud')) return;
  const rec = { id: uid(), estado: 'Borrador', userId: S.user.id, folio: nextFolio(), fecha: today(), tipo: 'insumo', solicitante: S.user.nombre, urgencia: 'Normal', provId: '', destNombre: '', destTel: '', destEmail: '', fechaReq: '', nota: `Solicitud generada del cierre de ${mesLabel(mes)}.`,
    lines: rows.map(r => ({ itemId: r.it.id, nombre: r.it.nombre, unidad: r.it.unidad, cant: r.pedir, stock: r.fin, just: (r.texto || r.auto).slice(0, 220) })) };
  put('requests', rec); log('Crear solicitud', `${rec.folio} desde cierre de ${mesLabel(mes)}`); render(); go('solicitudes'); openRequest(rec.id);
};
