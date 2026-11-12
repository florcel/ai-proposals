# Propuestas de viaje interactivas · AG Travel

Cada presupuesto es un link único (`agtravels.vercel.app/p/Xk3mP9aQ2rTz`) que se abre como una presentación por pantallas: portada, galería del destino, vuelos con itinerario completo, qué incluye, asistencia, hotel con fotos, precio con asesor y botón de WhatsApp, y condiciones generales. El botón PDF arma un presupuesto A4 de 2 hojas.

Además:
- **Avisos de aperturas:** cuando el cliente abre la propuesta, ve el precio, toca "Quiero reservar" o baja el PDF, queda registrado en el Sheet y el asesor recibe un mail.
- **Carga con IA:** desde el Sheet, subís el PDF o la captura de la operadora y se completan solas todas las pestañas.

## Archivos

```
api/p.js                 → página de cada propuesta (/p/:id)
api/evento.js            → recibe los avisos de la página y los pasa al Sheet
lib/render.js            → diseño (pantallas, fotos, PDF)
lib/data.js              → lee el Google Sheet
config.js                → nombre, colores y valores por defecto
apps-script/Codigo.gs    → menú del Sheet, avisos y carga con IA
apps-script/CargaIA.html → panel lateral de la carga con IA
plantilla-sheets/        → Plantilla propuestas AG Travel.xlsx
```

## 1. Google Sheet

Archivo → Importar → Subir `Plantilla propuestas AG Travel.xlsx` → **Reemplazar hoja de cálculo**. Si ya tenías el Sheet conectado, se mantienen el ID y el script. Compartilo como "Cualquier persona con el enlace" → Lector.

La pestaña `LEEME` explica todas las columnas.

## 2. Apps Script (menú, avisos e IA)

1. En el Sheet: **Extensiones → Apps Script**.
2. Borrá el contenido de `Código.gs` y pegá el de `apps-script/Codigo.gs`. Revisá que `BASE_URL` sea tu dominio.
3. **+ → HTML**, llamalo `CargaIA` (sin .html) y pegá el contenido de `apps-script/CargaIA.html`.
4. Guardá (Ctrl+S).
5. **⚙ Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**:
   - `TRACK_SECRET`: una clave inventada, larga (ej. `ag-7f3k29xq81`). La misma va en Vercel.
   - `ANTHROPIC_API_KEY`: tu clave de la API de Claude (console.anthropic.com → API Keys). Solo hace falta para la carga con IA.
   - `AVISO_EMAIL` (opcional): mail que recibe los avisos de propuestas sin asesor con email.
   - `PEXELS_API_KEY` (opcional): clave gratuita de pexels.com/api para fotos del destino de mejor calidad. Sin ella se usan fotos de Wikimedia Commons.
6. **Implementar → Nueva implementación →** tipo **Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. → Implementar → autorizá los permisos → copiá la **URL de la aplicación web** (termina en `/exec`).
7. Recargá el Sheet. Aparece el menú **Propuestas**.

Si después cambiás `Codigo.gs`: Implementar → Administrar implementaciones → ✏️ → Versión: **Nueva versión** → Implementar. La URL no cambia.

## 3. Vercel

Settings → Environment Variables. Después de cambiarlas, hacé **Redeploy**.

| Variable | Valor |
|---|---|
| `SHEET_ID` | ID del Google Sheet |
| `WHATSAPP` | número por defecto, ej. `5493511234567` |
| `BASE_URL` | `https://agtravels.vercel.app` |
| `TRACK_URL` | la URL `/exec` de la aplicación web del paso 2 |
| `TRACK_SECRET` | la misma clave que pusiste en Apps Script |
| `LEGAJO` | número de legajo EVyT |
| `WEBHOOK_URL` (opcional) | webhook de n8n, si además querés mandar los avisos por WhatsApp o Telegram |
| `LOGO_URL` (opcional) | PNG blanco con fondo transparente |

## Uso diario

**Con IA:** menú Propuestas → **Cargar propuesta con IA…** → cliente, asesor, archivo o texto → **Cargar propuesta**. Revisá las filas creadas y agregá las fotos.

**A mano:** fila nueva en `propuestas` → **Generar ID y link** → filas en vuelos, incluye, coberturas y hoteles con ese ID.

**Enviar:** seleccioná la fila → **Mensaje para WhatsApp**.



**Revisar sin generar avisos:** **Vista interna**, que agrega `?interno=1` al link.

**Fotos:** la carga con IA usa la **biblioteca** (pestaña `fotos`): por destino (tipo `portada` / `galeria`) y por hotel (tipo `hotel`, destino = nombre del hotel). Si el destino no está, la galería queda vacía para cargarla a mano. Para buscar en internet: menú → **Fotos: buscar en internet** (Pexels/Wikimedia, la IA elige las mejores y guarda el crédito del autor en `creditos_fotos`), o poné `fotos_automaticas = si` en `config`. Cuando una propuesta quedó con buenas fotos: menú → **Fotos: guardar las de la fila en la biblioteca**.

## Configuración (pestaña config) — para usar con otra agencia
`agencia`, `logo_url`, `color_fondo`, `color_fondo2`, `color_acento`, `whatsapp`, `legajo` y `base_url` se cambian en el Sheet, sin tocar código (la web los toma en ~1 minuto). `config.js` solo tiene los valores por defecto de AG Travel. Si cambiás `agencia` y no ponés `logo_url`, se muestra el nombre escrito.

