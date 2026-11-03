"""Construye la carpeta public/ (lo que se publica en Netlify). Uso: python3 build.py"""
import pathlib, shutil, re
root = pathlib.Path(__file__).parent
pub = root / 'public'
lib = root / 'lib/node_modules'
(pub / 'vendor').mkdir(parents=True, exist_ok=True)
vend = {
    'chart.js': lib / 'chart.js/dist/chart.umd.js',
    'jspdf.js': lib / 'jspdf/dist/jspdf.umd.min.js',
    'autotable.js': lib / 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
    'xlsx.js': lib / 'xlsx/dist/xlsx.full.min.js',
    'supabase.js': lib / '@supabase/supabase-js/dist/umd/supabase.js',
}
for name, src in vend.items():
    shutil.copyfile(src, pub / 'vendor' / name)
app = '\n'.join(f.read_text(encoding='utf-8') for f in sorted((root / 'src').glob('0*.js')))
(pub / 'app.js').write_text(app, encoding='utf-8')
shutil.copyfile(root / 'src/style.css', pub / 'style.css')
shutil.copyfile(root / 'src/index.template.html', pub / 'index.html')
# versión del service worker = huella del contenido, para que las actualizaciones lleguen solas
import hashlib
h = hashlib.sha1()
for p in ['app.js', 'style.css', 'index.html']:
    h.update((pub / p).read_bytes())
sw = (root / 'src/sw.template.js').read_text(encoding='utf-8').replace('__VERSION__', h.hexdigest()[:10])
(pub / 'sw.js').write_text(sw, encoding='utf-8')
print('OK app.js', round(len(app) / 1024), 'KB · versión', h.hexdigest()[:10])
