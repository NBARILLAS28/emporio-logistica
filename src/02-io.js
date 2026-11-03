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
  rq.lines.forEach((l, i) => out.push(`${i + 1}. ${l.nombre} - ${fmtQty(l.cant)} ${l.unidad || 'unidad'}${l.stock !== undefined ? `  (existencia actual: ${fmtQty(l.stock)})` : ''}${l.just ? `\n    Motivo: ${l.just}` : ''}`));
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
    cols: [{ t: '#', k: r => r._i }, { t: 'Artículo', k: 'nombre' }, { t: 'Unidad', k: 'unidad' }, { t: 'Existencia', k: 'stock', n: 1 }, { t: 'Cantidad solicitada', k: 'cant', n: 1 }, ...(rq.lines.some(l => l.just) ? [{ t: 'Motivo', k: 'just' }] : [])],
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
