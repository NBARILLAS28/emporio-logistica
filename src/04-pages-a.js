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
      return `<tr><td>${esc(r.it.nombre)}</td><td class="r">${fmtQty(r.st.st)}</td><td class="r">${fmtN(r.st.u.perDay, r.st.u.perDay < 1 ? 2 : 1)}</td><td style="min-width:130px"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar ${cl}" style="flex:1"><i style="width:${pct}%"></i></div><b class="num" style="min-width:34px;text-align:right">${fmtN(r.st.cov, 1)}</b></div></td><td>${fmtDate(r.st.agot)}</td><td class="r">${lf.avgLife ? fmtN(lf.avgLife, 0) : '—'}</td><td class="r">${(() => { const a = unitCycles(r.it.id).avg; return a !== null ? fmtN(a, 1) : '—'; })()}</td></tr>`;
    }).join('');
    const alertRows = alerts.slice(0, 9).map(r => `<tr><td>${esc(r.it.nombre)} <small class="mut">${r.it.tipo === 'insumo' ? '· insumo' : ''}</small></td><td class="r">${fmtQty(r.st.st)}</td><td class="r">${r.st.min || '—'}</td><td>${statusChip(r.st)}${r.st.camino ? ` <small class="chip info">+${fmtQty(r.st.camino)} en camino</small>` : ''}</td><td class="r"><b>${fmtQty(suggestQty(r.it, r.st))}</b></td></tr>`).join('');
    const pend = pendingRequests(), lt = leadTimes();
    const pendHTML = pend.length ? `<div class="card"><h3>Solicitudes en espera <small>${pend.length} sin recibir completas${lt.med !== null ? ` · entrega típica: ${fmtN(lt.med, 0)} días` : ''}</small><button class="btn sm" data-act="go" data-page="solicitudes">Ver solicitudes</button></h3><div class="tw"><table><thead><tr><th>Folio</th><th>Fecha</th><th>Para</th><th class="r">Pendientes</th><th class="r">Espera</th></tr></thead><tbody>${pend.slice(0, 6).map(p => `<tr><td><b>${esc(p.r.folio)}</b></td><td>${fmtDate(p.r.fecha)}</td><td>${esc(p.r.destNombre || (p.r.tipo === 'insumo' ? 'Insumos' : 'Productos'))}</td><td class="r">${p.pend} art.</td><td class="r">${p.tarde ? chip(p.dias + ' d · tarde', 'bad') : chip(p.dias + ' d', 'info')}</td></tr>`).join('')}</tbody></table></div></div>` : '';
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
     ${pendHTML}
     <div class="card"><h3>Tiempo de uso y cobertura <small>según el consumo de los últimos ${cfg().ventanaConsumo} días</small><button class="btn sm" data-act="go" data-page="reportes" data-rep="consumo">Ver reporte completo</button></h3>
       ${usoRows ? `<div class="tw"><table><thead><tr><th>Artículo</th><th class="r">Existencia</th><th class="r">Consumo/día</th><th>Cobertura (días)</th><th>Se agota aprox.</th><th class="r" title="Días promedio que tarda en agotarse cada ingreso (método PEPS)">Vida prom. de lote (días)</th><th class="r" title="Días promedio entre abrir y terminar una unidad">Duración de 1 unidad (días)</th></tr></thead><tbody>${usoRows}</tbody></table></div>` : '<div class="empty">Aún no hay consumo suficiente para estimar la duración.</div>'}</div>`;
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
  const ins = S.invTab === 'insumo';
  const cols = [{ t: 'Código', k: r => r.it.codigo || '' }, { t: 'Artículo', k: r => r.it.nombre }, { t: ins ? 'Área' : 'Categoría', k: r => catName(r.it.catId) }, { t: 'Unidad', k: r => r.it.unidad }, { t: 'Existencia', k: r => r.st.st, n: 1, d: 0 },
  ...(ins ? [{ t: 'Sellado', k: r => unitState(r.it.id).sellado, n: 1 }, { t: 'En uso', k: r => unitState(r.it.id).uso, n: 1 }, { t: 'En camino', k: r => r.st.camino || '', n: 1 }] : []),
  { t: 'Mínimo', k: r => r.st.min, n: 1 }, { t: 'Consumo/día', k: r => r.st.u.perDay, n: 1, d: 2 }, { t: 'Origen del consumo', k: r => r.st.u.origen }, { t: 'Cobertura (días)', k: r => r.st.cov === null ? '' : r.st.cov, n: 1, d: 1 }, ...(ins ? [{ t: 'Duración de 1 unidad (días)', k: r => unitCycles(r.it.id).avg ?? '', n: 1, d: 1 }] : []), { t: 'Estado', k: r => r.st.est }];
  if (costos) cols.push({ t: 'Costo', k: r => r.it.costo, n: 1, d: 2 }, { t: 'Precio', k: r => r.it.precio, n: 1, d: 2 }, { t: 'Valor al costo', k: r => Math.max(0, r.st.st) * r.it.costo, n: 1, d: 2 });
  const rows = invRows();
  return { title: S.invTab === 'producto' ? 'Inventario de productos para venta' : 'Inventario de insumos', sub: 'Existencias al ' + fmtDate(today()) + ' · ' + rows.length + ' artículos', cols, rows, foot: { 'Artículo': 'TOTAL', 'Existencia': rows.reduce((a, r) => a + r.st.st, 0), ...(costos ? { 'Valor al costo': rows.reduce((a, r) => a + Math.max(0, r.st.st) * r.it.costo, 0) } : {}) } };
}
EXPSRC.inv = invDS;
function invTable() {
  const rows = invRows(), costos = can('costos'), ins = S.invTab === 'insumo';
  if (!rows.length) return `<div class="empty"><b>Sin artículos</b>${S.invQ || S.invCat || S.invEst ? 'Prueba quitando los filtros.' : (can('catalogo') ? 'Pulsa «Nuevo artículo» para crear el primero.' : '')}</div>`;
  const origen = u => u.origen === 'estimado' ? ' <small class="mut" title="Estimado inicial: se reemplaza automáticamente con el consumo real">est.</small>' : u.origen === 'mixto' ? ' <small class="mut" title="Mezcla de estimado inicial y consumo real">mix</small>' : '';
  const body = rows.map(({ it, st }) => { const un = ins ? unitState(it.id) : null; return `<tr${it.activo === false ? ' style="opacity:.5"' : ''}><td>${esc(it.codigo || '')}</td><td><b>${esc(it.nombre)}</b>${it.activo === false ? ' <small>(archivado)</small>' : ''}<br><small class="mut">${esc(catName(it.catId))}${it.ubicacion ? ' · ' + esc(it.ubicacion) : ''}</small></td>
    <td class="r"><b>${fmtQty(st.st)}</b> <small class="mut">${esc(it.unidad)}</small>${st.camino ? `<br><small class="chip info" title="Solicitado y aún sin recibir">+${fmtQty(st.camino)} en camino</small>` : ''}</td>
    ${ins ? `<td class="r">${fmtQty(un.sellado)}</td><td class="r">${fmtQty(un.uso)}</td>` : ''}<td class="r">${st.min || '—'}${it.min > 0 ? '' : st.min ? ' <small class="mut" title="Mínimo calculado según consumo">auto</small>' : ''}</td>
    <td class="r">${fmtN(st.u.perDay, st.u.perDay < 1 ? 2 : 1)}${origen(st.u)}</td><td class="r">${st.cov === null ? '—' : fmtN(st.cov, 1) + ' d'}</td><td>${statusChip(st)}</td>
    ${costos ? `<td class="r">${it.costo ? fmtN(it.costo, 2) : '—'}</td>${S.invTab === 'producto' ? `<td class="r">${it.precio ? fmtN(it.precio, 2) : '—'}</td>` : ''}<td class="r">${it.costo ? fmtN(Math.max(0, st.st) * it.costo, 2) : '—'}</td>` : ''}
    <td><div class="act">${can('mov') ? `<button class="btn sm icon-btn" title="Registrar ingreso" data-act="movFor" data-id="${it.id}" data-d="in">${ic('plus')}</button>${ins ? `<button class="btn sm" title="Pasar una unidad de Sellado a En uso" data-act="unitOpen" data-id="${it.id}">Abrir</button><button class="btn sm" title="Dar una unidad por terminada (sale del inventario)" data-act="unitDone" data-id="${it.id}">Terminar</button>` : ''}<button class="btn sm icon-btn" title="Registrar egreso" data-act="movFor" data-id="${it.id}" data-d="out" style="font-weight:900">−</button>` : ''}<button class="btn sm icon-btn" title="Historial y tiempo de uso" data-act="kardex" data-id="${it.id}">${ic('clock')}</button>${can('catalogo') ? `<button class="btn sm icon-btn" title="Editar" data-act="editItem" data-id="${it.id}">${ic('edit')}</button>` : ''}</div></td></tr>`; }).join('');
  return `<div class="tw"><table><thead><tr><th>Código</th><th>Artículo</th><th class="r">Existencia</th>${ins ? '<th class="r" title="Unidades nuevas, sin abrir">Sellado</th><th class="r" title="Unidades abiertas, en uso">En uso</th>' : ''}<th class="r">Mínimo</th><th class="r">Consumo/día</th><th class="r">Cobertura</th><th>Estado</th>${costos ? `<th class="r">Costo</th>${S.invTab === 'producto' ? '<th class="r">Precio</th>' : ''}<th class="r">Valor</th>` : ''}<th></th></tr></thead><tbody>${body}</tbody></table></div>`;
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
  const it = id ? itemById(id) : { tipo: S.invTab, nombre: '', codigo: '', catId: '', unidad: 'unidad', uCompra: '', pack: 0, min: 0, max: 0, costo: 0, precio: 0, provId: '', ubicacion: '', nota: '', duracionEsp: 0, baseDia: 0, activo: true };
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
     <div class="grid g3 only-ins"><div class="fld"><label>Se compra en (presentación)</label><input name="uCompra" value="${esc(it.uCompra || '')}" placeholder="Ej. tira de 50, caja, galón"></div>
      <div class="fld"><label>Consumo mensual inicial (estimado)</label><input name="baseMes" type="number" min="0" step="any" value="${it.baseDia ? Math.round(it.baseDia * 30 * 10) / 10 : ''}" placeholder="Opcional"></div>
      <div class="fld"><label>&nbsp;</label><small class="mut">Solo arranca el cálculo: el programa lo reemplaza solo con el consumo real que se vaya registrando.</small></div></div>
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
  const rec = { ...(old || { id: uid(), activo: true }), tipo, nombre, codigo: g('codigo').trim(), catId, unidad: g('unidad').trim() || 'unidad', pack: num(g('pack')), min: num(g('min')), max: num(g('max')), provId: g('provId'), ubicacion: g('ubicacion').trim(), nota: g('nota').trim(), duracionEsp: num(g('duracionEsp')), uCompra: g('uCompra').trim(), baseDia: tipo === 'insumo' ? num(g('baseMes')) / 30 : 0 };
  if (rec.baseDia && !rec.baseNota) rec.baseNota = 'Estimado capturado a mano';
  if (can('costos')) { rec.costo = num(g('costo')); rec.precio = tipo === 'producto' ? num(g('precio')) : 0; }
  else if (!old) { rec.costo = 0; rec.precio = 0; }
  if (old) rec.activo = f.elements.activo.checked;
  if (!old && num(g('cantIni')) > 0) { const er = chkDate(g('fechaIni') || today(), { label: 'La fecha de la existencia inicial' }) || chkQty(num(g('cantIni')), 'La existencia inicial'); if (er) return toast(er, 'bad'); }
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
ACT.voidOpen = async el => {
  const e = DB.movements.find(x => x.id === el.dataset.id); if (!e) return;
  if (!await confirmBox('¿Anular esta apertura de unidad? La unidad volverá a contarse como Sellado.', 'Anular', true)) return;
  del('movements', e.id); log('Anular apertura', itemById(e.itemId)?.nombre || ''); toast('Apertura anulada'); closeModal(); render();
};
ACT.kardex = el => {
  const it = itemById(el.dataset.id); S.kardexId = it.id; const s = itemStatus(it), lf = lotsOf(it.id);
  const lotRows = lf.lots.slice().reverse().slice(0, 12).map(l => `<tr><td>${fmtDate(l.fecha)}</td><td>${l.tipo === 'inicial' ? 'Existencia inicial' : TIPO_LABEL[l.tipo] || 'Ingreso'}</td><td class="r">${fmtQty(l.cant)}</td><td>${l.cierre ? fmtDate(l.cierre) : '<span class="chip info">en uso: ' + fmtQty(l.rest) + ' restantes</span>'}</td><td class="r">${l.dias ? l.dias + ' d' : l.cierre ? '1 d' : daysBetween(l.fecha, today()) + ' d (en curso)'}</td><td>${l.vence ? fmtDate(l.vence) : ''}</td></tr>`).join('');
  const ds = kardexDS(it.id, '0000-01-01', '9999-12-31');
  const stat = (l, v) => `<div class="kpi" style="padding:10px 12px"><small>${l}</small><b style="font-size:19px">${v}</b></div>`;
  const ins = it.tipo === 'insumo', un = unitState(it.id), uc = unitCycles(it.id), lt = leadTimes().per.get(it.id);
  const durU = uc.avg !== null ? (it.duracionEsp > 0 ? `${fmtN(uc.avg, 1)} d real vs ${fmtN(it.duracionEsp, 0)} d esperado` : fmtN(uc.avg, 1) + ' días') : '—';
  const ucRows = [...uc.enUso.map(o => `<tr><td>${fmtDate(o.abrio)}</td><td><span class="chip info">En uso${o.cant > 1 ? ' ×' + fmtQty(o.cant) : ''}</span></td><td class="r">${o.dias} d (en curso)</td><td>${can('anular') ? `<button class="btn sm icon-btn" title="Anular esta apertura" data-act="voidOpen" data-id="${o.evId}">${ic('trash')}</button>` : ''}</td></tr>`),
    ...uc.cyc.slice().reverse().slice(0, 10).map(c => `<tr><td>${fmtDate(c.abrio)}</td><td>${fmtDate(c.termino)}</td><td class="r">${c.dias} d</td><td></td></tr>`)].join('');
  const dur = it.duracionEsp > 0 && lf.avgLife ? `${fmtN(lf.avgLife, 0)} d real vs ${fmtN(it.duracionEsp, 0)} d esperado` : (lf.avgLife ? fmtN(lf.avgLife, 0) + ' días' : '—');
  openModal({
    title: `${esc(it.nombre)} <span style="margin-left:8px">${statusChip(s)}</span>`, size: 'wide',
    body: `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${stat('Existencia', fmtQty(s.st) + ' ' + esc(it.unidad))}${stat('Consumo / día', fmtN(s.u.perDay, 2))}${stat('Cobertura', s.cov === null ? '—' : fmtN(s.cov, 1) + ' días')}${stat('Se agota aprox.', s.agot ? fmtDate(s.agot) : '—')}${stat('Vida prom. de un lote', dur)}${stat('Cada cuánto se repone', lf.cicloRepo ? fmtN(lf.cicloRepo, 0) + ' días' : '—')}${ins ? stat('Sellado / En uso', fmtQty(un.sellado) + ' / ' + fmtQty(un.uso)) + stat('Duración de 1 unidad', durU) : ''}${lt && lt.avg !== null ? stat('Tiempo de entrega', fmtN(lt.avg, 1) + ' días') : ''}${s.camino ? stat('En camino', fmtQty(s.camino) + ' ' + esc(it.unidad)) : ''}</div>
    <p class="mut" style="margin:6px 0 10px"><small>Consumo/día: <b>${esc(s.u.origen)}</b>${s.u.origen === 'estimado' || s.u.origen === 'mixto' ? ` · base inicial ${fmtN(s.u.base * 30, 1)} por mes${it.baseNota ? ' (' + esc(it.baseNota) + ')' : ''}; se ajusta solo con el uso real` : ''}</small></p>
    ${ins ? `<h4 class="mb">Unidades: de Sellado a Terminado <small class="mut">(cuántos días dura cada una)</small></h4><div class="tw mb"><table><thead><tr><th>Se abrió</th><th>Se terminó</th><th class="r">Duró</th><th></th></tr></thead><tbody>${ucRows || '<tr><td colspan="4" class="empty">Aún no hay unidades abiertas. Usa «Abrir» y «Terminar» en Inventario para medir cuánto dura cada una.</td></tr>'}</tbody></table></div>` : ''}
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
    <td><div class="act">${can('mov') && !m.src?.startsWith('turno') && m.src !== 'conteo' && m.src !== 'terminar' ? `<button class="btn sm icon-btn" title="Editar" data-act="editMov" data-id="${m.id}">${ic('edit')}</button>` : ''}${can('anular') ? `<button class="btn sm icon-btn" title="Anular" data-act="voidMov" data-id="${m.id}">${ic('trash')}</button>` : ''}</div></td></tr>`).join('');
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
  { const er = chkDate(g('fecha'), { label: 'La fecha del movimiento' }); if (er) return toast(er, 'bad'); }
  if (!lines.length || lines.some(l => !l.itemId || !(l.cant > 0))) return toast('Cada línea necesita un artículo y una cantidad mayor a 0', 'bad');
  { const er = lines.map(l => chkQty(l.cant, 'La cantidad de ' + (itemById(l.itemId)?.nombre || 'un artículo'))).find(Boolean); if (er) return toast(er, 'bad'); }
  { const v = lines.find(l => l.vence && dir === 'in' && l.vence < g('fecha')); if (v) return toast(`La fecha de vencimiento de ${itemById(v.itemId).nombre} es anterior a la del ingreso.`, 'bad'); }
  { const dup = lines.find((l, i) => lines.findIndex(x => x.itemId === l.itemId) !== i); if (dup && !await confirmBox(`<b>${esc(itemById(dup.itemId).nombre)}</b> aparece más de una vez en esta ficha. ¿Registrar ambas líneas?`, 'Registrar igual')) return; }
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
