# EMPORIO · Logística interna

Inventario de insumos y de productos para la venta, ingresos y egresos, cierre de turno, conteo físico,
solicitudes por WhatsApp/correo y reportes (PDF, Excel, imprimir). Funciona como **PWA** (se instala en el celular o la PC)
y guarda todo en **Supabase**, así que se puede consultar desde cualquier lugar.

- **Frontend:** sitio estático (`public/`), sin compilación en el servidor. Publicado en **Netlify**.
- **Base de datos y cuentas:** el proyecto Supabase de Emporio. Todo lo nuevo usa el prefijo `inv_` (no toca las otras apps).
- **Sin internet:** cada dispositivo guarda una copia; los cambios se envían solos al volver la conexión.

## Puesta en marcha (una sola vez)

1. **Base de datos.** Supabase → *SQL Editor* → pega y ejecuta, en orden:
   `supabase/migrations/001_inventario.sql` y `supabase/migrations/002_datos_iniciales.sql` (carga el inventario del Excel).
2. **Autenticación** (Supabase → Authentication):
   - *Sign In / Providers → Email*: para empezar sin fricción, desactiva **Confirm email** (el correo gratuito solo envía ~2 por hora).
   - *URL Configuration*: en **Site URL** y **Redirect URLs** agrega la dirección de Netlify (para el correo de «olvidé mi contraseña»).
3. **Clave pública.** `public/config.js` ya trae la URL y la clave *publishable* del proyecto (Settings → API Keys). Nunca pongas la clave `service_role`.
4. **Netlify.** *Add new site → Import an existing project → GitHub → emporio-logistica*. Build command: vacío. Publish directory: `public` (ya viene en `netlify.toml`).
5. **Primer administrador.** Abre el sitio → *Crear cuenta*. Verás «Cuenta pendiente»; escribe el **código de configuración** que se entregó por separado.
   Después, cada persona crea su cuenta y el administrador la aprueba en *Usuarios y roles*.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo, incluidos usuarios y configuración |
| Supervisor | Inventario, ajustes, anular movimientos, ver costos |
| Operador / Bodega | Ingresos, egresos, cierre de turno, solicitudes. **No ve costos** ni edita el catálogo |
| Solo consulta | Tablero, inventario y reportes |

Los permisos se validan **en la base de datos** (no solo en la pantalla): un operador no puede guardar cambios al catálogo
y el servidor no le entrega costos ni precios de compra.

## Cómo está hecho

- `src/` — código de la app (se une en `public/app.js` con `python3 build.py`). Después de cambiar algo en `src/`, ejecuta `python3 build.py` y sube el cambio.
- `public/` — lo que se publica: `index.html`, `app.js`, `style.css`, `sw.js` (modo sin conexión), `manifest.webmanifest`, `config.js`, `vendor/` (librerías incluidas), `icons/`.
- `supabase/migrations/` — SQL de la base de datos (idempotente: se puede volver a ejecutar).
- `tools/` — conversión del Excel original a datos iniciales.
- Los datos se guardan en la tabla `inv_registros` (artículos, movimientos, etc.) con borrado lógico: nada se pierde. Si dos personas editan lo mismo, gana el cambio más reciente.
- Tiempo real: administradores y supervisores reciben los cambios al instante; los demás cada 20 segundos.

## Recomendaciones

- **Plan Pro de Supabase** para uso diario: el plan gratuito pausa el proyecto tras 1 semana sin uso y no incluye respaldos.
- Descarga un respaldo semanal desde *Configuración → Nube y respaldo*.
- Haz el repositorio **privado** si no quieres que sea público (Netlify funciona igual).
