// Página de inicio (/ y /a/:agencia): muestra el logo o el nombre de la agencia según el dominio
import { getMarca } from '../lib/data.js';
import { renderInicio } from '../lib/render.js';
import { agenciaDe } from '../lib/agencias.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  let marca = null;
  try {
    const { agencia } = agenciaDe(req);
    if (agencia) marca = await getMarca(agencia);
  } catch (e) { console.error(e); }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.end(renderInicio(marca));
}
