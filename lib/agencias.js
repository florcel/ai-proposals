// Varias agencias en un solo despliegue.
// Cada agencia tiene su propio Google Sheet (con su pestaña config: nombre, logo, colores, WhatsApp),
// su propio Apps Script (avisos) y, si quiere, su propio dominio.
//
// Se cargan desde la variable de entorno AGENCIAS de Vercel (JSON). Ejemplo:
// {
//   "agtravel": {
//     "dominios": ["propuestas.agtravel.com.ar"],
//     "sheetId": "1AbC...",
//     "trackUrl": "https://script.google.com/macros/s/.../exec",
//     "trackSecret": "clave-larga-de-agtravel"
//   },
//   "viajesdelsur": {
//     "dominios": ["propuestas.viajesdelsur.com"],
//     "sheetId": "1XyZ...",
//     "trackUrl": "https://script.google.com/macros/s/.../exec",
//     "trackSecret": "otra-clave-larga"
//   }
// }
// Una agencia sin dominio propio usa el link https://<sitio>/a/<clave>/p/<id>.
// Si no hay AGENCIAS, funciona como antes con SHEET_ID / TRACK_URL / TRACK_SECRET (una sola agencia).
import { config } from '../config.js';

const CLAVE_OK = /^[a-z0-9][a-z0-9-]{1,40}$/;
const host = h => String(h || '').toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '').trim();

function leer() {
  const lista = {};
  let crudo = {};
  try { crudo = process.env.AGENCIAS ? JSON.parse(process.env.AGENCIAS) : {}; }
  catch (e) { console.error('AGENCIAS no es un JSON válido:', e.message); }
  for (const [k, a] of Object.entries(crudo || {})) {
    const clave = String(k).toLowerCase();
    if (!CLAVE_OK.test(clave) || !a || typeof a !== 'object') { console.error('Agencia ignorada:', k); continue; }
    lista[clave] = {
      clave,
      dominios: [].concat(a.dominios || []).map(host).filter(Boolean),
      sheetId: String(a.sheetId || ''),
      trackUrl: String(a.trackUrl || ''),
      webhookUrl: String(a.webhookUrl || ''),
      trackSecret: String(a.trackSecret || '')
    };
  }
  // la configuración de siempre (una sola agencia) queda como agencia "principal"
  const principal = (config.sheetId || !Object.keys(lista).length) ? {
    clave: 'principal',
    dominios: config.baseUrl ? [host(new URL(config.baseUrl).host)] : [],
    sheetId: config.sheetId, trackUrl: config.trackUrl, webhookUrl: config.webhookUrl, trackSecret: config.trackSecret,
    principal: true
  } : null;
  return { lista, principal };
}

const { lista: AGENCIAS, principal: PRINCIPAL } = leer();

export function agenciaPorClave(clave) {
  const k = String(clave || '').toLowerCase();
  if (!k) return null;
  if (AGENCIAS[k]) return AGENCIAS[k];
  return PRINCIPAL && k === 'principal' ? PRINCIPAL : null;
}

export function agenciaPorHost(h) {
  const x = host(h);
  return Object.values(AGENCIAS).find(a => a.dominios.includes(x)) || (PRINCIPAL && PRINCIPAL.dominios.includes(x) ? PRINCIPAL : null);
}

// Orden: /a/<clave>/... (o el campo "a" del aviso) → dominio → agencia principal
export function agenciaDe(req, claveExplicita) {
  const clave = claveExplicita ?? req.query?.a;
  if (clave) return { agencia: agenciaPorClave(clave), porRuta: true };
  const h = req.headers['x-forwarded-host'] || req.headers.host;
  const a = agenciaPorHost(h);
  if (a) return { agencia: a, porRuta: false };
  return { agencia: PRINCIPAL, porRuta: false };
}

// Dirección base de los links de esa agencia, según cómo entró el visitante
export function baseDe(req, agencia, porRuta) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const h = req.headers['x-forwarded-host'] || req.headers.host;
  const origen = agencia?.principal && config.baseUrl ? config.baseUrl.replace(/\/$/, '') : `${proto}://${h}`;
  return porRuta && agencia && !agencia.principal ? `${origen}/a/${agencia.clave}` : origen;
}

export function todasLasAgencias() {
  return [...Object.values(AGENCIAS), ...(PRINCIPAL ? [PRINCIPAL] : [])];
}