## Varias agencias en un solo despliegue
Un solo proyecto de Vercel atiende a todas las agencias. Cada una tiene **su propio Sheet** (con su pestaña `config`: nombre, logo, colores, WhatsApp), **su propio Apps Script** (avisos, carga con IA) y, si quiere, **su dominio** (`propuestas.suagencia.com`).

Las agencias se cargan en la variable de entorno `AGENCIAS` de Vercel (un JSON):
```json
{
  "agtravel": { "dominios": ["agtravels.vercel.app"], "sheetId": "1AbC…", "trackUrl": "https://script.google.com/macros/s/…/exec", "trackSecret": "clave-larga-1" },
  "viajesdelsur": { "dominios": ["propuestas.viajesdelsur.com"], "sheetId": "1XyZ…", "trackUrl": "https://script.google.com/macros/s/…/exec", "trackSecret": "clave-larga-2" }
}
```
- La clave (`agtravel`, `viajesdelsur`) va en minúsculas, sin espacios.
- Una agencia sin dominio propio usa `https://<sitio>/a/<clave>/p/<id>`.
- Si no hay `AGENCIAS`, funciona como antes con `SHEET_ID`, `TRACK_URL` y `TRACK_SECRET` (una sola agencia).
- Una propuesta solo se abre en el dominio de su agencia, y los avisos van al Apps Script de esa agencia con su clave.

**Sumar una agencia nueva:**
1. Copiá la plantilla de Sheet, compartila "cualquiera con el link: lector" y anotá el ID (lo que va entre `/d/` y `/edit` en la URL).
2. En el Sheet: Extensiones → Apps Script, pegá `Codigo.gs` y `CargaIA.html`, cargá las propiedades (`TRACK_SECRET` nueva, `ANTHROPIC_API_KEY`) e implementá como Aplicación web. Anotá la URL `/exec`.
3. En la pestaña `config`: nombre, logo, colores, WhatsApp, legajo y `base_url` (su dominio o `https://<sitio>/a/<clave>`).
4. En Vercel → Settings → Environment Variables: agregá la agencia al JSON de `AGENCIAS` y hacé Redeploy.
5. Dominio propio: Vercel → Settings → Domains → Add `propuestas.suagencia.com`. La agencia crea en su proveedor de dominio un registro **CNAME** `propuestas` → `cname.vercel-dns.com`. El certificado HTTPS se genera solo.

## Datos fijos para la IA
- `aeropuertos`: código → ciudad y nombre fijo del aeropuerto.
- `asistencias`: planes con sus coberturas. La IA solo elige el plan. **Verificá los valores de ejemplo.**
- Clases (Economy, Economy Classic, Economy Basic, Business), regímenes y equipaje ("1 valija de 23 kg + carry on de 10 kg") se normalizan solos. Lo que no figura queda vacío y el resumen avisa qué revisar.

## Avisos por mail
Apagados por defecto: pestaña `config` → `avisos_mail = no`. Las aperturas, visitas y el estado se siguen registrando en el Sheet. Con `si` vuelven los mails al asesor y los recordatorios.

## Propuestas de prueba
Columna `prueba = si` (o la casilla en la carga con IA): la web muestra una etiqueta "Propuesta de prueba", y no se registran aperturas, mails ni recordatorios.

## Vencimiento, opciones y seguimiento

- **vence** (propuestas): fecha hasta la que vale el precio. El cliente ve una cuenta regresiva. Al vencer, el precio se reemplaza por "Pedir precio actualizado".
- **opciones** (pestaña): 2 o 3 alternativas de hotel o categoría con su precio. La pantalla de hotel pasa a ser "Elegí tu opción", y el cliente reserva la que elige. `destacada = si` marca la recomendada. La carga con IA las completa sola si la cotización trae varias alternativas.
- **estado** (propuestas): Enviada / En conversación / Reservada / Perdida. Pasa sola a "En conversación" cuando el cliente toca Reservar o Consultas.
- **Recordatorios:** menú Propuestas → **Activar recordatorios de seguimiento**, una sola vez. Cada hora, de 9 a 20 h, el asesor recibe un mail si el cliente abrió la propuesta hace 48 h o más y no escribió, o si el precio vence mañana. No avisa de propuestas en estado En conversación, Reservada o Perdida.
- Si tu Sheet es anterior a estas columnas: menú Propuestas → **Actualizar columnas del Sheet**. Agrega lo que falta sin tocar tus datos, y también se ejecuta solo al abrir el Sheet.

## Notas
- **Fotos:** sirve cualquier URL pública de imagen (.jpg/.png). Los links de Google Fotos y Drive no funcionan como imagen directa.
- **Avisos:** el mail de "abrió" no se repite si el cliente vuelve a entrar antes de 30 minutos (se cambia con `MINUTOS_ENTRE_AVISOS`). El de "Quiero reservar" llega siempre. Las vistas previas de WhatsApp no cuentan como visita.
- **IA:** usa la API de Claude, que se paga por uso desde console.anthropic.com. Revisá siempre los datos antes de mandar la propuesta.
- Las condiciones de la plantilla son un modelo general: adaptalas a las de la agencia.
