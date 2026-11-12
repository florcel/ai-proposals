// Carga de propuestas: desde Google Sheets (si hay SHEET_ID) o desde data/demo.json.
import { readFile } from 'node:fs/promises';
import { config } from '../config.js';

// Wikimedia ya no genera miniaturas de cualquier ancho (las de 1600px dan error): se pasan a 1920px, que sí existe
const ANCHOS_WM = new Set(['20', '40', '60', '120', '250', '330', '500', '960', '1280', '1920', '3840']);
const wm = t => t ? String(t).replace(/(upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[^\s]+?\/)(\d+)px-/g, (m, a, n) => ANCHOS_WM.has(n) ? m : a + '1920px-') : t;

// caché por Sheet: cada agencia tiene el suyo
const caches = new Map();

// agencia = { sheetId } (ver lib/agencias.js). Sin sheetId se usa data/demo.json
export async function getPropuesta(id, agencia) {
  if (!id) return null;
  const { propuestas } = await getDatos(agencia);
  return propuestas.find(p => p.id === id) || null;
}

// nombre, logo y colores de la agencia (pestaña config), para la página de inicio
export async function getMarca(agencia) {
  return (await getDatos(agencia)).marca;
}

async function getDatos(agencia) {
  const sheetId = agencia?.sheetId || '';
  const ahora = Date.now();
  const c = caches.get(sheetId);
  if (c && ahora - c.at < config.cacheSegundos * 1000) return c.data;
  const data = sheetId ? await desdeSheets(sheetId) : await desdeJson();
  caches.set(sheetId, { at: ahora, data });
  return data;
}

async function desdeJson() {
  const url = new URL('../data/demo.json', import.meta.url);
  const d = JSON.parse(await readFile(url, 'utf8'));
  return { marca: {}, propuestas: d.propuestas.map(p => ({ ...p, condiciones: d.condiciones || [] })) };
}

// ---------- Google Sheets ----------
// Pestañas: propuestas, vuelos, incluye, coberturas, hoteles, asesores, condiciones.
// vuelos/incluye/coberturas/hoteles se vinculan por propuesta_id.
// asesores se vincula por nombre (columna "asesor" de propuestas).
// condiciones es general: se muestra igual en todas las propuestas.

async function pestaña(sheetId, nombre, opcional = false) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (opcional) return [];
    throw new Error(`No pude leer la pestaña "${nombre}" (${r.status})`);
  }
  return csvAObjetos(await r.text());
}

async function desdeSheets(sheetId) {
  const [props, vuelos, incluye, coberturas, hoteles, asesores, condiciones, opciones, configFilas] = await Promise.all([
    pestaña(sheetId, 'propuestas'), pestaña(sheetId, 'vuelos'), pestaña(sheetId, 'incluye'),
    pestaña(sheetId, 'coberturas'), pestaña(sheetId, 'hoteles'),
    pestaña(sheetId, 'asesores', true), pestaña(sheetId, 'condiciones', true), pestaña(sheetId, 'opciones', true), pestaña(sheetId, 'config', true)
  ]);
  const de = (filas, id) => filas.filter(f => f.propuesta_id === id);
  // pestaña "config": clave | valor (agencia, logo_url, color_fondo, color_fondo2, color_acento, whatsapp, legajo)
  const marca = Object.fromEntries(configFilas.filter(f => f.clave).map(f => [f.clave.trim().toLowerCase(), f.valor]));
  const conds = condiciones
    .filter(c => c.texto)
    .sort((a, b) => (num(a.orden) ?? 0) - (num(b.orden) ?? 0))
    .map(c => ({ titulo: c.titulo, texto: c.texto }));

  const propuestas = props
    .filter(p => p.id && (p.activa || 'si').toLowerCase() !== 'no')
    .map(p => {
      const cob = de(coberturas, p.id);
      const as = asesores.find(a => a.nombre && a.nombre === p.asesor);
      return {
        id: p.id,
        cliente: p.cliente,
        destino: p.destino,
        fechaDesde: p.fecha_desde,
        fechaHasta: p.fecha_hasta,
        salida: p.salida,
        salidaCodigo: p.salida_codigo,
        foto: wm(p.foto),
        galeria: wm(p.galeria),
        etapa: p.etapa,
        vence: p.vence,
        equipaje: p.equipaje,
        creditos: p.creditos_fotos,
        prueba: /^(si|sí|x|true)$/i.test(String(p.prueba || '').trim()),
        marca,
        estado: p.estado,
        opciones: de(opciones, p.id).map(o => ({
          titulo: o.titulo, hotel: o.hotel, habitacion: o.habitacion, regimen: o.regimen,
          total: num(o.total), sena: num(o.sena), saldo: num(o.saldo), unidad: o.unidad, fotos: wm(o.fotos), destacada: o.destacada
        })),
        asesor: as ? { nombre: as.nombre, telefono: as.telefono, instagram: as.instagram, email: as.email } : null,
        vuelos: de(vuelos, p.id).map(v => ({ ...v, llega_dias: num(v.llega_dias) ?? 0 })),
        incluye: de(incluye, p.id).map(i => ({ icono: i.icono, texto: i.texto })),
        asistencia: cob.length ? {
          nombre: p.asistencia_nombre,
          coberturas: cob.map(c => ({ etiqueta: c.etiqueta, valor: c.valor }))
        } : null,
        hoteles: de(hoteles, p.id).map(h => ({
          ciudad: h.ciudad, nombre: h.nombre, habitacion: h.habitacion,
          regimen: h.regimen, desde: h.desde, hasta: h.hasta, fotos: wm(h.fotos)
        })),
        precio: {
          moneda: p.moneda || 'USD',
          sena: num(p.sena), saldo: num(p.saldo), total: num(p.total),
          unidad: p.unidad, nota: p.nota
        },
        condiciones: (p.mostrar_condiciones || 'si').toLowerCase() === 'no' ? [] : conds
      };
    });
  return { propuestas, marca };
}

function num(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  // acepta "2.400", "2400", "2,400.50", "2400,50", "+1"
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// CSV simple con soporte de comillas y saltos de línea dentro de celdas
export function csvAObjetos(texto) {
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  const [enc, ...resto] = filas.filter(f => f.some(x => x.trim() !== ''));
  if (!enc) return [];
  const claves = enc.map(h => h.trim().toLowerCase());
  return resto.map(f => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}
