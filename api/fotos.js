// Busca fotos libres en Wikimedia Commons para el script del Sheet.
// GET /api/fotos?q=Punta%20Cana%20beach&max=7[&nombre=Riu%20Republica]  (header x-secret = TRACK_SECRET)
// Se hace desde Vercel porque Wikimedia a veces rechaza los pedidos que salen de los servidores de Google.
import { todasLasAgencias } from '../lib/agencias.js';

const EXCLUIR = /\b(map|mapa|flag|bandera|escudo|coat of arms|logo|plano|diagram|catalog|catalogue|locator|svg|seal|bw|b&w|black and white|blanco y negro|monochrome|sepia|postcard|postal|historic|antigua)\b/i;
// "Eagle_Beach_Aruba_01.jpg", "_02", "_03" = la misma serie: queda una sola
const serie = t => String(t).replace(/^File:/i, '').replace(/\.[a-z]+$/i, '').replace(/[\s_\-]*\(?\d+\)?$/g, '').replace(/[\s_\-]*\(?\d+\)?$/g, '').toLowerCase();
const norm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Autor / Wikimedia Commons (CC BY-SA 4.0)" — el autor viene con HTML, se limpia
const limpiar = t => String(t || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 80);
function credito(p) {
  const m = p.imageinfo?.[0]?.extmetadata || {};
  const autor = limpiar(m.Artist?.value), lic = limpiar(m.LicenseShortName?.value);
  return [autor, 'Wikimedia Commons'].filter(Boolean).join(' / ') + (lic ? ` (${lic})` : '');
}

export async function buscarWikimedia(consulta, max = 14, nombre = '') {
  const palabras = nombre ? norm(nombre).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['hotel', 'resort', 'the', 'and', 'spa'].includes(w)) : [];
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=' + Math.min(Number(max) * 3 || 20, 50) +
    '&gsrsearch=' + encodeURIComponent(consulta + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=1920';
  const r = await fetch(url, { headers: { 'User-Agent': 'AGTravelPropuestas/1.0 (propuestas de viaje; https://agtravels.vercel.app)' } });
  if (!r.ok) throw new Error('Wikimedia respondió ' + r.status);
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => a.index - b.index);
  const vistas = new Set();
  return pages.filter(p => {
    const k = serie(p.title);
    if (vistas.has(k)) return false;
    const ii = (p.imageinfo || [])[0];
    if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) return false;
    const ratio = ii.width / ii.height;
    if (ii.width < 1200 || ratio < 1.2 || ratio > 2.2) return false;
    if (EXCLUIR.test(p.title)) return false;
    const ok = palabras.length ? palabras.every(w => norm(p.title).includes(w)) : true;
    if (ok) vistas.add(k);
    return ok;
  }).map(p => ({ url: p.imageinfo[0].thumburl, credito: credito(p) })).slice(0, Number(max) || 14);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // sirve a cualquier agencia del despliegue: alcanza con la clave (trackSecret) de una de ellas
  const claves = todasLasAgencias().map(a => a.trackSecret).filter(Boolean);
  if (claves.length && !claves.includes(String(req.headers['x-secret'] || ''))) {
    res.statusCode = 401; return res.end(JSON.stringify({ error: 'clave' }));
  }
  const q = String(req.query?.q || '').slice(0, 120);
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'falta q' })); }
  try {
    const fotos = await buscarWikimedia(q, req.query.max, req.query.nombre || '');
    res.end(JSON.stringify({ fotos }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e.message }));
  }
}
