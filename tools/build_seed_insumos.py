"""Genera supabase/migrations/003_insumos_iniciales.sql y tools/seed_insumos.json
a partir de INSUMOS.xlsx (Octubre / Noviembre).

Uso: python3 tools/build_seed_insumos.py /ruta/INSUMOS.xlsx
Los IDs son deterministas, así que el SQL se puede ejecutar más de una vez sin duplicar nada.
"""
import sys, json, re, hashlib, datetime as dt, pathlib
import openpyxl

SRC = sys.argv[1]
ROOT = pathlib.Path(__file__).resolve().parent.parent
NOW = 1793680637423 + 5000          # marca de tiempo estable, anterior a cualquier edición hecha desde la app (LWW)
HOY = dt.date(2026, 11, 3)
SNAP = '2026-10-31'                   # el conteo de Noviembre es el cierre de Octubre

def rid(*parts):
    return 'i' + hashlib.sha1('|'.join(parts).encode()).hexdigest()[:12]

# --- categorías: Limpieza ya existe en 002; las otras tres áreas son nuevas -------------------
CAT_LIMPIEZA = 'mw0751inw4hmrp'
CATS = {'Limpieza': CAT_LIMPIEZA}
for a in ['Pista', 'Baños', 'Recepción']:
    CATS[a] = rid('cat', a)
AREA_DE = {'Artículos para Limpieza': 'Limpieza', 'Artículos para Pista': 'Pista', 'Artículos para Baños': 'Baños', 'Artículos para Recepción': 'Recepción'}

# --- nombres unificados (Excel → catálogo) -----------------------------------------------------
REN = {
    'Atomisadores para limpieza': 'Atomizadores para limpieza',
    'Atomisadores para clientes': 'Atomizadores para clientes',
    'Cuardernos': 'Cuadernos',
    'Paquete Bolsas para botes de basura M': 'Bolsas para botes de basura (rollo)',
    'Paquete Bolsas para botes de basura': 'Bolsas para botes de basura (rollo)',
    'Paquete Bolsas grandes Canguro': 'Bolsas grandes Canguro (rollo)',
    'Paquete de bolsas para basura medianas': 'Bolsas para basura medianas (paquete)',
    'Azúcar Normal Morena': 'Azúcar morena (bolsa 2500 g)', 'Azúcar Normal bolsa': 'Azúcar morena (bolsa 2500 g)',
    'Azúcar Normal Bolsitas': 'Azúcar normal en bolsitas', 'Azúcar Normal bolsitas': 'Azúcar normal en bolsitas',
    'Azúcar Splenda': 'Azúcar Splenda (sobres)',
    'Toallas limpiadoras para clientes': 'Toallas limpiadoras para clientes', 'Toallas limpiadores para GYM': None,
    'Paquete de protectores íntimos': 'Protectores íntimos', 'Paquete de Toallas Sanitarias': 'Toallas sanitarias',
    'Botes de basura': 'Botes de basura (baños)', 'Botes para basura': 'Botes para basura (limpieza)',
    'Líquido Rojo para limpiar locker': 'Líquido rojo para limpiar locker',
    'Escobilla para baño o gusano': 'Escobilla para baño (gusano)',
    'Posti (Notas Adhesivas)': 'Posti (notas adhesivas)', 'Caja Guantes': 'Caja de guantes',
    'W40': 'WD-40', 'Palo para limpiar espejos': 'Palo para limpiar espejos',
    'Botiquín de primeros Auxilios': 'Botiquín de primeros auxilios',
}
def nombre(n):
    n = re.sub(r'\s+', ' ', str(n).strip())
    return REN[n] if n in REN else n

