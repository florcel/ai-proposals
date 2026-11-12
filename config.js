// Configuración de la agencia. Cada valor se puede pisar con una variable de entorno en Vercel.
export const config = {
  agencia: process.env.AGENCIA_NOMBRE || 'AG Travel',
  // Número de legajo de agencia de viajes (EVyT). Se muestra en portada y condiciones.
  legajo: process.env.LEGAJO || '',
  // Logo blanco con fondo transparente (public/logo.png). Se puede pisar con LOGO_URL.
  logoUrl: process.env.LOGO_URL || '/logo.png',
  // Número de WhatsApp en formato internacional, sin + ni espacios (ej: 5493511234567)
  whatsapp: process.env.WHATSAPP || '5493510000000',
  colores: {
    fondo: process.env.COLOR_FONDO || '#8A5A2B',      // color principal de fondo
    fondo2: process.env.COLOR_FONDO2 || '#A8743D',    // segundo tono del degradé
    acento: process.env.COLOR_ACENTO || '#F4E1C1',    // botones y precio destacado
    tarjeta: process.env.COLOR_TARJETA || 'rgba(0,0,0,.22)'
  },
  // URL pública del sitio (para links y vista previa). Ej: https://propuestas.tuagencia.com
  baseUrl: process.env.BASE_URL || '',
  // ID del Google Sheet con las propuestas. Si está vacío, se usa data/demo.json
  sheetId: process.env.SHEET_ID || '',
  // Aviso de aperturas: URL de la app web de Apps Script (y/o un webhook de n8n) y clave compartida
  trackUrl: process.env.TRACK_URL || '',
  webhookUrl: process.env.WEBHOOK_URL || '',
  trackSecret: process.env.TRACK_SECRET || '',
  // Segundos que se guardan en caché los datos del Sheet
  cacheSegundos: Number(process.env.CACHE_SEGUNDOS || 60)
};
