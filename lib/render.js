// Arma el HTML completo de una propuesta (todo del lado del servidor, con las etiquetas
// de vista previa para WhatsApp/redes ya resueltas).
import { config as CONFIG } from '../config.js';
import qrcode from './qrcode.js';

const WA_SVG = (t = 22) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>`;

// Código QR en SVG (solo caracteres ASCII: usar URLs ya codificadas)
function qrSvg(texto) {
  try { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q.createSvgTag(3, 0); } catch { return ''; }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Acepta 2027-03-04 o 04/03/2027
function fecha(s) {
  if (!s) return null;
  let m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const masDias = (d, n) => new Date(d.getTime() + n * 86400000);
const diaCorto = d => d ? `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}` : '';
const diaLargo = d => d ? `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` : '';
const minutos = h => { const m = String(h || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const duracion = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;

// Agrupa los segmentos de vuelo por tramo (Ida, Vuelta, Interno...) y calcula escalas y esperas
function armarTramos(vuelos = []) {
  const orden = [], grupos = {};
  for (const v of vuelos) {
    const k = v.tramo || 'Vuelo';
    if (!grupos[k]) { grupos[k] = []; orden.push(k); }
    grupos[k].push(v);
  }
  return orden.map(k => {
    const segs = grupos[k];
    const esperas = [];
    for (let i = 0; i < segs.length - 1; i++) {
      const a = minutos(segs[i].llega_hora), b = minutos(segs[i + 1].sale_hora);
      let w = (a !== null && b !== null) ? b - a : null;
      if (w !== null && w < 0) w += 1440;
      esperas.push({ ciudad: segs[i].llega_ciudad, codigo: segs[i].llega_codigo, min: w });
    }
    const f0 = fecha(segs[0].fecha), fl = fecha(segs[segs.length - 1].fecha);
    const ult = segs[segs.length - 1];
    const fLlega = fl ? masDias(fl, Number(ult.llega_dias) || 0) : null;
    return {
      tramo: k, segs, esperas,
      origen: segs[0].sale_ciudad, destino: ult.llega_ciudad,
      salida: [diaCorto(f0), segs[0].sale_hora].filter(Boolean).join(' · '),
      llegada: [diaCorto(fLlega), ult.llega_hora].filter(Boolean).join(' · '),
      escalas: segs.length - 1,
      resumen: esperas.length
        ? esperas.map(e => `Escala en ${e.ciudad}${e.min !== null ? ' · ' + duracion(e.min) : ''}`).join(' / ')
        : 'Vuelo directo'
    };
  });
}

// Lista de URLs de fotos separadas por coma, espacio o salto de línea
const listaFotos = v => (Array.isArray(v) ? v : String(v || '').split(/\s+|,(?=\s*(?:https?:|data:))/)).map(x => String(x).trim()).filter(x => /^(https?:|data:image)/.test(x));
const fotoAttr = (url, grupo, k, cls = '') => `<button type="button" class="ft ${cls}" data-g="${grupo}" data-k="${k}" data-u="${esc(url)}" data-bg="${esc(url)}" aria-label="Ver foto"></button>`;

const noches = (a, b) => (a && b) ? Math.round((b - a) / 86400000) : null;
const mesCorto = d => MESES[d.getUTCMonth()].slice(0, 3);

function rangoFechas(a, b) {
  if (!a || !b) return { grande: '', chico: '' };
  if (a.getUTCMonth() === b.getUTCMonth())
    return { grande: `${a.getUTCDate()} al ${b.getUTCDate()}`, chico: `de ${MESES[a.getUTCMonth()]}` };
  return { grande: `${a.getUTCDate()} ${mesCorto(a)} al ${b.getUTCDate()} ${mesCorto(b)}`, chico: '' };
}

function dinero(moneda, n) {
  if (n === null || n === undefined) return '';
  const tieneDecimales = Math.round(n) !== n;
  return `${moneda} ${n.toLocaleString('es-AR', { minimumFractionDigits: tieneDecimales ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const ICONOS = {
  valija: '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M5 12h14M9 20v1M15 20v1"/>',
  avion: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v8M8 12h8"/>',
  bus: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 11h18M7 17v3M17 17v3"/><circle cx="7.5" cy="14" r=".8"/><circle cx="16.5" cy="14" r=".8"/>',
  hotel: '<path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01M8 13h.01M16 13h.01"/>',
  comida: '<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v8a3 3 0 0 1-3 3"/><path d="M18 21V3c-2 1-3 4-3 7v4h3"/>',
  excursion: '<path d="m3 20 6-11 4 7 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
  auto: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
  barco: '<path d="M3 17l2 3h14l2-3H3zM12 3v11M12 4l6 9H12"/>',
  check: '<path d="m5 12 5 5L20 7"/>'
};
const icono = (n, size = 26) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ICONOS.check}</svg>`;

// La pestaña "config" del Sheet pisa los valores de config.js (nombre, logo, colores, WhatsApp, legajo)
const COLOR_OK = v => /^#[0-9a-f]{3,8}$/i.test(String(v || '').trim());
function mezclarMarca(base, m = {}) {
  const v = k => String(m[k] ?? '').trim();
  return {
    ...base,
    agencia: v('agencia') || base.agencia,
    // logo propio de la pestaña config; si otra agencia cambia el nombre sin poner logo, se muestra su nombre escrito
    logoUrl: /^(https:\/\/|\/)[^\s"'<>()]+$/.test(v('logo_url')) ? v('logo_url') : (v('agencia') && v('agencia') !== base.agencia ? '' : base.logoUrl),
    // ícono de la pestaña del navegador: el de config, el del sitio (solo la agencia original) o ninguno
    faviconUrl: /^(https:\/\/|\/)[^\s"'<>()]+$/.test(v('favicon_url')) ? v('favicon_url') : (v('agencia') && v('agencia') !== base.agencia ? '' : '/favicon-32.png'),
    whatsapp: v('whatsapp').replace(/\D/g, '') || base.whatsapp,
    legajo: v('legajo') || base.legajo,
    colores: {
      ...base.colores,
      fondo: COLOR_OK(v('color_fondo')) ? v('color_fondo') : base.colores.fondo,
      fondo2: COLOR_OK(v('color_fondo2')) ? v('color_fondo2') : base.colores.fondo2,
      acento: COLOR_OK(v('color_acento')) ? v('color_acento') : base.colores.acento
    }
  };
}

export function renderPropuesta(p, { baseUrl = CONFIG.baseUrl, tracking = CONFIG.trackUrl || CONFIG.webhookUrl, agencia = '' } = {}) {
  const config = mezclarMarca(CONFIG, p.marca);
  const c = config.colores;
  const desde = fecha(p.fechaDesde), hasta = fecha(p.fechaHasta);
  const n = noches(desde, hasta);
  const rango = rangoFechas(desde, hasta);
  const mesAnio = desde ? `${MESES[desde.getUTCMonth()]} ${desde.getUTCFullYear()}` : '';
  const pr = p.precio || {};
  const moneda = pr.moneda || 'USD';
  const total = pr.total ?? ((pr.sena ?? 0) + (pr.saldo ?? 0) || null);
  const fechasTexto = desde && hasta ? `Del ${rango.grande} ${rango.chico}`.trim() + ` de ${hasta.getUTCFullYear()}` : '';

  // Vencimiento del precio (fin del día, hora Argentina)
  const fv = fecha(p.vence);
  const venceMs = fv ? fv.getTime() + (23 * 3600 + 59 * 60 + 59) * 1000 + 3 * 3600 * 1000 : null;
  const vencida = venceMs !== null && Date.now() > venceMs;
  const venceTexto = fv ? `${fv.getUTCDate()}/${fv.getUTCMonth() + 1}` : '';

  // Opciones para elegir (hotel/categoría con su precio)
  const ops = (p.opciones || []).filter(o => o && (o.hotel || o.titulo)).map((o, k) => {
    const t = o.total ?? (((o.sena ?? 0) + (o.saldo ?? 0)) || null);
    const tituloLimpio = /^\s*(opci[oó]n|option)\s*\d*\s*$/i.test(String(o.titulo || '')) ? '' : String(o.titulo || '').trim();
    return { ...o, titulo: tituloLimpio, k, total: t, unidad: o.unidad || pr.unidad || '', conSena: o.sena != null && o.saldo != null };
  });
  const hayOps = ops.length > 0;
  const opSel = -1; // ninguna opción viene elegida: la marca el cliente
  const minOp = hayOps ? ops.filter(o => o.total).sort((a, b) => a.total - b.total)[0] : null;

  const titulo = `${p.destino} · Propuesta para ${p.cliente} · ${config.agencia}`;
  const descripcion = [fechasTexto, `De ${config.agencia}.`, pr.nota].filter(Boolean).join('. ').replace(/\.\./g, '.');
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/p/${p.id}` : '';

  const wa = (p.asesor?.telefono || p.whatsapp || config.whatsapp || '').replace(/\D/g, '');
  const waTexto = `¡Hola! Quiero reservar ${p.destino}${fechasTexto ? ' (' + fechasTexto.toLowerCase() + ')' : ''}. Propuesta: ${p.id}`;
  const waLink = `https://wa.me/${wa}?text=${encodeURIComponent(waTexto)}`;
  const waConsulta = `https://wa.me/${wa}?text=${encodeURIComponent(`¡Hola! Tengo una consulta sobre la propuesta de ${p.destino} (${p.id}).`)}`;
  const waActualizar = `https://wa.me/${wa}?text=${encodeURIComponent(`¡Hola! La propuesta de ${p.destino} (${p.id}) venció. ¿Me pasás el precio actualizado?`)}`;
  const waOpcion = o => `https://wa.me/${wa}?text=${encodeURIComponent(`¡Hola! Quiero reservar ${p.destino}${fechasTexto ? ' (' + fechasTexto.toLowerCase() + ')' : ''}, opción ${o.k + 1}: ${o.titulo || o.hotel}${o.titulo && o.hotel ? ' – ' + o.hotel : ''}${o.regimen ? ' (' + o.regimen + ')' : ''}${o.total ? ' – ' + dinero(moneda, o.total) : ''}. Propuesta: ${p.id}`)}`;
  const linkReservar = vencida ? waActualizar : hayOps ? '#elegir-opcion' : waLink;

  const logo = config.logoUrl
    ? `<img class="logo-img" src="${esc(config.logoUrl)}" alt="${esc(config.agencia)}">`
    : `<span class="logo-txt">${esc(config.agencia)}</span>`;

  // Resumen de una línea para la portada: "Aéreo + hotel all inclusive · USD 4.090 por familia"
  const h0 = (p.hoteles || [])[0];
  // "all inclusive" / "con desayuno" / "con media pensión"
  const regTxt = r => { const t = String(r || '').trim().toLowerCase(); return !t ? '' : /all inclusive|todo incluido/.test(t) ? 'all inclusive' : /^(con|sin) /.test(t) ? t : 'con ' + t; };
  const regsOps = [...new Set((p.opciones || []).map(o => regTxt(o.regimen)).filter(Boolean))];
  const hotelTxt = (p.opciones || []).length ? `hotel${regsOps.length ? ' ' + regsOps.join(' o ') : ''}` : h0 ? `hotel${h0.regimen ? ' ' + regTxt(h0.regimen) : ''}` : '';
  const servicios = [p.vuelos?.length ? 'aéreo' : '', hotelTxt].filter(Boolean).join(' + ');
  const partesResumen = [
    servicios ? esc(servicios.charAt(0).toUpperCase() + servicios.slice(1)) : '',
    vencida ? '' : hayOps && minOp ? `${ops.length} opciones desde <b>${dinero(moneda, minOp.total)}</b> ${esc(minOp.unidad)}`.trim()
      : total ? `<b>${dinero(moneda, total)}</b> ${esc(pr.unidad || '')}`.trim() : ''
  ].filter(Boolean);
  const resumenPortada = partesResumen.join(' · ');

  const slides = [];

  // 1. Portada
  slides.push(`
  <section class="slide portada" data-nav="Inicio">
    <div class="portada-txt">
      <div class="logo">${logo}${config.legajo ? `<span class="legajo">Legajo ${esc(config.legajo)}</span>` : ''}</div>
      <div class="kicker saludo">${p.cliente ? `Hola ${esc(p.cliente)}, este es tu viaje` : 'Tu viaje'}${mesAnio ? ' · ' + esc(mesAnio) : ''}</div>
      <h1>${esc(p.destino)}</h1>
      <hr>
      <dl class="datos">
        ${n !== null ? `<dt>Duración</dt><dd><b>${n + 1} días</b> ${n} noches</dd>` : ''}
        ${rango.grande ? `<dt>Fechas</dt><dd><b>${esc(rango.grande)}</b> ${esc(rango.chico)}</dd>` : ''}
        ${p.salida ? `<dt>Salida</dt><dd><b>${esc(p.salida)}</b> ${esc(p.salidaCodigo || '')}</dd>` : ''}
      </dl>
      ${resumenPortada ? `<p class="resumen">${resumenPortada}</p>` : ''}
      ${fv && !vencida ? `<p class="vence-chip" data-vence="${venceMs}" data-txt="${venceTexto}">Precio válido hasta el ${venceTexto}</p>` : ''}
      <button type="button" class="ver-viaje" data-sig>Ver mi viaje <span aria-hidden="true">→</span></button>
    </div>
    <div class="portada-foto" ${p.foto ? `style="background-image:url('${esc(p.foto)}')"` : ''}></div>
  </section>`);

  // Créditos de las fotos (columna creditos_fotos): una línea por foto, se muestran sin repetir
  const creditos = [...new Set(String(p.creditos || '').split(/\n+/).map(x => x.trim()).filter(Boolean))].join(' · ');

  // 1b. Galería del destino
  const galeria = listaFotos(p.galeria);
  const fotosJs = {};
  if (galeria.length) {
    fotosJs.destino = galeria;
    slides.push(`
  <section class="slide galeria-slide" data-nav="Destino">
    <header><div class="kicker">Tu destino</div><h2>${esc(p.destino)}</h2></header>
    <div class="mosaico n${Math.min(galeria.length, 5)}">${galeria.slice(0, 5).map((u, k) => fotoAttr(u, 'destino', k, k === 4 && galeria.length > 5 ? 'mas" data-mas="+' + (galeria.length - 5) : '')).join('')}</div>
    ${creditos ? `<p class="creditos">Fotos: ${esc(creditos)}</p>` : ''}
  </section>`);
  }

  // 2. Vuelos
  const tramos = armarTramos(p.vuelos);
  if (tramos.length) slides.push(`
  <section class="slide dos-col" data-nav="Vuelos">
    <header><div class="kicker">Cómo llegás</div><h2>Tus vuelos</h2></header>
    <div class="lista">
      ${tramos.map(t => `
      <article class="card vuelo">
        <div class="tramo">${esc(t.tramo)}</div>
        <div class="ruta">
          <div><b>${esc(t.origen)}</b><small>${esc(t.salida)}</small></div>
          <div class="avion">${icono('avion', 22)}<small>${t.escalas ? `${t.escalas} escala${t.escalas > 1 ? 's' : ''}` : 'Directo'}</small></div>
          <div class="der"><b>${esc(t.destino)}</b><small>${esc(t.llegada)}</small></div>
        </div>
        <div class="detalle">◷ ${esc(t.resumen)}</div>
        <details class="segs"><summary>Ver itinerario completo</summary>
          ${t.segs.map((v, i) => {
            const f = fecha(v.fecha), extra = Number(v.llega_dias) || 0;
            return `
          <div class="seg">
            <div class="seg-pt"><b>${esc(v.sale_hora)}</b><span>${esc(v.sale_ciudad)}${v.sale_codigo ? ' · ' + esc(v.sale_codigo) : ''}</span><small>${esc(v.sale_aeropuerto || '')}</small></div>
            <div class="seg-fl">→</div>
            <div class="seg-pt"><b>${esc(v.llega_hora)}${extra ? ` <em>+${extra} día${extra > 1 ? 's' : ''}</em>` : ''}</b><span>${esc(v.llega_ciudad)}${v.llega_codigo ? ' · ' + esc(v.llega_codigo) : ''}</span><small>${esc(v.llega_aeropuerto || '')}</small></div>
            <div class="seg-info"><b>${esc(v.vuelo || '')}</b><small>${f ? 'Sale el ' + diaLargo(f) : ''}</small><small>${esc(v.clase || '')}</small></div>
          </div>
          ${t.esperas[i] ? `<div class="espera">◷ Espera de ${t.esperas[i].min !== null ? duracion(t.esperas[i].min) : ''} en ${esc(t.esperas[i].ciudad)}${t.esperas[i].codigo ? ' (' + esc(t.esperas[i].codigo) + ')' : ''}</div>` : ''}`;
          }).join('')}
        </details>
      </article>`).join('')}
      ${p.equipaje ? `<p class="equipaje">${icono('valija', 20)}<span><b>Equipaje:</b> ${esc(p.equipaje)}</span></p>` : ''}
    </div>
  </section>`);

  // 3. Incluye
  if (p.incluye?.length) slides.push(`
  <section class="slide" data-nav="Incluye">
    <header><div class="kicker">Tu paquete</div><h2>El servicio incluye</h2></header>
    <ul class="incluye">
      ${p.incluye.map(i => `<li>${icono(i.icono)}<span>${esc(i.texto)}</span></li>`).join('')}
    </ul>
  </section>`);

  // 4. Asistencia
  const cob = p.asistencia?.coberturas || [];
  if (cob.length) slides.push(`
  <section class="slide" data-nav="Asistencia">
    <header><div class="kicker">Asistencia al viajero</div><h2>${esc(p.asistencia.nombre || 'Coberturas')}</h2></header>
    <dl class="grilla">${cob.slice(0, 6).map(x => `<div><dt>${esc(x.etiqueta)}</dt><dd>${esc(x.valor)}</dd></div>`).join('')}</dl>
    ${cob.length > 6 ? `<details><summary>Ver todas las coberturas</summary>
      <dl class="grilla">${cob.slice(6).map(x => `<div><dt>${esc(x.etiqueta)}</dt><dd>${esc(x.valor)}</dd></div>`).join('')}</dl></details>` : ''}
  </section>`);

  // 5. Opciones para elegir (reemplaza a la pantalla de hotel)
  const fotosOp = o => listaFotos(o.fotos);
  if (hayOps) slides.push(`
  <section class="slide opciones-slide" data-nav="Opciones">
    <header><div class="kicker">Hospedaje</div><h2>Elegí tu opción</h2><p class="sub">${ops.length} alternativas para el mismo viaje. Hotel previsto, o similar de la misma categoría.</p></header>
    <div class="ops n${Math.min(ops.length, 3)}">
      ${ops.map(o => {
        const fo = fotosOp(o);
        if (fo.length) fotosJs['o' + o.k] = fo;
        return `
      <article class="card op${o.k === opSel ? ' sel' : ''}${fo.length ? ' con-fotos' : ''}" data-op="${o.k}">
        ${String(o.destacada || '').toLowerCase() === 'si' ? '<span class="op-badge">Recomendada</span>' : ''}
        ${fo.length ? `<div class="op-fotos">${fo.slice(0, 3).map((u, k) => fotoAttr(u, 'o' + o.k, k, k === 2 && fo.length > 3 ? 'mas" data-mas="+' + (fo.length - 3) : '')).join('')}</div>` : ''}
        <div class="op-cuerpo">
          <div class="tramo">Opción ${o.k + 1}${o.titulo ? ' · ' + esc(o.titulo) : ''}</div>
          <h3>${esc(o.hotel || o.titulo)}</h3>
          <div class="hab">${[o.habitacion, n !== null ? n + ' noches' : ''].filter(Boolean).map(esc).join(' · ')}</div>
          ${o.regimen ? `<span class="chip">${esc(o.regimen)}</span>` : ''}
          ${o.total ? `<div class="op-precio precio-dato"><b>${dinero(moneda, o.total)}</b><span>${esc(o.unidad)}</span></div>` : ''}
          ${o.conSena ? `<div class="op-ss precio-dato">Seña ${dinero(moneda, o.sena)} · Saldo ${dinero(moneda, o.saldo)}</div>` : ''}
          <button type="button" class="elegir" data-op="${o.k}">Elegir esta opción</button>
        </div>
      </article>`;
      }).join('')}
    </div>
  </section>`);

  // 5b. Hoteles (cuando no hay opciones)
  if (!hayOps && p.hoteles?.length) slides.push(`
  <section class="slide dos-col" data-nav="Hotel">
    <header><div class="kicker">Hospedaje</div><h2>Dónde te quedás</h2><p class="sub">Previsto, o similar de la misma categoría.</p></header>
    <div class="lista">
      ${p.hoteles.map((h, hi) => {
        const a = fecha(h.desde), b = fecha(h.hasta), nh = noches(a, b);
        const fh = listaFotos(h.fotos);
        if (fh.length) fotosJs['h' + hi] = fh;
        return `
      <article class="card hotel${fh.length ? ' con-fotos' : ''}">
        ${fh.length ? `<div class="hotel-fotos">${fh.slice(0, 3).map((u, k) => fotoAttr(u, 'h' + hi, k, k === 2 && fh.length > 3 ? 'mas" data-mas="+' + (fh.length - 3) : '')).join('')}</div>` : ''}
        <div class="hotel-row"><div class="hotel-txt">
          <div class="tramo">${esc(h.ciudad)}</div>
          <h3>${esc(h.nombre)}</h3>
          <div class="hab">${esc(h.habitacion)}</div>
          ${h.regimen ? `<span class="chip">${esc(h.regimen)}</span>` : ''}
        </div>
        ${nh !== null ? `<div class="noches"><b>${nh}</b><span>noches</span><small>${a.getUTCDate()} ${mesCorto(a)} a ${b.getUTCDate()} ${mesCorto(b)}</small></div>` : ''}</div>
      </article>`;
      }).join('')}
    </div>
  </section>`);

  // 6. Cierre y precio
  const conSena = pr.sena !== null && pr.sena !== undefined && pr.saldo !== null && pr.saldo !== undefined;
  slides.push(`
  <section class="slide cierre${p.foto ? ' con-foto' : ''}" data-nav="Precio"${p.foto ? ` style="--foto:url('${esc(p.foto)}')"` : ''}>
    <div class="logo top">${logo}</div>
    <div class="cierre-txt">
      ${p.etapa ? `<div class="kicker">${esc(p.etapa)}</div>` : ''}
      <h2>¿Nos vamos a ${esc(p.destino)}?</h2>
      ${pr.nota ? `<p class="sub">${esc(pr.nota)}</p>` : ''}
      ${fv && !vencida ? `<p class="vence" data-vence="${venceMs}" data-txt="${venceTexto}">⏳ Precio válido hasta el ${venceTexto}</p>` : ''}
      <a class="cta" id="reservar" href="${esc(linkReservar)}" target="_blank" rel="noopener">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>
        ${vencida ? 'Pedir precio actualizado' : hayOps ? `<span class="cta-txt">Elegí una opción para reservar</span>` : 'Quiero reservar'}
      </a>
      ${p.asesor?.nombre ? `
      <div class="asesor">
        <div class="tramo">Tu asesor de viajes</div>
        <b>${esc(p.asesor.nombre)}</b>
        <div class="asesor-datos">
          ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">+${esc(wa)}</a>` : ''}
          ${p.asesor.instagram ? `<a href="https://instagram.com/${esc(String(p.asesor.instagram).replace(/^@/, ''))}" target="_blank" rel="noopener">@${esc(String(p.asesor.instagram).replace(/^@/, ''))}</a>` : ''}
          ${p.asesor.email ? `<a href="mailto:${esc(p.asesor.email)}">${esc(p.asesor.email)}</a>` : ''}
        </div>
      </div>` : (wa ? `<p class="wa-num">o escribinos al +${esc(wa)}</p>` : '')}
      ${p.condiciones?.length ? `<button type="button" class="link-cond" data-ir="ultima">Ver condiciones generales →</button>` : ''}
    </div>
    <div class="precios">
      ${vencida ? `
        <div class="precio claro vencido"><span>Esta tarifa venció el ${venceTexto}</span><b>Precio a actualizar</b><small>Las tarifas aéreas y hoteleras cambian todos los días. Escribinos y te pasamos el precio de hoy.</small></div>`
      : hayOps ? `
        <div class="op-lista">${ops.map(o => `
          <button type="button" class="op-item${o.k === opSel ? ' sel' : ''}" data-op="${o.k}" data-wa="${esc(waOpcion(o))}" data-total="${o.total ? esc(dinero(moneda, o.total)) : ''}" data-unidad="${esc(o.unidad)}" data-reg="${esc(o.regimen || '')}" data-ss="${o.conSena ? esc(`Seña ${dinero(moneda, o.sena)} · Saldo ${dinero(moneda, o.saldo)}`) : ''}" data-nom="${esc(`Opción ${o.k + 1}: ${o.titulo || o.hotel}`)}">
            <span class="op-radio"></span><span class="op-nom"><small>Opción ${o.k + 1}${o.titulo ? ' · ' + esc(o.titulo) : ''}</small>${esc(o.hotel || o.titulo)}${o.regimen ? `<em class="op-reg">${esc(o.regimen)}</em>` : ''}</span><b>${o.total ? dinero(moneda, o.total) : ''}</b>
          </button>`).join('')}
        </div>
        <p class="total" id="op-ss">Tocá una opción para ver la seña y el saldo.</p>`
      : conSena ? `
        <div class="precio acento"><span>Seña ${esc(pr.unidad || '')}</span><b>${dinero(moneda, pr.sena)}</b></div>
        <div class="precio claro"><span>Y el saldo de</span><b>${dinero(moneda, pr.saldo)}</b></div>
        <p class="total">Tarifa final ${esc(pr.unidad || '')}: <b>${dinero(moneda, total)}</b>.</p>`
      : total ? `
        <div class="precio acento"><span>Precio final ${esc(pr.unidad || '')}</span><b>${dinero(moneda, total)}</b></div>` : ''}
    </div>
  </section>`);

  // 7. Condiciones generales
  const conds = p.condiciones || [];
  if (conds.length) {
    const intro = conds.filter(c => !c.titulo), items = conds.filter(c => c.titulo);
    slides.push(`
  <section class="slide condiciones" data-nav="Condiciones">
    <header><div class="kicker">${esc(config.agencia)}${config.legajo ? ' · Legajo ' + esc(config.legajo) : ''}</div><h2>Condiciones generales</h2></header>
    ${intro.map(c => `<p class="cond-intro">${esc(c.texto)}</p>`).join('')}
    <div class="cond-lista">
      ${items.map((c, i) => `<details><summary>${i + 1}. ${esc(c.titulo)}</summary><p>${esc(c.texto).replace(/\n/g, '<br>')}</p></details>`).join('')}
    </div>
  </section>`);
  }

  // ---------- Versión para imprimir / PDF (documento A4 vertical) ----------
  const docSeccion = (titulo, cuerpo) => `<section class="d-sec"><h3 class="d-h">${titulo}</h3>${cuerpo}</section>`;
  const docPartes = [];
  if (p.incluye?.length) docPartes.push(docSeccion('El servicio incluye',
    `<ul class="d-inc">${p.incluye.map(i => `<li>${icono(i.icono, 16)}<span>${esc(i.texto)}</span></li>`).join('')}</ul>`));
  if (tramos.length) docPartes.push(docSeccion('Itinerario de vuelo', tramos.map(t => `
    <div class="d-tramo">
      <div class="d-tramo-h"><div><b>${esc(t.tramo)}</b> · ${esc(t.origen)} → ${esc(t.destino)}</div><span>${t.escalas ? `${t.escalas} escala${t.escalas > 1 ? 's' : ''}` : 'Vuelo directo'}</span></div>
      ${t.segs.map((v, i) => {
        const f = fecha(v.fecha), extra = Number(v.llega_dias) || 0, e = t.esperas[i];
        return `
      <div class="d-seg">
        <div><b>${esc(v.sale_hora)}</b><span>${esc(v.sale_ciudad)}${v.sale_codigo ? ' · ' + esc(v.sale_codigo) : ''}</span><small>${esc(v.sale_aeropuerto || '')}</small></div>
        <div class="d-fl">→</div>
        <div><b>${esc(v.llega_hora)}${extra ? ` <em>+${extra} día${extra > 1 ? 's' : ''}</em>` : ''}</b><span>${esc(v.llega_ciudad)}${v.llega_codigo ? ' · ' + esc(v.llega_codigo) : ''}</span><small>${esc(v.llega_aeropuerto || '')}</small></div>
        <div class="d-info"><b>${esc(v.vuelo || '')}</b><small>${f ? 'Sale el ' + diaLargo(f) : ''}</small><small>${esc(v.clase || '')}</small></div>
      </div>
      ${e ? `<div class="d-esp">Espera de ${e.min !== null ? duracion(e.min) : ''} en ${esc(e.ciudad)}${e.codigo ? ' (' + esc(e.codigo) + ')' : ''}</div>` : ''}`;
      }).join('')}
    </div>`).join('') + (p.equipaje ? `<p class="d-nota"><b>Equipaje:</b> ${esc(p.equipaje)}</p>` : '')));
  if (hayOps) docPartes.push(docSeccion('Opciones de alojamiento', ops.map(o => {
    const fo = fotosOp(o).slice(0, 2);
    return `<div class="d-hotel">${fo.length ? `<div class="d-hfotos">${fo.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}<div class="d-htxt"><small>Opción ${o.k + 1}${o.titulo ? ' · ' + esc(o.titulo) : ''}</small><b>${esc(o.hotel || o.titulo)}</b><span>${[o.habitacion, o.regimen, n !== null ? n + ' noches' : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
      ${o.total && !vencida ? `<div class="d-noches"><b>${dinero(moneda, o.total)}</b><small>${esc(o.unidad)}${o.conSena ? `<br>Seña ${dinero(moneda, o.sena)} · Saldo ${dinero(moneda, o.saldo)}` : ''}</small></div>` : ''}</div>`;
  }).join('') + '<p class="d-nota">Hoteles previstos, o similares de la misma categoría.</p>'));
  if (!hayOps && p.hoteles?.length) docPartes.push(docSeccion('Alojamiento', p.hoteles.map(h => {
    const a = fecha(h.desde), b = fecha(h.hasta), nh = noches(a, b);
    const fh = listaFotos(h.fotos).slice(0, 3);
    return `<div class="d-hotel">${fh.length ? `<div class="d-hfotos">${fh.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}<div class="d-htxt"><small>${esc(h.ciudad)}</small><b>${esc(h.nombre)}</b><span>${[h.habitacion, h.regimen].filter(Boolean).map(esc).join(' · ')}</span></div>
      ${nh !== null ? `<div class="d-noches"><b>${nh}</b> noches<small>${a.getUTCDate()} ${mesCorto(a)} al ${b.getUTCDate()} ${mesCorto(b)}</small></div>` : ''}</div>`;
  }).join('') + '<p class="d-nota">Hotel previsto, o similar de la misma categoría.</p>'));
  const docPrecio = `
    <section class="d-sec d-precio-wrap">
      <div class="d-precio">
        <h3 class="d-h">Precio</h3>
        ${vencida ? `<div class="d-total"><span>Tarifa vencida el ${venceTexto}</span><b>A actualizar</b></div>`
          : hayOps && minOp ? `<div class="d-total"><span>${ops.length} opciones desde</span><b>${dinero(moneda, minOp.total)}</b></div><p class="d-nota">El precio de cada opción está en "Opciones de alojamiento".</p>`
          : total ? `<div class="d-total"><span>Tarifa final ${esc(pr.unidad || '')}</span><b>${dinero(moneda, total)}</b></div>` : ''}
        ${fv && !vencida ? `<p class="d-vence">Precio válido hasta el ${venceTexto}/${fv.getUTCFullYear()}</p>` : ''}
        ${!vencida && !hayOps && conSena ? `<div class="d-ss"><div><span>Seña</span><b>${dinero(moneda, pr.sena)}</b></div><div><span>Saldo</span><b>${dinero(moneda, pr.saldo)}</b></div></div>` : ''}
        ${pr.nota ? `<p class="d-nota">${esc(pr.nota)}</p>` : ''}
      </div>
      <div class="d-asesor">
        <h3 class="d-h">Tu asesor de viajes</h3>
        ${p.asesor?.nombre ? `<b>${esc(p.asesor.nombre)}</b>` : `<b>${esc(config.agencia)}</b>`}
        ${wa ? `<a class="d-wa" href="${esc(waConsulta)}">WhatsApp +${esc(wa)}</a>` : ''}
        ${p.asesor?.instagram ? `<span>Instagram @${esc(String(p.asesor.instagram).replace(/^@/, ''))}</span>` : ''}
        ${p.asesor?.email ? `<span>${esc(p.asesor.email)}</span>` : ''}
        ${url ? `<small>Propuesta online: <a href="${esc(url)}">${esc(url)}</a></small>` : ''}
        ${wa ? `<a class="d-qr" href="${esc(waConsulta)}"><i class="d-qrimg">${qrSvg(waConsulta)}</i><span><b>${WA_SVG(12)} Escribinos por WhatsApp</b>Escaneá el código con el celular o tocá acá si lo ves en pantalla.</span></a>` : ''}
      </div>
    </section>`;
  docPartes.push(docPrecio);
  if (cob.length) docPartes.push(docSeccion(`Asistencia al viajero${p.asistencia.nombre ? ' · ' + esc(p.asistencia.nombre) : ''}`,
    `<dl class="d-cob">${cob.map(x => `<div><dt>${esc(x.etiqueta)}</dt><dd>${esc(x.valor)}</dd></div>`).join('')}</dl>`));
  const pie = `<div class="d-pie">${esc(config.agencia)}${config.legajo ? ' · Legajo ' + esc(config.legajo) : ''}${p.cliente ? ' · Propuesta para ' + esc(p.cliente) : ''}${creditos ? `<br>Fotos: ${esc(creditos)}` : ''}</div>`;
  const docCond = conds.length ? `
    <section class="d-cond">
      <div class="d-band"><span class="d-logo">${logo}</span><span>${config.legajo ? 'Legajo ' + esc(config.legajo) : ''}</span></div>
      <h2>Condiciones generales</h2>
      ${conds.filter(c => !c.titulo).map(c => `<p class="d-cond-intro">${esc(c.texto)}</p>`).join('')}
      <div class="d-cond-cols">${conds.filter(c => c.titulo).map((c, i) => `<div class="d-cond-it"><b>${i + 1}. ${esc(c.titulo)}</b><p>${esc(c.texto).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>
      ${pie}
    </section>` : '';
  const documento = `
<div class="doc" aria-hidden="true">
  <header class="d-hero"${p.foto ? ` style="background-image:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.1)),url('${esc(p.foto)}')"` : ''}>
    <div class="d-band"><span class="d-logo">${logo}</span><span>${config.legajo ? 'Legajo ' + esc(config.legajo) : ''}</span></div>
    <div class="d-hero-txt">
      <small>Propuesta para ${esc(p.cliente || '')}</small>
      <h1>${esc(p.destino)}</h1>
      <p>${[desde && hasta ? `${rango.grande} ${rango.chico} ${hasta.getUTCFullYear()}`.replace(/\s+/g, ' ') : '', n !== null ? `${n + 1} días / ${n} noches` : '', p.salida ? 'Salida desde ' + esc(p.salida) : ''].filter(Boolean).join(' · ')}</p>
    </div>
  </header>
  ${docPartes.join('')}
  ${pie}
  ${docCond}
</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="${esc(c.fondo)}">
${config.faviconUrl ? `<link rel="icon" type="image/png" href="${esc(config.faviconUrl)}">
<link rel="apple-touch-icon" href="${esc(config.faviconUrl === '/favicon-32.png' ? '/apple-touch-icon.png' : config.faviconUrl)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
${p.foto ? `<meta property="og:image" content="${esc(p.foto)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--fondo:${c.fondo};--fondo2:${c.fondo2};--acento:${c.acento};--tarjeta:${c.tarjeta};--txt:#fff;--suave:rgba(255,255,255,.86)}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:clamp(14px,min(1.2vw,2.2vh),26px)}
html,body{height:100%}
body{font-family:Montserrat,system-ui,sans-serif;color:var(--txt);background:linear-gradient(135deg,color-mix(in srgb,var(--fondo2) 82%,#000),color-mix(in srgb,var(--fondo) 88%,#000));overflow:hidden;-webkit-font-smoothing:antialiased}
.progreso{position:fixed;top:0;left:0;height:0.25rem;background:var(--acento);transition:width .4s;z-index:5}
.deck{position:relative;height:100%;width:100%;overflow:hidden}
.slide{position:absolute;inset:0;padding:7vh 5vw calc(4.6rem + 3vh);display:flex;flex-direction:column;justify-content:center;gap:1.75rem;opacity:0;visibility:hidden;transform:translateX(1.875rem);transition:opacity .45s,transform .45s,visibility .45s;overflow-y:auto}
.slide.activa{opacity:1;visibility:visible;transform:none}
.slide.antes{transform:translateX(-30px)}
.kicker{font-size:0.8125rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--suave);margin-bottom:0.375rem}
h1{font-size:4.4rem;font-weight:800;line-height:1.05}
h2{font-size:2.9rem;font-weight:800;line-height:1.1}
h3{font-size:1.25rem;font-weight:700}
.sub{color:var(--suave);font-size:0.875rem;margin-top:0.625rem}
.logo-txt{font-weight:800;font-size:1.75rem;letter-spacing:-.02em}
.logo-img{height:3rem;width:auto;display:block}
/* portada */
.portada{flex-direction:row;padding:0;gap:0;align-items:stretch}
.portada-txt{flex:1;padding:7vh 4vw calc(4.6rem + 3vh) 5vw;display:flex;flex-direction:column;justify-content:center}
.portada .logo{margin-bottom:1.375rem}
.portada hr{border:0;border-top:1px solid rgba(255,255,255,.3);margin:1.375rem 0;max-width:30rem}
.datos{display:grid;grid-template-columns:auto 1fr;gap:0.75rem 1.375rem;align-items:baseline}
.datos dt{font-size:0.6875rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--suave)}
.datos dd{font-size:0.9375rem}.datos dd b{font-size:1.375rem;margin-right:0.25rem}
.saludo{text-transform:none;letter-spacing:.02em;font-size:0.9375rem;font-weight:600}
.resumen{margin-top:1.375rem;font-size:0.9375rem;color:var(--suave)}.resumen b{color:#fff;font-size:1.0625rem}
.ver-viaje{margin-top:1.625rem;align-self:flex-start;display:inline-flex;align-items:center;gap:0.625rem;padding:0.875rem 1.625rem;border:0;border-radius:0.75rem;background:var(--acento);color:#1a1a1a;font:700 1rem Montserrat,sans-serif;cursor:pointer;box-shadow:0 0.625rem 1.5rem rgba(0,0,0,.2);transition:transform .15s}
.ver-viaje:hover{transform:translateX(0.1875rem)}
.portada-foto{flex:0 0 46%;background:radial-gradient(circle at 70% 30%,rgba(255,255,255,.35),transparent 45%),linear-gradient(160deg,var(--acento),var(--fondo2) 60%,var(--fondo));background-size:cover;background-position:center;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%);mask-image:linear-gradient(90deg,transparent,#000 22%)}
/* dos columnas */
.dos-col{flex-direction:row;align-items:center;gap:6vw}
.dos-col>header{flex:0 0 32%}
.dos-col>.lista{flex:1;display:flex;flex-direction:column;gap:0.875rem}
.card{background:var(--tarjeta);border:1px solid rgba(255,255,255,.1);border-radius:0.875rem;padding:1rem 1.25rem;backdrop-filter:blur(0.25rem)}
.tramo{font-size:0.6875rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--suave);margin-bottom:0.375rem}
.ruta{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0.75rem}
.ruta b{display:block;font-size:1.0625rem}.ruta small{font-size:0.8125rem;color:var(--suave)}
.ruta .der{text-align:right}
.avion{display:flex;flex-direction:column;align-items:center;gap:2px;padding:0 0.875rem;background:linear-gradient(90deg,transparent 0 0.375rem,rgba(255,255,255,.35) 0.375rem 0.625rem,transparent 0.625rem) repeat-x center 0.6875rem/0.75rem 1px}
.avion svg{background:transparent}.avion small{font-size:0.625rem}
.detalle{margin-top:0.75rem;font-size:0.8125rem;color:var(--suave)}
.segs{margin-top:0.625rem;border-top:1px solid rgba(255,255,255,.12);padding-top:0.625rem}
.segs summary{font-size:0.8125rem}
.seg{display:grid;grid-template-columns:1fr auto 1fr auto;gap:0.75rem;align-items:start;margin-top:0.75rem}
.seg-pt b{display:block;font-size:1rem}.seg-pt b em{font-style:normal;color:var(--acento);font-size:0.75rem}
.seg-pt span{display:block;font-size:0.75rem;font-weight:700;letter-spacing:.04em}.seg-pt small,.seg-info small{display:block;font-size:0.75rem;color:var(--suave)}
.seg-fl{padding-top:2px;color:var(--suave)}
.seg-info{text-align:right}.seg-info b{display:block;font-size:0.75rem}
.espera{margin:0.625rem 0 0;padding:0.375rem 0.625rem;border:1px dashed rgba(255,255,255,.25);border-radius:0.5rem;font-size:0.75rem;text-align:center;color:var(--suave)}
.legajo{display:block;font-size:0.6875rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--suave);margin-top:0.25rem}
.asesor{margin-top:1.375rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.2)}
.asesor b{font-size:1.0625rem}
.asesor-datos{display:flex;flex-wrap:wrap;gap:0.375rem 1rem;margin-top:0.25rem}
.asesor-datos a{color:#fff;font-size:0.8125rem;text-decoration:none;opacity:.85}
.link-cond{margin-top:1rem;background:none;border:0;color:var(--suave);font:600 0.8125rem Montserrat,sans-serif;cursor:pointer;padding:0;text-decoration:underline}
.condiciones{justify-content:flex-start;padding-top:8vh}
.cond-intro{font-weight:600;font-size:1.05rem}
.cond-lista{display:grid;grid-template-columns:1fr 1fr;gap:0.625rem 1.75rem;width:100%;align-items:start}
.cond-lista details{border-bottom:1px solid rgba(255,255,255,.15);padding:0.5rem 0}
.cond-lista p{font-size:0.8125rem;line-height:1.5;color:var(--suave);margin-top:0.5rem}
/* incluye */
.incluye{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:1.6rem 2.4rem;width:100%}
.incluye li{display:flex;gap:0.875rem;align-items:flex-start;font-size:0.9375rem;line-height:1.4}
.incluye svg{flex:none;opacity:.9}
/* asistencia */
.grilla{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem 2.5rem;width:100%}
.grilla dt{font-size:0.875rem;color:var(--suave)}.grilla dd{font-size:0.9375rem;font-weight:700;margin-top:2px}
details summary{cursor:pointer;font-weight:700;font-size:0.875rem;list-style:none}
details summary::before{content:'▸ '}details[open] summary::before{content:'▾ '}
details .grilla{margin-top:1.125rem}
/* hotel */
.hotel{display:flex;justify-content:space-between;align-items:center;gap:1rem}
.hab{font-size:0.875rem;color:var(--suave);margin:2px 0 0.5rem}
.chip{display:inline-block;font-size:0.75rem;font-weight:600;padding:0.1875rem 0.625rem;border-radius:6.1875rem;background:rgba(255,255,255,.16)}
.noches{text-align:center;border-left:1px solid rgba(255,255,255,.2);padding-left:1.25rem;min-width:6.875rem}
.noches b{display:block;font-size:1.875rem;line-height:1}.noches span{display:block;font-size:0.6875rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.noches small{font-size:0.75rem;color:var(--suave)}
/* cierre */
.cierre{flex-direction:row;align-items:center;gap:6vw}
.cierre .logo.top{position:absolute;top:6vh;left:6vw}
.cierre-txt{flex:1}
.cta{display:flex;align-items:center;justify-content:center;gap:0.625rem;margin-top:1.375rem;padding:1rem 1.5rem;border-radius:0.75rem;background:var(--acento);color:#1a1a1a;font-weight:700;font-size:1.0625rem;text-decoration:none;box-shadow:0 0.625rem 1.5rem rgba(0,0,0,.2);transition:transform .15s}
.cta:hover{transform:translateY(-2px)}
.wa-num{font-size:0.75rem;color:var(--suave);margin-top:0.625rem;text-align:center}
.precios{flex:0 0 38%;display:flex;flex-direction:column;gap:0.75rem}
.precio{border-radius:0.875rem;padding:1rem 1.25rem}.precio span{display:block;font-size:0.875rem;font-weight:600}
.precio b{display:block;font-size:clamp(1.875rem,3.4vw,2.625rem);font-weight:800;line-height:1.1}
.precio.acento{background:var(--acento);color:#1a1a1a}.precio.claro{background:#fff;color:#1a1a1a}
.total{font-size:0.875rem}
/* fotos */
.ft{border:0;padding:0;cursor:zoom-in;background:rgba(0,0,0,.2) center/cover no-repeat;border-radius:0.625rem;position:relative;overflow:hidden}
.ft.mas::after{content:attr(data-mas);position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.45);color:#fff;font:800 1.375rem Montserrat,sans-serif}
.galeria-slide{justify-content:center}
.mosaico{display:grid;gap:0.625rem;height:62vh;width:100%}
.mosaico.n1{grid-template-columns:1fr}
.mosaico.n2{grid-template-columns:1fr 1fr}
.mosaico.n3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}.mosaico.n3 .ft:first-child{grid-row:span 2}
.mosaico.n4{grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr}.mosaico.n4 .ft:first-child{grid-row:span 2}.mosaico.n4 .ft:nth-child(4){grid-column:span 2}
.mosaico.n5{grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr}.mosaico.n5 .ft:first-child{grid-row:span 2}
.hotel.con-fotos{flex-direction:column;align-items:stretch;padding:0.625rem 0.625rem 1rem}
.hotel-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;width:100%}
.hotel.con-fotos .hotel-row{padding:0 0.625rem}
.hotel-fotos{display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.375rem;height:9.375rem;margin-bottom:0.75rem}
.hotel-fotos .ft{border-radius:0.5rem}
.cierre.con-foto{background:linear-gradient(90deg,rgba(0,0,0,.25),rgba(0,0,0,.05)),var(--foto) center/cover}
.cierre.con-foto::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--fondo2),var(--fondo));opacity:.82;z-index:-1}
.cierre.con-foto{isolation:isolate}
.visor{position:fixed;inset:0;z-index:20;background:rgba(10,8,6,.92);display:none;align-items:center;justify-content:center}
.visor.abierto{display:flex}
.visor img{max-width:92vw;max-height:84vh;border-radius:0.5rem;box-shadow:0 0.625rem 2.5rem rgba(0,0,0,.5)}
.visor button{position:absolute;background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:50%;width:2.75rem;height:2.75rem;font-size:1.375rem;cursor:pointer}
.visor .vc{top:1.125rem;right:1.125rem}.visor .vp{left:1.125rem;top:50%}.visor .vn{right:1.125rem;top:50%}
.visor .vk{position:absolute;bottom:1.375rem;color:#fff;font-size:0.8125rem;opacity:.8}
.wa-flot{position:fixed;top:1rem;right:1.125rem;z-index:6;display:flex;align-items:center;gap:0.5rem;padding:0.5625rem 1rem 0.5625rem 0.75rem;border-radius:6.1875rem;background:#25D366;color:#fff;font:700 0.8125rem Montserrat,sans-serif;text-decoration:none;box-shadow:0 0.375rem 1.125rem rgba(0,0,0,.2);transition:opacity .3s,transform .15s}
.wa-flot:hover{transform:translateY(-1px)}
.en-cierre .wa-flot{opacity:0;pointer-events:none}
.indice{position:fixed;top:0.875rem;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:2px;padding:0.25rem;border-radius:6.1875rem;background:rgba(0,0,0,.28);backdrop-filter:blur(0.5rem)}
.indice button{border:0;background:none;color:rgba(255,255,255,.8);font:600 0.75rem Montserrat,sans-serif;padding:0.4375rem 0.8125rem;border-radius:6.1875rem;cursor:pointer;white-space:nowrap}
.indice button:hover{color:#fff;background:rgba(255,255,255,.1)}
.indice button.on{background:#fff;color:#1a1a1a}
.en-portada .indice{opacity:0;pointer-events:none}
.indice{transition:opacity .3s}
.barra-movil{display:none}
/* vencimiento */
.vence-chip{margin-top:0.75rem;align-self:flex-start;font-size:0.8125rem;font-weight:600;padding:0.375rem 0.75rem;border-radius:6.1875rem;background:rgba(0,0,0,.25)}
.vence{margin:0.875rem 0 -8px;font-size:0.875rem;font-weight:600;color:#fff}
.vence.urgente,.vence-chip.urgente{color:#ffd9a8}
.precio.vencido small{display:block;font-size:0.8125rem;font-weight:500;margin-top:0.375rem;line-height:1.4;color:#555}
.precio.vencido b{font-size:1.625rem}
/* opciones */
.opciones-slide{justify-content:center}
.ops{display:grid;gap:1.2rem;width:100%}
.ops.n1{grid-template-columns:minmax(0,32.5rem)}.ops.n2{grid-template-columns:1fr 1fr}.ops.n3{grid-template-columns:1fr 1fr 1fr}
.op{position:relative;padding:0.625rem;display:flex;flex-direction:column;border:2px solid transparent;transition:border-color .2s}
.op.sel{border-color:var(--acento)}
.op-badge{position:absolute;top:1.125rem;left:1.125rem;z-index:2;background:var(--acento);color:#1a1a1a;font-size:0.6875rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:0.25rem 0.625rem;border-radius:6.1875rem}
.op-fotos{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:0.3125rem;height:9.375rem;margin-bottom:0.75rem}.op-fotos .ft:first-child{grid-row:span 2}.op-fotos .ft{border-radius:0.5rem}
.op-cuerpo{padding:0 0.5rem 0.5rem;display:flex;flex-direction:column;flex:1}
.op-cuerpo .chip{align-self:flex-start}
.op:not(.con-fotos) .op-badge{position:static;align-self:flex-start;margin:0.4rem 0.5rem 0.6rem}
.op-precio{margin-top:0.875rem}.op-precio b{font-size:1.625rem;display:block;line-height:1.1}.op-precio span{font-size:0.8125rem;color:var(--suave)}
.op-ss{font-size:0.8125rem;color:var(--suave);margin-top:0.25rem}
.elegir{align-self:stretch;margin-top:1rem;border:0;border-radius:0.625rem;padding:0.75rem;font:700 0.875rem Montserrat,sans-serif;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
.op.sel .elegir{background:var(--acento);color:#1a1a1a}
.op-lista{display:flex;flex-direction:column;gap:0.625rem}
.op-item{display:flex;align-items:center;gap:0.75rem;width:100%;text-align:left;border:2px solid transparent;border-radius:0.875rem;padding:0.875rem 1rem;background:#fff;color:#1a1a1a;cursor:pointer;font:500 0.875rem Montserrat,sans-serif}
.op-item.sel{border-color:var(--acento);background:#fff8ee;box-shadow:0 0 0 0.1875rem rgba(0,0,0,.08)}
.op-radio{flex:none;width:1.125rem;height:1.125rem;border-radius:50%;border:2px solid #bbb}
.op-item.sel .op-radio{border:0.375rem solid var(--fondo)}
.op-nom{flex:1;font-weight:700}.op-reg{display:block;font-style:normal;font-weight:600;font-size:0.75rem;color:var(--fondo);margin-top:0.15rem}.op-nom small{display:block;font-weight:500;font-size:0.75rem;color:#777}
.op-item b{font-size:1.25rem;white-space:nowrap}
.vencida .precio-dato{display:none}
/* íconos escalables */
.incluye svg{width:1.7rem;height:1.7rem}.avion svg{width:1.5rem;height:1.5rem}.cta svg{width:1.4rem;height:1.4rem}.wa-flot svg{width:1.25rem;height:1.25rem}
/* equipaje, créditos, opciones pedidas */
.equipaje{display:flex;align-items:center;gap:0.6rem;font-size:0.95rem;margin-top:0.2rem;color:var(--suave)}.equipaje b{color:#fff}.equipaje svg{width:1.25rem;height:1.25rem;flex:none}
.creditos{font-size:0.75rem;color:var(--suave);margin-top:-0.6rem}
.ops{align-items:start}
.opciones-slide.pedir .op{animation:pedir 0.8s ease 2}
@keyframes pedir{50%{border-color:var(--acento);box-shadow:0 0 0 0.25rem rgba(255,255,255,.25)}}
.slide.sin-fotos .mosaico{display:none}
.marca-prueba{position:fixed;bottom:1.6rem;left:1.4rem;z-index:9;background:#ffd84d;color:#3a2a00;font:700 0.75rem Montserrat,sans-serif;padding:0.35rem 0.8rem;border-radius:99px;letter-spacing:.02em}
@media print{.marca-prueba{display:none}}
/* barra inferior */
.nav{position:fixed;bottom:1.4rem;left:50%;transform:translateX(-50%);display:flex;gap:0.6rem;z-index:5}
.nav button{white-space:nowrap;font:700 0.95rem Montserrat,sans-serif;border:0;border-radius:0.6rem;height:2.9rem;padding:0 1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.4rem}
#pdf{min-width:11.5rem}#ant{width:2.9rem;padding:0}
.btn-sec{background:rgba(255,255,255,.14);color:#fff}
.btn-pri{background:#fff;color:#1a1a1a;min-width:13.5rem;justify-content:center}
.nav button:disabled{opacity:.35;cursor:default}
/* celular: página con scroll en lugar de diapositivas */
@media (max-width:760px),(max-width:1100px) and (orientation:portrait){
  html{font-size:clamp(16px,2.1vw,20px)}
  h1{font-size:2.6rem}h2{font-size:1.9rem}
  #pdf,.btn-pri{min-width:0}
  html,body{height:auto}
  body{overflow:auto;padding-bottom:5.25rem;background-attachment:fixed}
  .deck{height:auto}
  .slide{position:relative;inset:auto;opacity:1;visibility:visible;transform:none;overflow:visible;padding:2.75rem 1.25rem 2.5rem;justify-content:flex-start;gap:1.25rem;border-top:1px solid rgba(255,255,255,.08)}
  .slide.antes{transform:none}
  .progreso,.nav,.indice,.wa-flot{display:none!important}
  .portada{flex-direction:column-reverse;padding:0;border-top:0;min-height:auto}
  .portada-foto{flex:none;height:34vh;-webkit-mask-image:linear-gradient(0deg,transparent,#000 30%);mask-image:linear-gradient(0deg,transparent,#000 30%)}
  .portada-txt{padding:0 1.25rem 2.25rem;justify-content:flex-start}
  .ver-viaje{align-self:stretch;justify-content:center}
  .dos-col,.cierre{flex-direction:column;align-items:stretch;gap:1.25rem}
  .dos-col>header{flex:none}
  .cierre .logo.top{position:static}
  .grilla{grid-template-columns:1fr 1fr}
  .cond-lista{grid-template-columns:1fr}
  .mosaico{height:auto;grid-auto-rows:7.5rem}.mosaico.n3,.mosaico.n4,.mosaico.n5{grid-template-columns:1fr 1fr;grid-template-rows:none}
  .mosaico .ft:first-child{grid-column:span 2;grid-row:span 2!important}.mosaico.n4 .ft:nth-child(4){grid-column:auto}
  .hotel-fotos{height:6.875rem}
  .seg{grid-template-columns:1fr auto 1fr}.seg-info{grid-column:1/-1;text-align:left;display:flex;gap:0.625rem;flex-wrap:wrap}
  .incluye{grid-template-columns:1fr}
  .ops.n2,.ops.n3{grid-template-columns:1fr}
  .op-item b{font-size:1.0625rem}
  .marca-prueba{bottom:auto;top:0.8rem;left:0.8rem}
  .barra-movil{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:8;align-items:center;gap:0.625rem;padding:0.625rem 0.875rem calc(0.625rem + env(safe-area-inset-bottom));background:rgba(20,14,8,.88);backdrop-filter:blur(0.625rem);border-top:1px solid rgba(255,255,255,.12);transition:transform .3s}
  .barra-movil.oculta{transform:translateY(110%)}
  .bm-precio{flex:1;min-width:0;line-height:1.15}.bm-precio b{display:block;font-size:1.0625rem}.bm-precio span{font-size:0.75rem;color:var(--suave);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
  .bm-consulta{width:2.75rem;height:2.75rem;border-radius:0.75rem;display:grid;place-items:center;background:rgba(255,255,255,.14);color:#fff}
  .bm-reservar{padding:0.8125rem 1.25rem;border-radius:0.75rem;background:#25D366;color:#fff;font-weight:700;font-size:0.9375rem;text-decoration:none}
}
/* Documento para imprimir: solo visible al imprimir o guardar como PDF */
.doc{display:none}
@media print{
  @page{size:A4 portrait;margin:10mm 12mm 12mm}
  html,body{height:auto;overflow:visible;background:#fff!important;color:#2b2520}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:9.5pt}
  .deck,.nav,.progreso,.barra-movil,.indice,.wa-flot,.visor{display:none!important}
  .doc{display:block}
  .d-band{display:flex;justify-content:space-between;align-items:center;font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fff}
  .d-logo .logo-txt{font-size:15pt;letter-spacing:-.01em;text-transform:none}.d-logo .logo-img{height:26px}
  .d-hero{background:var(--fondo);background-size:cover;background-position:center;color:#fff;border-radius:10px;padding:12px 18px 14px;margin-bottom:8px}
  .d-hero-txt{margin-top:16px}
  .d-hero small{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
  .d-hero h1{font-size:28pt;line-height:1.05;margin:2px 0 4px}
  .d-hero p{font-size:10pt;font-weight:600}
  .d-sec{margin-top:9px;break-inside:avoid}
  .d-h{font-size:8.5pt;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--fondo);border-bottom:1.5px solid var(--fondo);padding-bottom:3px;margin-bottom:7px}
  .d-inc{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:5px 18px}
  .d-inc li{display:flex;gap:7px;align-items:flex-start}.d-inc svg{flex:none;color:var(--fondo);margin-top:1px}
  .d-tramo{border:1px solid #e3dcd3;border-radius:8px;padding:7px 10px;margin-bottom:7px;break-inside:avoid}
  .d-tramo-h{font-size:9pt;display:flex;justify-content:space-between;color:var(--fondo)}.d-tramo-h span{color:#7a6f64;font-size:8pt}
  .d-seg{display:grid;grid-template-columns:1fr 16px 1fr 110px;gap:8px;margin-top:6px;align-items:start}
  .d-seg b{display:block;font-size:11pt}.d-seg b em{font-style:normal;font-size:7.5pt;color:#c0392b}
  .d-seg span{display:block;font-size:8.5pt;font-weight:700}.d-seg small{display:block;font-size:7.5pt;color:#7a6f64}
  .d-fl{color:#a59a8f;padding-top:2px}.d-info{text-align:right}.d-info b{font-size:9pt}
  .d-esp{margin-top:5px;font-size:7.5pt;color:#7a6f64;text-align:center;border-top:1px dashed #d8cfc4;border-bottom:1px dashed #d8cfc4;padding:2px 0}
  .d-hotel{display:flex;justify-content:space-between;align-items:center;border:1px solid #e3dcd3;border-radius:8px;padding:7px 10px;margin-bottom:5px}
  .d-hotel small{display:block;font-size:7.5pt;color:#7a6f64;text-transform:uppercase;letter-spacing:.08em}.d-hotel b{display:block;font-size:11pt}.d-hotel span{font-size:8.5pt}
  .d-noches{text-align:right;font-size:8.5pt}.d-noches b{font-size:14pt;color:var(--fondo)}.d-noches small{display:block;color:#7a6f64}
  .d-hfotos{display:flex;gap:4px;margin-right:10px}.d-hfotos img{width:62px;height:44px;object-fit:cover;border-radius:4px}.d-htxt{flex:1}
  .visor,.ft{display:none!important}
  .d-nota{font-size:7.5pt;color:#7a6f64;margin-top:4px}
  .d-precio-wrap{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}
  .d-precio,.d-asesor{border-radius:8px;padding:9px 12px}
  .d-precio{background:var(--fondo);color:#fff}.d-precio .d-h{color:#fff;border-color:rgba(255,255,255,.5)}.d-precio .d-nota{color:rgba(255,255,255,.8)}
  .d-total{display:flex;justify-content:space-between;align-items:baseline}.d-total span{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.d-total b{font-size:18pt}
  .d-ss{display:flex;gap:18px;margin-top:5px;font-size:8.5pt}.d-ss b{display:block;font-size:11pt}
  .d-asesor{border:1px solid #e3dcd3}.d-asesor b{display:block;font-size:11pt;margin-bottom:2px}.d-asesor span{display:block;font-size:8.5pt}.d-asesor small{display:block;font-size:7pt;color:#7a6f64;margin-top:4px;word-break:break-all}
  .d-vence{font-size:8pt;font-weight:700;margin-top:4px}
  .d-wa{display:block;font-size:8.5pt;color:inherit;text-decoration:none}
  .d-asesor small a{color:inherit}
  .d-qr{display:flex;gap:8px;align-items:center;margin-top:5px;padding-top:5px;border-top:1px solid #e3dcd3;color:#2b2520;text-decoration:none}
  .d-qrimg{flex:none;width:54px;height:54px}.d-qrimg svg{width:54px;height:54px;display:block}
  .d-qr b svg{width:11px;height:11px}
  .d-qr span{font-size:7.5pt;color:#7a6f64;line-height:1.35}.d-qr b{display:flex;align-items:center;gap:4px;font-size:8.5pt;color:#1f9e50;margin:0 0 2px}
  .wa-flot{display:none!important}
  .d-cob{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px}.d-cob dt{font-size:7.5pt;color:#7a6f64}.d-cob dd{font-weight:700;font-size:9pt}
  .d-pie{margin-top:8px;padding-top:4px;border-top:1px solid #e3dcd3;font-size:7.5pt;color:#7a6f64;text-align:center}
  .d-cond{margin-top:14px}
  .d-cond .d-band,.d-cond h2,.d-cond-intro{break-after:avoid}
  .d-cond .d-band{background:var(--fondo);border-radius:10px;padding:12px 18px}
  .d-cond h2{font-size:16pt;color:var(--fondo);margin:14px 0 6px}
  .d-cond-intro{font-weight:700;font-size:9pt;margin-bottom:8px}
  .d-cond-cols{column-count:2;column-gap:18px}
  .d-cond-it{break-inside:avoid;margin-bottom:7px}.d-cond-it b{display:block;font-size:8.5pt;color:var(--fondo);text-transform:uppercase;letter-spacing:.04em}.d-cond-it p{font-size:8pt;line-height:1.4;margin-top:1px}
}
</style>
</head>
<body${vencida ? ' class="vencida"' : ''}>
<div class="progreso" id="progreso"></div>
${p.prueba ? '<div class="marca-prueba">Propuesta de prueba · no genera avisos</div>' : ''}
<main class="deck" id="deck">${slides.join('')}</main>
${documento}
<div class="visor" id="visor" role="dialog" aria-label="Fotos"><img alt=""><button class="vc" type="button" aria-label="Cerrar">×</button><button class="vp" type="button" aria-label="Anterior">‹</button><button class="vn" type="button" aria-label="Siguiente">›</button><span class="vk"></span></div>
<nav class="indice" id="indice" aria-label="Secciones"></nav>
${wa ? `<div class="barra-movil">
  <div class="bm-precio">${vencida ? `<b>Tarifa vencida</b><span>Pedí el precio actualizado</span>`
    : hayOps ? `<b id="bm-total">${minOp ? 'Desde ' + dinero(moneda, minOp.total) : ''}</b><span id="bm-unidad">${ops.length} opciones${minOp && minOp.unidad ? ' · ' + esc(minOp.unidad) : ''}</span>`
    : total ? `<b>${dinero(moneda, total)}</b><span>${esc(pr.unidad || 'precio final')}${fv ? ' · hasta el ' + venceTexto : ''}</span>` : `<b>${esc(p.destino)}</b><span>${esc(rango.grande)} ${esc(rango.chico)}</span>`}</div>
  <a class="bm-consulta" id="consultar-m" href="${esc(waConsulta)}" target="_blank" rel="noopener" aria-label="Consultas por WhatsApp">${WA_SVG(20)}</a>
  <a class="bm-reservar" id="reservar-m" href="${esc(linkReservar)}" target="_blank" rel="noopener">${vencida ? 'Actualizar' : hayOps ? 'Elegir' : 'Reservar'}</a>
</div>` : ''}
${wa ? `<a class="wa-flot" id="consultar" href="${esc(waConsulta)}" target="_blank" rel="noopener">${WA_SVG(20)}<span>Consultas</span></a>` : ''}
<nav class="nav">
  <button class="btn-sec" id="pdf" type="button">⤓ PDF</button>
  <button class="btn-sec" id="ant" type="button" aria-label="Anterior">‹</button>
  <button class="btn-pri" id="sig" type="button">Siguiente ›</button>
</nav>
<script>
var OPC='',MOVIL=window.matchMedia('(max-width:760px),(max-width:1100px) and (orientation:portrait)').matches,FOTOS=${JSON.stringify(fotosJs).replace(/</g, '\\u003c')},TRK=${JSON.stringify({ id: p.id, a: agencia || undefined, on: !!tracking && !p.prueba })};
(function(){
  var s=[].slice.call(document.querySelectorAll('.slide')),i=0,
      bar=document.getElementById('progreso'),ant=document.getElementById('ant'),sig=document.getElementById('sig');
  /* índice de secciones (compu) */
  var idx=document.getElementById('indice');
  s.forEach(function(el,k){var t=el.getAttribute('data-nav');if(!t||k===0)return;var b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('data-k',k);b.onclick=function(){ir(k)};idx.appendChild(b)});
  /* fotos: se cargan al llegar a la sección; en el celular, en tamaño más chico */
  function urlFoto(u){return MOVIL?u.replace(/(wikimedia\\.org\\/wikipedia\\/commons\\/thumb\\/.+\\/)\\d+px-/,'$1960px-').replace(/([?&])width=1600/,'$1width=960'):u}
  var MALAS={};
  /* una foto que no carga se quita sin dejar hueco: el mosaico se reacomoda y, si no queda ninguna, desaparece el bloque */
  function quitarFoto(e,u){MALAS[u]=1;var box=e.parentNode;e.remove();if(!box)return;var n=box.querySelectorAll('.ft').length;
    if(box.classList.contains('mosaico')){box.className='mosaico n'+Math.min(n,5);if(!n){var sl=box.closest('.slide');if(sl)sl.classList.add('sin-fotos')}}
    else if(!n){var card=box.closest('.con-fotos');box.remove();if(card)card.classList.remove('con-fotos')}}
  function cargarFotos(sec){[].forEach.call(sec.querySelectorAll('[data-bg]'),function(e){var u=e.getAttribute('data-bg'),url=urlFoto(u),im=new Image();e.removeAttribute('data-bg');
    im.onload=function(){e.style.backgroundImage="url('"+url+"')"};im.onerror=function(){quitarFoto(e,u)};im.src=url})}
  /* logo que no carga: queda el nombre escrito */
  [].forEach.call(document.querySelectorAll('.logo-img'),function(im){function f(){var t=document.createElement('span');t.className='logo-txt';t.textContent=im.alt;im.replaceWith(t)}if(im.complete&&!im.naturalWidth)f();else im.addEventListener('error',f)});
  /* portada y fondo del cierre: si la foto no carga queda el degradé */
  [].forEach.call(document.querySelectorAll('.portada-foto[style],.cierre.con-foto'),function(e){var m=(e.getAttribute('style')||'').match(/url\('([^']+)'\)/);if(!m)return;var im=new Image();im.onerror=function(){if(e.classList.contains('cierre'))e.classList.remove('con-foto');else e.removeAttribute('style')};im.src=m[1]});
  function ir(n){
    i=Math.max(0,Math.min(s.length-1,n));
    s.forEach(function(el,k){el.classList.toggle('activa',k===i);el.classList.toggle('antes',k<i)});
    bar.style.width=((i+1)/s.length*100)+'%';
    ant.disabled=i===0;sig.disabled=i===s.length-1;
    if(!MOVIL)try{history.replaceState(null,'','#'+(i+1))}catch(e){}
    var enCierre=s[i].classList.contains('cierre');document.body.classList.toggle('en-cierre',enCierre);
    document.body.classList.toggle('en-portada',i===0);
    [].forEach.call(document.querySelectorAll('#indice button'),function(b){b.classList.toggle('on',+b.getAttribute('data-k')===i)});
    cargarFotos(s[i]);if(s[i+1])cargarFotos(s[i+1]);
    if(enCierre)ev('vio_precio');
  }
  /* aviso de aperturas: no registra si el link tiene ?interno */
  var enviados={},interno=/[?&]interno/.test(location.search);
  function ev(tipo){
    if(!TRK.on||interno||enviados[tipo])return;enviados[tipo]=1;
    var d=JSON.stringify({id:TRK.id,a:TRK.a,evento:tipo,pantalla:i+1,total:s.length,movil:window.innerWidth<760,opcion:OPC});
    try{if(!(navigator.sendBeacon&&navigator.sendBeacon('/api/evento',new Blob([d],{type:'text/plain'}))))fetch('/api/evento',{method:'POST',body:d,keepalive:true})}catch(e){}
  }
  /* sin opción elegida, "Reservar" lleva a las opciones en lugar de abrir WhatsApp */
  function irAOpciones(){var o=document.querySelector('.opciones-slide');if(!o)return;if(MOVIL)o.scrollIntoView({behavior:'smooth'});else ir(s.indexOf(o));o.classList.add('pedir');setTimeout(function(){o.classList.remove('pedir')},1600)}
  ['reservar','reservar-m'].forEach(function(x){var e=document.getElementById(x);if(e)e.addEventListener('click',function(v){if((e.getAttribute('href')||'').charAt(0)==='#'){v.preventDefault();irAOpciones();return}ev('reservar')})});
  ['consultar','consultar-m'].forEach(function(x){var e=document.getElementById(x);if(e)e.addEventListener('click',function(){ev('consulta')})});
  [].forEach.call(document.querySelectorAll('[data-sig]'),function(b){b.addEventListener('click',function(e){e.stopPropagation();if(MOVIL){if(s[1])s[1].scrollIntoView({behavior:'smooth'})}else ir(1)})});
  /* celular: cargar fotos y registrar "vio el precio" al hacer scroll; ocultar la barra en la sección de precio */
  if(MOVIL&&'IntersectionObserver' in window){
    var bm=document.querySelector('.barra-movil');
    var io=new IntersectionObserver(function(es){es.forEach(function(en){
      if(en.isIntersecting)cargarFotos(en.target);
      if(en.target.classList.contains('cierre')){if(en.isIntersecting)ev('vio_precio');if(bm)bm.classList.toggle('oculta',en.isIntersecting)}
    })},{rootMargin:'300px 0px',threshold:0});
    s.forEach(function(el){io.observe(el)});
    var io2=new IntersectionObserver(function(es){es.forEach(function(en){if(bm)bm.classList.toggle('oculta',en.isIntersecting)})},{threshold:.35});
    var ci=document.querySelector('.cierre');if(ci)io2.observe(ci);
  }else if(MOVIL){s.forEach(cargarFotos)}
  /* opciones: elegir una actualiza el botón de reservar y la barra del celular */
  function elegir(k){
    var it=document.querySelector('.op-item[data-op="'+k+'"]');if(!it)return;
    [].forEach.call(document.querySelectorAll('.op-item,.op'),function(e){e.classList.toggle('sel',e.getAttribute('data-op')==k)});
    [].forEach.call(document.querySelectorAll('.elegir'),function(b){b.textContent=b.getAttribute('data-op')==k?'✓ Elegida':'Elegir esta opción'});
    var w=it.getAttribute('data-wa');['reservar','reservar-m'].forEach(function(x){var e=document.getElementById(x);if(e)e.href=w});
    var ct=document.querySelector('#reservar .cta-txt');if(ct)ct.textContent='Reservar opción '+(+k+1);
    var rm=document.getElementById('reservar-m');if(rm)rm.textContent='Reservar';
    var bt=document.getElementById('bm-total'),bu=document.getElementById('bm-unidad');if(bt)bt.textContent=it.getAttribute('data-total');if(bu)bu.textContent='Opción '+(+k+1)+(it.getAttribute('data-reg')?' · '+it.getAttribute('data-reg'):'')+' · '+(it.getAttribute('data-unidad')||'precio final');
    var ss=document.getElementById('op-ss'),un=it.getAttribute('data-unidad');if(ss)ss.textContent=[it.getAttribute('data-ss'),un?'Precio final '+un:''].filter(Boolean).join(' · ');
    OPC=it.getAttribute('data-nom');
  }
  [].forEach.call(document.querySelectorAll('.op-item'),function(b){b.addEventListener('click',function(){elegir(b.getAttribute('data-op'))})});
  [].forEach.call(document.querySelectorAll('.elegir'),function(b){b.addEventListener('click',function(e){e.stopPropagation();elegir(b.getAttribute('data-op'));
    var ci=document.querySelector('.cierre');if(MOVIL){if(ci)ci.scrollIntoView({behavior:'smooth'})}else ir(s.indexOf(ci))})});
  /* cuenta regresiva del precio */
  function plazo(){[].forEach.call(document.querySelectorAll('[data-vence]'),function(e){
    var ms=+e.getAttribute('data-vence')-Date.now();if(ms<=0){location.reload();return}
    var d=Math.floor(ms/864e5),t=d<1?'vence hoy, quedan '+Math.max(1,Math.floor(ms/36e5))+' h':'quedan '+d+' día'+(d>1?'s':'');
    e.textContent=(e.classList.contains('vence')?'⏳ ':'')+'Precio válido hasta el '+e.getAttribute('data-txt')+' · '+t;
    e.classList.toggle('urgente',ms<2*864e5);
  })}
  plazo();setInterval(plazo,60000);
  /* visor de fotos */
  var vz=document.getElementById('visor'),vimg=vz.querySelector('img'),vk=vz.querySelector('.vk'),vg=null,vi=0;
  function lista(g){return (FOTOS[g]||[]).filter(function(u){return !MALAS[u]})}
  function verFoto(g,k){var l=lista(g);if(!l.length)return;vg=g;vi=(k+l.length)%l.length;vimg.src=l[vi];vk.textContent=(vi+1)+' / '+l.length;vz.classList.add('abierto')}
  function cerrar(){vz.classList.remove('abierto');vg=null}
  [].forEach.call(document.querySelectorAll('.ft'),function(b){b.addEventListener('click',function(e){e.stopPropagation();var g=b.getAttribute('data-g');verFoto(g,Math.max(0,lista(g).indexOf(b.getAttribute('data-u'))))})});
  vz.querySelector('.vc').onclick=cerrar;vz.querySelector('.vp').onclick=function(){verFoto(vg,vi-1)};vz.querySelector('.vn').onclick=function(){verFoto(vg,vi+1)};
  vz.addEventListener('click',function(e){if(e.target===vz)cerrar()});
  ant.onclick=function(){ir(i-1)};sig.onclick=function(){ir(i+1)};
  document.getElementById('pdf').onclick=function(){ev('pdf');try{window.print()}catch(e){}};
  [].forEach.call(document.querySelectorAll('[data-ir]'),function(b){b.onclick=function(){ir(s.length-1)}});
  window.addEventListener('beforeprint',function(){[].forEach.call(document.querySelectorAll('details'),function(d){d.setAttribute('data-c',d.open?'1':'0');d.open=true})});
  window.addEventListener('afterprint',function(){[].forEach.call(document.querySelectorAll('details'),function(d){d.open=d.getAttribute('data-c')==='1'})});
  document.addEventListener('keydown',function(e){
    if(vg!==null){if(e.key==='Escape')cerrar();if(e.key==='ArrowRight')verFoto(vg,vi+1);if(e.key==='ArrowLeft')verFoto(vg,vi-1);return}
    if(e.key==='ArrowRight'||e.key===' ')ir(i+1);if(e.key==='ArrowLeft')ir(i-1)});
  var x0=null,y0=null;
  document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
  document.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){if(vg!==null)verFoto(vg,dx<0?vi+1:vi-1);else if(!MOVIL)ir(dx<0?i+1:i-1)}x0=null},{passive:true});
  if(!MOVIL)document.querySelector('.portada').addEventListener('click',function(e){if(!e.target.closest('a,button'))ir(1)});
  /* itinerario abierto en compu, salvo que no entre en la pantalla */
  if(!MOVIL){var vs=document.querySelector('[data-nav="Vuelos"]');[].forEach.call(document.querySelectorAll('details.segs'),function(d){d.open=true});
    if(vs){vs.style.visibility='hidden';vs.style.opacity='0';vs.classList.add('activa');var sobra=vs.scrollHeight>vs.clientHeight+2;vs.classList.remove('activa');vs.style.visibility='';vs.style.opacity='';
      if(sobra)[].forEach.call(vs.querySelectorAll('details.segs'),function(d){d.open=false})}}
  var h=parseInt((location.hash||'').slice(1),10);ir(h>0&&!MOVIL?h-1:0);
  ev('abrio');
})();
</script>
</body>
</html>`;
}

export function render404(marca) {
  const cf = marca ? mezclarMarca(CONFIG, marca) : { agencia: '', colores: { fondo: '#3a3a3a' } };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Propuesta no encontrada${cf.agencia ? ' · ' + esc(cf.agencia) : ''}</title>
<style>body{font-family:system-ui,sans-serif;background:${esc(cf.colores.fondo)};color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px}</style></head>
<body><div><h1>No encontramos esta propuesta</h1><p>Puede que haya vencido. Escribinos y te armamos una nueva.</p></div></body></html>`;
}

// Página de inicio de cada agencia (/): logo o nombre y un texto corto
export function renderInicio(marca) {
  const cf = marca ? mezclarMarca(CONFIG, marca) : null;
  const fondo = cf ? cf.colores.fondo : '#3a3a3a';
  const marcaHtml = !cf ? '' : cf.logoUrl ? `<img src="${esc(cf.logoUrl)}" alt="${esc(cf.agencia)}" style="height:90px;max-width:80vw;object-fit:contain">` : `<h1 style="font-weight:600;letter-spacing:.04em">${esc(cf.agencia)}</h1>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cf ? cf.agencia : 'Propuestas de viaje')}</title>${cf && cf.faviconUrl ? `<link rel="icon" type="image/png" href="${esc(cf.faviconUrl)}">` : ''}
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:${esc(fondo)};color:#fff;text-align:center;padding:20px}</style></head>
<body><div>${marcaHtml}<p>Las propuestas se abren con su link personal.</p></div></body></html>`;
}