# --- unidad de uso, presentación de compra y empaque (para redondear pedidos) ------------------
UNI = {  # nombre: (unidad, presentación de compra, empaque)
    'Detergente': ('bolsa', '', 0), 'Cera para pisos': ('galón', '', 0), 'Desinfectante': ('galón', 'galón', 0), 'Baygon': ('aerosol', '', 0),
    'Líquido rojo para limpiar locker': ('galón', '', 0), 'Cloro': ('bolsita', 'bolsa de bolsitas', 0),
    'Bolsas grandes Canguro (rollo)': ('rollo', '', 0), 'Bolsas para botes de basura (rollo)': ('rollo', 'rollo', 0), 'Bolsas para basura medianas (paquete)': ('paquete', '', 0),
    'Escoba para limpiar tela de arañas': ('palo', '', 0), 'Palo para trapeador': ('unidad', '', 0), 'Escobas para barrer': ('unidad', '', 0), 'Escobas para trapear': ('unidad', '', 0),
    'Pala para recoger basura': ('unidad', '', 0), 'Trapeadores': ('unidad', '', 0), 'Botes para basura (limpieza)': ('unidad', '', 0),
    'Palo para limpiar espejos': ('unidad', '', 0), 'Líquido para limpiar espejos': ('galón', 'galón', 0), 'Ajax': ('bote', '', 0), 'Caja de guantes': ('caja', '', 0),
    'Guantes de limpieza': ('caja', '', 0), 'Lija': ('unidad', '', 0), 'Jabón de trastes para limpiar baños': ('bote', '', 0),
    'Atomizadores para limpieza': ('unidad', '', 0), 'Atomizadores para clientes': ('unidad', '', 0), 'Cera de máquinas': ('galón', 'galón', 0), 'Líquido verde para pisos': ('galón', 'galón', 0),
    'WD-40': ('bote', 'bote', 0), 'Silicona para lubricar barras': ('bote', 'bote de 500 ml', 0), 'Toallas limpiadoras para clientes': ('unidad', '', 0),
    'Jabón de manos': ('galón', '', 0), 'Desodorante Hombre': ('unidad', '', 0), 'Desodorante mujer': ('unidad', '', 0), 'Pastilla de baño': ('unidad', '', 0),
    'Escobilla para baño (gusano)': ('unidad', '', 0), 'Botes de basura (baños)': ('unidad', '', 0), 'Dispensador de Jabón para baños': ('unidad', '', 0),
    'Protectores íntimos': ('unidad', 'paquete', 49), 'Toallas sanitarias': ('unidad', 'paquete', 23), 'Esponjas para limpiar baños': ('unidad', '', 0),
    'Papel higienico': ('rollo', '', 0), 'Ojo de pescado': ('bote', 'bote', 0),
    'Botiquín de primeros auxilios': ('botiquín', '', 0), 'Café': ('bolsa', 'bolsa de 2300 g', 0), 'Azúcar morena (bolsa 2500 g)': ('bolsa', '', 0), 'Azúcar normal en bolsitas': ('unidad', '', 0),
    'Azúcar Splenda (sobres)': ('sobre', '', 0), 'Removedores de café': ('unidad', '', 0), 'Vasos': ('unidad', 'tira de 50', 50), 'Tapaderas': ('unidad', '', 0),
    'Posti (notas adhesivas)': ('paquete', '', 0), 'Resaltador': ('unidad', '', 0), 'Sellador': ('unidad', '', 0), 'Tijeras': ('unidad', '', 0), 'Resma de hojas blancas': ('resma', '', 0),
    'Tape': ('rollo', '', 0), 'Cuadernos': ('unidad', '', 0), 'Lápiceros': ('unidad', '', 0), 'Masquín': ('rollo', '', 0), 'Grapas': ('caja', '', 0), 'Mantel negro para actividades': ('unidad', '', 0),
}
# --- consumo inicial estimado (por mes), sacado de las notas y cierres de Octubre --------------
#     Solo sirve para arrancar: el programa lo sustituye solo con el consumo real.
BASE = {
    'Desinfectante': (13, 'Oct: 5 + 12 ingresados − 3 sellados − 1 en uso'),
    'Cloro': (24, 'Cierre Oct: se usan ≈24 bolsitas al mes'),
    'WD-40': (4, 'Nota Oct: 1 bote por semana'),
    'Cera de máquinas': (3, 'Cierre Oct: más de 2 galones, 2 turnos'),
    'Líquido verde para pisos': (3, 'Cierre Oct: más de 2 galones, 2 turnos'),
    'Líquido para limpiar espejos': (2, 'Cierre Oct: ≈1.5 galones'),
    'Pastilla de baño': (16, 'Nota Oct: 1 por baño × 4 semanas + 4 bodega'),
    'Desodorante Hombre': (2, 'Nota Oct: 1 cada 15 días'),
    'Desodorante mujer': (2, 'Nota Oct: 1 cada 15 días'),
    'Café': (1, 'Nota Oct: 1 bolsa de 2300 g dura el mes'),
    'Vasos': (231, 'Oct: 200 terminados en 26 días'),
    'Protectores íntimos': (29, 'Oct: 25 terminados en 26 días'),
    'Toallas sanitarias': (30, 'Oct: 26 terminadas en 26 días'),
    'Azúcar normal en bolsitas': (126, 'Oct: 130 terminadas en 31 días'),
    'Removedores de café': (55, 'Oct: 287 → 230 en 31 días'),
    'Azúcar Splenda (sobres)': (24, 'Oct: 625 → 600 en 31 días'),
}

