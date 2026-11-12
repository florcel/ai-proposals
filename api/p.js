// Ruta /p/:id (o /a/:agencia/p/:id) → devuelve la propuesta armada (vercel.json redirige acá)
import { getPropuesta, getMarca } from '../lib/data.js';
import { renderPropuesta, render404 } from '../lib/render.js';
import { agenciaDe, baseDe } from '../lib/agencias.js';

export default async function handler(req, res) {
  const id = String(req.query?.id || '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  try {
    const { agencia, porRuta } = agenciaDe(req);
    const p = agencia ? await getPropuesta(id, agencia) : null;
    if (!p) {
      let marca = null;
      try { if (agencia) marca = await getMarca(agencia); } catch (e) { /* sin marca */ }
      res.statusCode = 404; return res.end(render404(marca));
    }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.end(renderPropuesta(p, {
      baseUrl: baseDe(req, agencia, porRuta),
      tracking: !!(agencia.trackUrl || agencia.webhookUrl),
      agencia: porRuta ? agencia.clave : ''
    }));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Error al cargar la propuesta: ' + e.message);
  }
}
