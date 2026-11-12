// Recibe los avisos de la página (abrió, vio el precio, tocó reservar, descargó PDF)
// y los reenvía al Apps Script del Sheet de esa agencia (trackUrl) y/o a un webhook de n8n (webhookUrl).
import { getPropuesta } from '../lib/data.js';
import { agenciaDe } from '../lib/agencias.js';

const EVENTOS = new Set(['abrio', 'vio_precio', 'reservar', 'consulta', 'pdf']);

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const partes = [];
  for await (const c of req) partes.push(c);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  try {
    const b = await leerCuerpo(req);
    const id = String(b.id || '').slice(0, 80);
    const evento = String(b.evento || '');
    if (!EVENTOS.has(evento)) { res.statusCode = 400; return res.end(); }
    // la agencia sale del campo "a" (links /a/<clave>/p/...) o del dominio
    const { agencia } = agenciaDe(req, b.a ? String(b.a).slice(0, 40) : undefined);
    if (!agencia) { res.statusCode = 404; return res.end(); }
    const p = await getPropuesta(id, agencia);
    if (!p) { res.statusCode = 404; return res.end(); }
    // Propuestas marcadas como prueba: no se registran ni generan avisos
    if (p.prueba) { res.statusCode = 204; return res.end(); }

    const ciudad = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : '';
    const datos = {
      secret: agencia.trackSecret,
      fecha: new Date().toISOString(),
      id, evento,
      cliente: p.cliente || '', destino: p.destino || '',
      asesor: p.asesor?.nombre || '', asesor_email: p.asesor?.email || '', asesor_telefono: p.asesor?.telefono || '',
      opcion: String(b.opcion || '').slice(0, 120),
      pantalla: Number(b.pantalla) || null, total: Number(b.total) || null,
      dispositivo: b.movil ? 'Celular' : 'Computadora',
      ciudad
    };
    const destinos = [agencia.trackUrl, agencia.webhookUrl].filter(Boolean);
    await Promise.allSettled(destinos.map(u => fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
      redirect: 'manual' // Apps Script responde con una redirección: el registro ya quedó hecho
    })));
    res.statusCode = 204;
    res.end();
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end();
  }
}