# --- solicitud del 02/11: cantidades (hoja Noviembre) + decisiones del usuario -----------------
EXTRA_NOV = {'WD-40': 4, 'Lápiceros': 5}   # W40 = 4 botes (comentario) · Lápiceros = 5 (cierre de Octubre)

wb = openpyxl.load_workbook(SRC, data_only=True)

def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v
    m = re.search(r'\d+(?:[.,]\d+)?', str(v))
    return float(m.group().replace(',', '.')) if m else None

CORRECCIONES = []
def fecha(v, ctx=''):
    """Devuelve la fecha corrigiendo errores de captura típicos del Excel (año 2025, '05/10/026', mes 12 por 10)."""
    d = None
    if isinstance(v, dt.datetime): d = v.date()
    elif isinstance(v, str):
        m = re.fullmatch(r'\s*(\d{1,2})/(\d{1,2})/(\d{1,4})\s*', v)
        if m: d = dt.date(2026, int(m.group(2)), int(m.group(1))); CORRECCIONES.append('%s: fecha «%s» leída como %s' % (ctx, v.strip(), d))
    if d is None: return None
    if d.year != 2026:
        n = d.replace(year=2026); CORRECCIONES.append('%s: fecha %s corregida a %s' % (ctx, d, n)); d = n
    return d

def leer(ws):
    area, nombre_act, out = None, None, []
    for r in ws.iter_rows(min_row=10, values_only=True):
        a = r[0]
        if isinstance(a, str) and a.strip() in AREA_DE:
            area = AREA_DE[a.strip()]; nombre_act = None; continue
        if a is not None: nombre_act = nombre(a)
        if nombre_act is None or all(x is None for x in r[:10]): continue
        out.append(dict(area=area, item=nombre_act, existente=r[1], sellado=r[2], uso=r[3], term=r[4],
                        fsol=r[5], qsol=r[6], fing=r[7], qing=r[8], com=r[9], cierre=r[13] if len(r) > 13 else None,
                        csol=r[11] if len(r) > 11 else None, cqty=r[12] if len(r) > 12 else None, primera=a is not None))
    return out

nov = leer(wb['Noviembre']); octu = leer(wb['Octubre'])

# --- catálogo (orden de la hoja de Noviembre) ----------------------------------------------------
items, orden = {}, []
for r in nov:
    n = r['item']
    if n in items: continue
    u = UNI.get(n, ('unidad', '', 0))
    base = BASE.get(n)
    items[n] = dict(id=rid('ins', n), tipo='insumo', nombre=n, codigo='', catId=CATS[r['area']], unidad=u[0], uCompra=u[1], pack=u[2], min=0, max=0, costo=0, precio=0,
                    provId='', ubicacion='', nota='', duracionEsp=0, baseDia=round(base[0] / 30, 5) if base else 0, baseNota=base[1] if base else '',
                    activo=n != 'Líquido rojo para limpiar locker', u=NOW)
    if n == 'Líquido rojo para limpiar locker': items[n]['nota'] = 'Ya no se usa (cierre de Octubre)'
    if u[2] and n in ('Protectores íntimos', 'Toallas sanitarias'): items[n]['nota'] = 'Empaque derivado del ingreso de Octubre (2 paquetes = %s u)' % ('98' if n == 'Protectores íntimos' else '46')
    orden.append(n)
# artículos que solo salen en Octubre y no están en Noviembre se ignoran (no hay ninguno de interés)

