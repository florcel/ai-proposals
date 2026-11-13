# Instalación y uso

## 1. Google Sheet

1. Archivo → Importar → subí `plantilla-sheets/Plantilla propuestas AG Travel.xlsx` → **Reemplazar hoja de cálculo**. Si ya tenías el Sheet conectado, se mantienen el ID y el script.
2. Compartilo como **"Cualquier persona con el enlace" → Lector**.
3. La pestaña `LEEME` explica todas las columnas.

## 2. Apps Script (menú, eventos y carga con IA)

1. En el Sheet: **Extensiones → Apps Script**.
2. Borrá el contenido de `Código.gs` y pegá el de `apps-script/Codigo.gs`.
3. **+ → HTML**, llamalo `CargaIA` (sin `.html`) y pegá el contenido de `apps-script/CargaIA.html`. Guardá (Ctrl+S).
4. ⚙ **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**:
   - `TRACK_SECRET`: una clave inventada y larga. La misma va en Vercel.
   - `ANTHROPIC_API_KEY`: clave de la API de Claude (console.anthropic.com → API Keys). Solo hace falta para la carga con IA.
   - `PEXELS_API_KEY` (opcional): clave gratuita de pexels.com/api para buscar fotos en internet. Sin ella se usa Wikimedia Commons.
5. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. Autorizá los permisos y copiá la URL (termina en `/exec`).
6. Recargá el Sheet: aparece el menú **Propuestas**.

Cada vez que cambies `Codigo.gs`: **Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar**. La URL no cambia.

## 3. Vercel

**Settings → Environment Variables**, y después **Redeploy**.

Una sola agencia:

| Variable | Valor |
| --- | --- |
| `SHEET_ID` | ID del Google Sheet (lo que va entre `/d/` y `/edit` en la URL) |
| `BASE_URL` | Dirección del sitio, por ejemplo `https://agtravels.vercel.app` |
| `TRACK_URL` | La URL `/exec` del paso 2 |
| `TRACK_SECRET` | La misma clave que en Apps Script |
| `WHATSAPP` | Número por defecto, por ejemplo `5493511234567` |
| `LEGAJO` | Número de legajo EVyT |
| `WEBHOOK_URL` (opcional) | Webhook de n8n, para reenviar los eventos a WhatsApp o Telegram |
| `LOGO_URL` (opcional) | PNG blanco con fondo transparente |

Varias agencias: variable `AGENCIAS` (JSON). Si existe, reemplaza a `SHEET_ID`, `TRACK_URL` y `TRACK_SECRET`:

```json
{
  "agtravel": { "dominios": ["agtravels.vercel.app"], "sheetId": "1AbC…", "trackUrl": "https://script.google.com/macros/s/…/exec", "trackSecret": "clave-larga-1" },
  "viajesdelsur": { "dominios": ["propuestas.viajesdelsur.com"], "sheetId": "1XyZ…", "trackUrl": "https://script.google.com/macros/s/…/exec", "trackSecret": "clave-larga-2" }
}
```

- La clave de cada agencia va en minúsculas y sin espacios.
- Una agencia sin dominio propio usa `https://<sitio>/a/<clave>/p/<id>`.
- Cargá la variable como tipo **Secret**, porque incluye las claves.
- Después de cada cambio, abrí un link de cada agencia: un error de tipeo en el JSON deja a todas sin servicio.

**Sumar una agencia:** copiá la plantilla del Sheet → instalá el Apps Script con una `TRACK_SECRET` nueva → completá la pestaña `config` (nombre, logo, colores, WhatsApp, legajo y `base_url`) → agregala a `AGENCIAS` → Redeploy.

**Dominio propio:** Vercel → Settings → Domains → agregá `propuestas.suagencia.com`. La agencia crea un registro **CNAME** `propuestas` → `cname.vercel-dns.com`. El certificado HTTPS se genera solo.

## Uso diario

- **Con IA:** Propuestas → **Cargar propuesta con IA…** → cliente, asesor, archivo o texto → Cargar. Revisá lo que marca el resumen.
- **A mano:** fila nueva en `propuestas` → **Generar ID y link** → filas en `vuelos`, `incluye`, `coberturas` y `hoteles` con ese ID.
- **Enviar:** seleccioná la fila → **Mensaje para WhatsApp**.
- **Revisar sin registrar visitas:** **Vista interna** (agrega `?interno=1` al link).
- **Pruebas:** columna `prueba = si`, o la casilla en la carga con IA. La propuesta muestra una etiqueta y no registra aperturas.

## Pestañas de configuración

- `config`: agencia, logo, colores, ícono, WhatsApp, legajo, `base_url` y `fotos_automaticas`. La web toma los cambios en un minuto.
- `aeropuertos`: código IATA → ciudad y nombre fijo del aeropuerto.
- `asistencias`: planes con sus coberturas. La IA solo elige el plan. **Verificá los valores de ejemplo.**
- `fotos`: biblioteca por destino (tipo `portada` o `galeria`) y por hotel (tipo `hotel`, destino = nombre del hotel).

## Precios, opciones y estado

- `vence`: fecha hasta la que vale el precio. El pasajero ve una cuenta regresiva; al vencer, aparece "Pedir precio actualizado".
- Pestaña `opciones`: 2 o 3 alternativas de hotel con su precio. El pasajero elige y reserva la que quiere. `destacada = si` marca la recomendada.
- `estado`: Enviada, En conversación, Reservada o Perdida. Pasa sola a "En conversación" cuando el pasajero toca Reservar o Consultas.

## Notas

- El sistema no manda mails: las aperturas y los clics se ven en la pestaña `aperturas`.
- Fotos: sirve cualquier URL pública de imagen (.jpg, .png). Los links de Google Fotos y Drive no funcionan como imagen directa.
- La API de Claude se paga por uso. Revisá siempre los datos antes de mandar una propuesta.
- Las condiciones de la plantilla son un modelo general: adaptalas a las de la agencia.
