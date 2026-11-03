import openpyxl, re, json, sys
from datetime import datetime
src = sys.argv[1]; out = sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
hdr = re.compile(r'INVENTARIO INTERNO EMPORIO.*?(\d{2})/(\d{2})/(\d{4})', re.I)
days = {}   # date -> {item: [startAM, soldAM, startPM, soldPM]}
order = []
def num(v):
    return v if isinstance(v,(int,float)) else None
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value,str) and c.column in (1,10):
                m = hdr.search(c.value)
                if not m: continue
                d,mo,y = m.groups(); date=f"{y}-{mo}-{d}"
                r0 = c.row+7; col = c.column
                offs = (0,1,2,5,6) if col==1 else (0,1,2,5,6)
                items = {}
                for r in range(r0, r0+13):
                    name = ws.cell(r,col).value
                    if not isinstance(name,str) or not name.strip(): break
                    name = name.strip()
                    sa = num(ws.cell(r,col+1).value); va = num(ws.cell(r,col+2).value)
                    sp = num(ws.cell(r,col+5).value); vp = num(ws.cell(r,col+6).value)
                    items[name]=[sa,va,sp,vp]
                if date in days: 
                    # prefer sheet with more data
                    old = sum(1 for v in days[date].values() for x in v if x not in (None,0))
                    new = sum(1 for v in items.values() for x in v if x not in (None,0))
                    if new<=old: continue
                else: order.append(date)
                days[date]=items
order.sort()
# drop template days with no starting counts at all
def has_data(items): return any(v[0] not in (None,) for v in items.values())
order=[d for d in order if has_data(days[d])]
# Names normalised
cats = {'AGUA PURA':'Agua','ORALECTRIL':'Hidratación','MONSTER':'Energizantes','C4':'Energizantes','BARRAS':'Snacks y proteína'}
def cat(n):
    for k,v in cats.items():
        if n.startswith(k): return v
names=[]
for d in order:
    for n in days[d]:
        if n not in names: names.append(n)
def pretty(n):
    return n.title().replace('Prote','Prote').replace('C4 Bebida Energetica','C4 Bebida Energética').replace('Diabetico','Diabético')
items=[{'nombre':pretty(n),'cat':cat(n),'key':n} for n in names]
moves=[]  # (date, hora, turno, item, dir, tipo, cant, nota)
run={}
for d in order:
    for n,(sa,va,sp,vp) in days[d].items():
        S = run.get(n)
        if sa is not None:
            if S is None:
                if sa>0: moves.append((d,'05:00','AM',n,'in','inicial',sa,'Inventario inicial (Excel)'))
            elif sa!=S:
                diff=sa-S
                if diff>0: moves.append((d,'05:00','AM',n,'in','compra',diff,'Ingreso detectado en Excel (existencia inicial del día mayor a la esperada)'))
                else: moves.append((d,'05:00','AM',n,'out','ajuste_menos',-diff,'Diferencia de conteo detectada en Excel'))
            S=sa
        if S is None: continue
        if va:
            moves.append((d,'12:00','AM',n,'out','venta',va,'Venta turno AM')); S-=va
        if sp is not None:
            if sp!=S:
                diff=sp-S
                if diff>0: moves.append((d,'14:00','PM',n,'in','compra',diff,'Ingreso detectado en Excel (turno PM)'))
                else: moves.append((d,'14:00','PM',n,'out','ajuste_menos',-diff,'Diferencia de conteo detectada en Excel (turno PM)'))
                S=sp
            if vp:
                moves.append((d,'20:00','PM',n,'out','venta',vp,'Venta turno PM')); S-=vp
        run[n]=S

fixed=[]
for (d,h,t,n,dr,tp,c,nt) in moves:
    if n=='AGUA PURA' and d=='2026-09-22' and tp=='ajuste_menos':
        nt='Botella entregada que se debía a Samara (no es venta) - observación del Excel'
    elif n=='MONSTER BLANCO' and d=='2026-09-22' and tp=='compra':
        nt='Ingreso de mercadería 21 y 22/09 - observación del Excel'
    elif n=='AGUA PURA' and d=='2026-09-30' and dr=='in':
        tp='ajuste_mas'; nt='Diferencia de conteo detectada en Excel (+1)'
    elif d=='2026-10-07' and tp=='compra':
        nt='Ingreso 07/10/2026 - observación del Excel'
    elif d=='2026-10-09' and tp=='compra' and n in ('MONSTER BLANCO','MONSTER PIPELINE PUNCH'):
        d='2026-10-08'; h='20:30'; t='PM'; nt='Ingreso 08/10/2026 (24 uds) - observación del Excel'
    elif d=='2026-10-15' and tp=='compra':
        nt='Ingreso de 48 botellas, presentación diferente al mismo costo - observación del Excel'
    elif d=='2026-10-27' and tp=='compra':
        nt='Ingreso 27/10/2026 de 15 Oralectril diabético - observación del Excel'
    fixed.append((d,h,t,n,dr,tp,c,nt))
moves=fixed
moves.sort(key=lambda m:(m[0],m[1]))
json.dump({'items':items,'moves':moves,'dates':[order[0],order[-1]],'ndays':len(order),'final':run}, open(out,'w'), ensure_ascii=False)
print(len(order),'días',order[0],order[-1],'| movimientos',len(moves))
from collections import Counter
print(Counter((m[5]) for m in moves))
print({k:v for k,v in run.items()})
print([m for m in moves if m[5] in ('compra','ajuste_menos')])