regs = []   # filas de inv_registros
def add(col, data):
    data = dict(data); data['u'] = NOW; regs.append(dict(col=col, id=data['id'], data=data, u=NOW))

for a, cid in CATS.items():
    if a != 'Limpieza': add('categories', dict(id=cid, nombre=a, tipo='insumo'))
for it in items.values(): add('items', it)

# --- existencias iniciales de Noviembre (Sellado + En uso = existencia real) -----------------------
def mov(**kw):
    d = dict(fecha=SNAP, hora='23:58', turno='PM', costoU=0, precioU=0, doc='', provId='', vence='', nota='', userId='', src='excel', turnoKey='', reqId='')
    d.update(kw); d['id'] = rid('mov', d['itemId'], d['tipo'], d['fecha'], d.get('hora', ''), str(d['cant'])); return d
n_mov = n_ev = 0
for r in nov:
    it = items[r['item']]
    sel, uso = num(r['sellado']) or 0, num(r['uso']) or 0
    if sel + uso > 0:
        add('movements', mov(itemId=it['id'], dir='in', tipo='inicial', cant=sel + uso, nota='Conteo inicial de Noviembre: %g sellado + %g en uso (INSUMOS.xlsx)' % (sel, uso))); n_mov += 1
    if uso > 0:
        add('movements', mov(itemId=it['id'], dir='ev', tipo='abrir', cant=uso, hora='23:59', src='excel', nota='Unidades en uso al cierre de Octubre')); n_ev += 1

# --- notas del cierre de octubre (comentario + cantidad propuesta) ---------------------------------
n_cierre = 0
for r in octu:
    if r['cierre'] in (None, '-', '') or r['item'] not in items: continue
    if not r['primera'] and not r['cierre']: continue
    q = num(r['cqty']) if str(r['cqty']).strip() not in ('-', 'None', '') else 0
    ev = mov(itemId=items[r['item']]['id'], dir='ev', tipo='cierre', cant=q or 0, fecha='2026-10-31', hora='23:59', src='excel', nota='')
    ev['id'] = rid('cierre', r['item'], '2026-10'); ev['periodo'] = '2026-10'; ev['texto'] = str(r['cierre']).strip()[:240]
    add('movements', ev); n_cierre += 1

# --- solicitud del 02/11 -----------------------------------------------------------------------------
cier_txt = {r['item']: str(r['cierre']).strip() for r in octu if r['cierre'] not in (None, '-', '')}
lines, vistos = [], set()
for r in nov:
    f = fecha(r['fsol']); q = num(r['qsol'])
    if f != dt.date(2026, 11, 2): continue
    n = r['item']; q = EXTRA_NOV.get(n, q)
    if not q: continue
    it = items[n]; stock = (num(r['sellado']) or 0) + (num(r['uso']) or 0)
    ln = dict(itemId=it['id'], nombre=n, unidad=it['unidad'], cant=q, stock=stock)
    if n in cier_txt: ln['just'] = cier_txt[n][:220]
    lines.append(ln); vistos.add(n)
for n, q in EXTRA_NOV.items():
    if n not in vistos:
        it = items[n]; r = next(x for x in nov if x['item'] == n)
        ln = dict(itemId=it['id'], nombre=n, unidad=it['unidad'], cant=q, stock=(num(r['sellado']) or 0) + (num(r['uso']) or 0))
        if n in cier_txt: ln['just'] = cier_txt[n][:220]
        lines.append(ln)
orden_idx = {n: i for i, n in enumerate(orden)}
lines.sort(key=lambda l: orden_idx[l['nombre']])
sol = dict(id=rid('sol', '2026-11-02'), folio='SOL-0001', fecha='2026-11-02', tipo='insumo', estado='Enviada', via='otro', enviada=int(dt.datetime(2026, 11, 2, 12).timestamp() * 1000),
           solicitante='Encargado de insumos', urgencia='Normal', provId='', destNombre='', destTel='', destEmail='', fechaReq='', userId='',
           nota='Solicitud de Noviembre cargada desde INSUMOS.xlsx (hoja Noviembre).', lines=lines)
add('requests', sol)

# --- historial de octubre: solicitudes e ingresos (no mueven existencia) ---------------------------------
def parse_fecha_oct(v, ctx):
    d = fecha(v, ctx)
    if d == dt.date(2026, 12, 7): d = dt.date(2026, 10, 7); CORRECCIONES.append('%s: ingreso 07/12 corregido a 07/10 (error de captura)' % ctx)
    return d
por_fecha, avisos = {}, []
cur = None
for r in octu:
    f = parse_fecha_oct(r['fsol'], r['item']); q = num(r['qsol'])
    if f is None or r['item'] not in items: continue
    if r['item'] == 'Toallas limpiadores para GYM': continue
    fi = parse_fecha_oct(r['fing'], r['item']); qi = num(r['qing']) if fi else None
    if q is None and qi: q = qi                       # llegó mercadería sin cantidad pedida: se toma lo recibido
    if q is None:
        avisos.append('%s: solicitud del %s sin cantidad (se omite)' % (r['item'], f)); continue
    it = items[r['item']]
    if it['pack'] and q < it['pack'] and qi and qi >= it['pack']: q = q * it['pack']   # «2 paquetes» → unidades
    ln = dict(itemId=it['id'], nombre=r['item'], unidad=it['unidad'], cant=q)
    if fi and qi: ln['recFecha'] = fi.isoformat(); ln['recCant'] = qi
    elif fi: ln['recFecha'] = fi.isoformat(); ln['recCant'] = q
    por_fecha.setdefault(f, []).append(ln)
for f, ls in sorted(por_fecha.items()):
    # unir líneas repetidas del mismo artículo en la misma solicitud
    m = {}
    for l in ls:
        if l['itemId'] in m:
            k = m[l['itemId']]; k['cant'] += l['cant']
            if 'recFecha' in l: k['recFecha'] = max(k.get('recFecha', ''), l['recFecha']); k['recCant'] = k.get('recCant', 0) + l['recCant']
        else: m[l['itemId']] = dict(l)
    ls = list(m.values())
    todo = all(l.get('recCant', 0) >= l['cant'] for l in ls)
    add('requests', dict(id=rid('hist', f.isoformat()), folio='OCT-' + f.strftime('%d%m'), fecha=f.isoformat(), tipo='insumo', estado='Recibida' if todo else 'Parcial', via='otro', hist=True,
                         solicitante='Histórico de Octubre', urgencia='Normal', provId='', destNombre='', destTel='', destEmail='', fechaReq='', userId='',
                         nota='Solicitud histórica cargada de INSUMOS.xlsx (hoja Octubre). No afecta la existencia.', lines=ls,
                         recibida=max([l['recFecha'] for l in ls if 'recFecha' in l] or ['']) ))

# --- salidas -----------------------------------------------------------------------------------------------
sql = ["-- =====================================================================",
       "-- EMPORIO · Logística interna — insumos iniciales (desde INSUMOS.xlsx)",
       "-- %d artículos en 4 áreas · conteo de Noviembre (Sellado + En uso) · solicitud SOL-0001 del 02/11 · historial de solicitudes de Octubre." % len(items),
       "-- Ejecutar DESPUÉS de 001 y 002. Es seguro repetirlo: no duplica ni pisa cambios hechos en la app.",
       "-- =====================================================================",
       "insert into public.inv_registros (col, id, data, u)",
       "select r.col, r.id, r.data, r.u",
       "from jsonb_to_recordset($seed$" + json.dumps(regs, ensure_ascii=False, separators=(',', ':')) + "$seed$::jsonb) as r(col text, id text, data jsonb, u bigint)",
       "on conflict (col, id) do nothing;", ""]
(ROOT / 'supabase/migrations/003_insumos_iniciales.sql').write_text('\n'.join(sql), encoding='utf-8')
(ROOT / 'tools/seed_insumos.json').write_text(json.dumps(regs, ensure_ascii=False, indent=1), encoding='utf-8')
print('items', len(items), 'activos', sum(1 for i in items.values() if i['activo']), '· conteos', n_mov, 'aperturas', n_ev, 'notas cierre', n_cierre, '· sol nov líneas', len(lines))
print('solicitudes históricas', len(por_fecha), 'registros totales', len(regs))
for a in avisos: print('AVISO', a)
for c in CORRECCIONES: print('CORRECCIÓN', c)
