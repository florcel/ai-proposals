/**
 * AG Travel · Propuestas — script del Google Sheet
 *
 * Pegar en Extensiones → Apps Script (archivo Código.gs), junto con CargaIA.html.
 * Hace tres cosas:
 *  1. Menú "Propuestas": generar ID y link, mensaje de WhatsApp, cargar propuesta con IA.
 *  2. Recibe los avisos de la página (doPost): registra cada visita en la pestaña "aperturas",
 *     actualiza visitas/última visita en "propuestas" y manda un mail al asesor.
 *  3. Carga con IA: lee un PDF, una captura o un texto de la operadora y completa las pestañas.
 *  4. Recordatorios: avisa al asesor si el cliente abrió y no respondió en 48 h, o si la propuesta vence mañana.
 *
 * Configuración (Configuración del proyecto ⚙ → Propiedades de la secuencia de comandos):
 *  - ANTHROPIC_API_KEY : clave de la API de Claude (para la carga con IA)
 *  - TRACK_SECRET      : la misma clave que pusiste en Vercel como TRACK_SECRET
 *  - AVISO_EMAIL       : (opcional) mail que recibe los avisos si la propuesta no tiene asesor con email
 *  - PEXELS_API_KEY    : (opcional) clave gratuita de pexels.com/api para fotos del destino de mejor calidad.
 *                        Sin esta clave, las fotos se buscan en Wikimedia Commons.
 */
const BASE_URL = 'https://agtravels.vercel.app'; // ← tu dominio, sin barra al final
const MODELO_IA = 'claude-sonnet-5-5';
const MINUTOS_ENTRE_AVISOS = 30; // no repite el mail de "abrió" si vuelve a entrar antes de este tiempo

// ───────────────────────── Menú ─────────────────────────
function onOpen() {
  try { actualizarEstructura(true); } catch (e) { console.warn(e); }
  SpreadsheetApp.getUi().createMenu('Propuestas')
    .addItem('Cargar propuesta con IA…', 'abrirCargaIA')
    .addSeparator()
    .addItem('Generar ID y link', 'generarLinks')
    .addItem('Mensaje para WhatsApp (fila seleccionada)', 'mensajeWhatsapp')
    .addItem('Vista interna (sin avisos) de la fila seleccionada', 'vistaInterna')
    .addItem('Fotos: completar desde la biblioteca', 'fotosFilaSeleccionada')
    .addItem('Fotos: buscar en internet', 'fotosInternetFilaSeleccionada')
    .addItem('Fotos: guardar las de la fila en la biblioteca', 'guardarEnBiblioteca')
    .addSeparator()
    .addItem('Activar recordatorios de seguimiento', 'activarRecordatorios')
    .addItem('Revisar seguimientos ahora', 'revisarSeguimientosManual')
    .addItem('Actualizar columnas y pestañas del Sheet', 'actualizarEstructura')
    .addToUi();
}

function generarLinks() {
  const hoja = hojaPorNombre('propuestas');
  const datos = hoja.getDataRange().getValues();
  const enc = datos[0].map(String);
  const cId = enc.indexOf('id'), cLink = enc.indexOf('link'), cDest = enc.indexOf('destino');
  let n = 0;
  for (let f = 1; f < datos.length; f++) {
    if (!datos[f][cDest]) continue;
    let id = datos[f][cId];
    if (!id) { id = idAleatorio(12); hoja.getRange(f + 1, cId + 1).setNumberFormat('@').setValue(id); n++; }
    hoja.getRange(f + 1, cLink + 1).setValue(`${baseUrl()}/p/${id}`);
  }
  SpreadsheetApp.getActive().toast(`${n} propuesta(s) nuevas con link`);
}

function filaSeleccionada() {
  const hoja = SpreadsheetApp.getActiveSheet();
  if (hoja.getName() !== 'propuestas') throw new Error('Seleccioná una fila en la pestaña "propuestas".');
  const fila = hoja.getActiveRange().getRow();
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  const val = hoja.getRange(fila, 1, 1, hoja.getLastColumn()).getValues()[0];
  return k => val[enc.indexOf(k)];
}

function mensajeWhatsapp() {
  const get = filaSeleccionada();
  const texto = `¡Hola ${get('cliente')}! Te paso la propuesta para ${get('destino')} 🌴\n${get('link')}\nCualquier duda me escribís.`;
  SpreadsheetApp.getUi().alert('Copiá este mensaje', texto, SpreadsheetApp.getUi().ButtonSet.OK);
}

function vistaInterna() {
  const get = filaSeleccionada();
  const link = `${get('link')}?interno=1`;
  const html = HtmlService.createHtmlOutput(`<p style="font-family:Arial">Abrí este link para ver la propuesta sin generar avisos:</p><p><a href="${link}" target="_blank">${link}</a></p>`).setWidth(460).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(html, 'Vista interna');
}

// ───────────────────────── Avisos de aperturas ─────────────────────────
// Se activa al implementar el script como "Aplicación web" (ver README).
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return salida('json'); }
  if (!props.getProperty('TRACK_SECRET') || d.secret !== props.getProperty('TRACK_SECRET')) return salida('clave');
  if (esPrueba(d.id)) return salida('prueba'); // propuestas de prueba: no cuentan ni avisan

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActive();
    let ap = ss.getSheetByName('aperturas');
    if (!ap) {
      ap = ss.insertSheet('aperturas');
      ap.appendRow(['fecha', 'propuesta_id', 'cliente', 'destino', 'evento', 'pantalla', 'dispositivo', 'ciudad']);
    }
    const fecha = new Date(d.fecha || Date.now());
    const NOMBRES = { abrio: 'Abrió la propuesta', vio_precio: 'Vio el precio', reservar: 'Tocó "Quiero reservar"', consulta: 'Tocó "Consultas" (WhatsApp)', pdf: 'Descargó el PDF' };
    ap.appendRow([Utilities.formatDate(fecha, 'America/Argentina/Cordoba', 'dd/MM/yyyy HH:mm'), d.id, d.cliente, d.destino, (NOMBRES[d.evento] || d.evento) + (d.opcion && (d.evento === 'reservar' || d.evento === 'consulta') ? ' · ' + d.opcion : ''), d.pantalla ? `${d.pantalla} de ${d.total}` : '', d.dispositivo || '', d.ciudad || '']);

    // visitas y última visita en "propuestas"
    let visitas = 0;
    if (d.evento === 'abrio') visitas = actualizarVisitas(d.id, fecha);
    if (d.evento === 'reservar' || d.evento === 'consulta') marcarEstado(d.id, 'En conversación', ['Reservada', 'Perdida']);

    // mail al asesor
    const cache = CacheService.getScriptCache();
    const clave = `aviso_${d.id}_${d.evento}`;
    const avisar = d.evento === 'reservar' || d.evento === 'consulta' || (d.evento === 'abrio' && !cache.get(clave));
    if (avisar) {
      if (d.evento === 'abrio') cache.put(clave, '1', MINUTOS_ENTRE_AVISOS * 60);
      const para = d.asesor_email || props.getProperty('AVISO_EMAIL') || Session.getEffectiveUser().getEmail();
      const asunto = d.evento === 'reservar'
        ? `🔥 ${d.cliente} tocó "Quiero reservar" · ${d.destino}${d.opcion ? ' (' + d.opcion + ')' : ''}`
        : d.evento === 'consulta' ? `💬 ${d.cliente} quiere hacer una consulta por WhatsApp · ${d.destino}`
        : `👀 ${d.cliente} abrió su propuesta de ${d.destino}${visitas > 1 ? ` (visita ${visitas})` : ''}`;
      const cuerpo = [
        asunto, '',
        `Propuesta: ${baseUrl()}/p/${d.id}`,
        `Desde: ${d.dispositivo}${d.ciudad ? ' · ' + d.ciudad : ''}`,
        `Hora: ${Utilities.formatDate(fecha, 'America/Argentina/Cordoba', 'dd/MM/yyyy HH:mm')}`,
        visitas ? `Visitas totales: ${visitas}` : '',
        (d.evento === 'reservar' || d.evento === 'consulta') ? '\nSe abrió WhatsApp con tu número: fijate si te escribió.' : ''
      ].filter(x => x !== '').join('\n');
      if (para && avisosMailActivos()) MailApp.sendEmail(para, asunto, cuerpo);
    }
  } finally {
    lock.releaseLock();
  }
  return salida('ok');
}

// Mails de aviso: solo si en la pestaña config avisos_mail = si
function avisosMailActivos() {
  try { return normTxt(configHoja().avisos_mail) === 'si'; } catch (e) { return false; }
}

function esPrueba(id) {
  if (!id) return false;
  const h = SpreadsheetApp.getActive().getSheetByName('propuestas'); if (!h) return false;
  const datos = h.getDataRange().getValues(); const enc = datos[0].map(String);
  const ci = enc.indexOf('id'), cp = enc.indexOf('prueba'); if (ci < 0 || cp < 0) return false;
  const fila = datos.find(r => String(r[ci]) === String(id));
  return !!fila && /^(si|sí|x|true)$/i.test(String(fila[cp]).trim());
}

function actualizarVisitas(id, fecha) {
  const hoja = hojaPorNombre('propuestas');
  const datos = hoja.getDataRange().getValues();
  const enc = datos[0].map(String);
  const cId = enc.indexOf('id'), cV = enc.indexOf('visitas'), cU = enc.indexOf('ultima_visita');
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cId]) === String(id)) {
      const v = (Number(datos[f][cV]) || 0) + 1;
      if (cV >= 0) hoja.getRange(f + 1, cV + 1).setValue(v);
      if (cU >= 0) hoja.getRange(f + 1, cU + 1).setValue(Utilities.formatDate(fecha, 'America/Argentina/Cordoba', 'dd/MM/yyyy HH:mm'));
      return v;
    }
  }
  return 0;
}

function salida(t) { return ContentService.createTextOutput(t); }

// ───────────────────────── Carga con IA ─────────────────────────
function abrirCargaIA() {
  const html = HtmlService.createHtmlOutputFromFile('CargaIA').setTitle('Cargar propuesta con IA');
  SpreadsheetApp.getUi().showSidebar(html);
}

function listarAsesores() {
  const h = SpreadsheetApp.getActive().getSheetByName('asesores');
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().map(r => String(r[0])).filter(Boolean);
}

const ICONOS = ['avion', 'escudo', 'bus', 'hotel', 'comida', 'excursion', 'auto', 'barco', 'check'];
const CLASES = ['Economy', 'Economy Classic', 'Economy Basic', 'Business'];
const REGIMENES = ['All inclusive 24 hs', 'All inclusive', 'Pensión completa', 'Media pensión', 'Desayuno', 'Solo alojamiento'];
const NO_FIGURA = 'No figura';

// Lee una pestaña como lista de objetos (encabezados en minúscula)
function leerTabla(nombre) {
  const h = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return [];
  const v = h.getDataRange().getValues();
  const enc = v[0].map(x => String(x).trim().toLowerCase());
  return v.slice(1).filter(r => r.some(x => String(x).trim() !== ''))
    .map(r => Object.fromEntries(enc.map((k, i) => [k, String(r[i] === undefined || r[i] === null ? '' : r[i]).trim()])));
}
// Pestaña "config": clave | valor
function configHoja() {
  return Object.fromEntries(leerTabla('config').filter(r => r.clave).map(r => [r.clave.toLowerCase(), r.valor]));
}
function baseUrl() {
  const v = String(configHoja().base_url || '').replace(/\/$/, '');
  return /^https:\/\/[^\s]+$/.test(v) ? v : BASE_URL;
}
function aeropuertosHoja() {
  const m = {};
  leerTabla('aeropuertos').forEach(r => { if (r.codigo) m[r.codigo.toUpperCase()] = { ciudad: r.ciudad, aeropuerto: r.aeropuerto }; });
  return m;
}
function planesHoja() {
  const m = {};
  leerTabla('asistencias').forEach(r => {
    if (!r.plan) return;
    const k = r.plan.toUpperCase();
    m[k] = m[k] || { plan: r.plan, empresa: r.empresa, coberturas: [] };
    if (r.etiqueta) m[k].coberturas.push({ etiqueta: r.etiqueta, valor: r.valor, orden: Number(r.orden) || 0 });
  });
  Object.values(m).forEach(p => p.coberturas.sort((a, b) => a.orden - b.orden));
  return m;
}

function esquemaIA(planes) {
  return {
    type: 'object',
    properties: {
      propuesta: {
        type: 'object',
        properties: {
          destino: { type: 'string', description: 'Destino principal, con tildes, ej: Isla Margarita, Nueva York y Miami' },
          fecha_desde: { type: 'string', description: 'Fecha de inicio del viaje YYYY-MM-DD' },
          fecha_hasta: { type: 'string', description: 'Fecha de regreso YYYY-MM-DD' },
          salida: { type: 'string', description: 'Ciudad de salida, ej: Córdoba' },
          salida_codigo: { type: 'string', description: 'Código IATA de la ciudad de salida, ej: COR' },
          asistencia_plan: { type: 'string', enum: planes.concat(['ninguno']), description: 'Código del plan de asistencia de la lista. Si el de la cotización no está en la lista o no figura: ninguno' },
          equipaje: {
            type: 'object', description: 'Solo lo que diga la cotización',
            properties: {
              valijas: { type: 'integer', description: 'Cantidad de valijas despachadas por pasajero (PC, piezas). 0 si no incluye' },
              kg_valija: { type: 'number', description: 'Kilos por valija, ej: 23' },
              kg_carry: { type: 'number', description: 'Kilos del equipaje de mano / carry on, ej: 10. 0 si no figura' }
            }
          },
          moneda: { type: 'string', description: 'USD, ARS, EUR' },
          sena: { type: 'number', description: 'Monto de la seña, si figura' },
          saldo: { type: 'number', description: 'Monto del saldo, si figura' },
          total: { type: 'number', description: 'Precio final total' },
          unidad: { type: 'string', description: 'A qué corresponde el precio, ej: por familia, por pareja, por persona en base doble' },
          nota: { type: 'string', description: 'Aclaración breve sobre el precio, si la hay' },
          busquedas_fotos: { type: 'array', items: { type: 'string' }, description: '3 o 4 búsquedas EN INGLÉS distintas para fotos del destino (playa, lugar emblemático, ciudad, actividad)' }
        },
        required: ['destino']
      },
      vuelos: {
        type: 'array', description: 'Un elemento por cada vuelo/segmento, en orden',
        items: {
          type: 'object',
          properties: {
            tramo: { type: 'string', enum: ['Ida', 'Vuelta', 'Interno'] },
            vuelo: { type: 'string', description: 'Código y número, ej: CM 0789' },
            fecha: { type: 'string', description: 'Fecha de salida del segmento YYYY-MM-DD' },
            sale_hora: { type: 'string', description: 'HH:MM 24 h' },
            sale_ciudad: { type: 'string' }, sale_codigo: { type: 'string' }, sale_aeropuerto: { type: 'string' },
            llega_hora: { type: 'string', description: 'HH:MM 24 h' },
            llega_ciudad: { type: 'string' }, llega_codigo: { type: 'string' }, llega_aeropuerto: { type: 'string' },
            llega_dias: { type: 'integer', description: '0 si llega el mismo día, 1 si llega al día siguiente' },
            clase: { type: 'string', enum: CLASES.concat([NO_FIGURA]) }
          },
          required: ['tramo', 'sale_hora', 'sale_codigo', 'llega_hora', 'llega_codigo']
        }
      },
      incluye: {
        type: 'array',
        items: { type: 'object', properties: { icono: { type: 'string', enum: ICONOS }, texto: { type: 'string' } }, required: ['icono', 'texto'] }
      },
      opciones: {
        type: 'array', description: 'Solo si la cotización ofrece VARIAS alternativas de hotel/categoría con precios distintos. Si hay un solo precio, vacío.',
        items: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'VACÍO salvo que la operadora le ponga una etiqueta especial (ej: Recomendada, Mejor precio). Nunca "Opción 1"' },
            hotel: { type: 'string' }, habitacion: { type: 'string' },
            regimen: { type: 'string', enum: REGIMENES.concat([NO_FIGURA]) },
            total: { type: 'number' }, sena: { type: 'number' }, saldo: { type: 'number' },
            unidad: { type: 'string' }
          },
          required: ['hotel']
        }
      },
      hoteles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ciudad: { type: 'string' }, nombre: { type: 'string' }, habitacion: { type: 'string' },
            regimen: { type: 'string', enum: REGIMENES.concat([NO_FIGURA]) },
            desde: { type: 'string', description: 'YYYY-MM-DD' }, hasta: { type: 'string', description: 'YYYY-MM-DD' }
          },
          required: ['nombre']
        }
      }
    },
    required: ['propuesta', 'vuelos', 'incluye', 'hoteles']
  };
}

function instruccionesIA(aeropuertos, planes) {
  const listaAer = Object.keys(aeropuertos).map(k => `${k} = ${aeropuertos[k].ciudad} · ${aeropuertos[k].aeropuerto}`).join('; ');
  const listaPlanes = Object.values(planes).map(p => `${p.plan}${p.empresa ? ' (' + p.empresa + ')' : ''}`).join(', ');
  return `Sos asistente de una agencia de viajes argentina. Te paso una cotización (PDF, captura o texto) de una operadora o sistema de reservas.
Extraé los datos para armar la propuesta al cliente y devolvelos con la herramienta guardar_propuesta.

REGLA PRINCIPAL: si un dato no figura o no se lee con claridad, dejalo vacío. No adivines ni completes con datos típicos.

Normalización (para que todas las propuestas queden iguales):
- Aeropuertos: si el código IATA está en esta lista, usá EXACTAMENTE esa ciudad y ese nombre de aeropuerto: ${listaAer || '(lista vacía)'}. Si no está, copiá el nombre como figura, con mayúscula inicial.
- Clase de vuelo: solo una de ${CLASES.join(', ')}. Si figura otra cosa o no figura: "${NO_FIGURA}".
- Régimen: solo uno de ${REGIMENES.join(', ')} (con esas tildes). Si no figura: "${NO_FIGURA}".
- Hoteles: nombre con mayúsculas y tildes correctas en español, no todo en mayúsculas (ej: "Riu República", no "RIU REPUBLICA").
- Equipaje: completá valijas, kg_valija y kg_carry solo con lo que diga la cotización.
- Asistencia al viajero: elegí el código del plan de esta lista: ${listaPlanes || '(lista vacía)'}. Si el plan de la cotización no está, "ninguno". No copies las coberturas.
- Opciones de hotel: título vacío salvo que la operadora indique algo especial (Recomendada, Mejor precio). Nunca "Opción 1" ni "Opción 2".

Formato:
- Fechas YYYY-MM-DD y horas HH:MM (24 h). Si el año no figura, deducilo por contexto (el viaje es a futuro).
- Vuelos: un elemento por segmento, en orden. Ida = "Ida", regreso = "Vuelta", vuelos entre destinos = "Interno". Si llega al día siguiente (+1), llega_dias = 1.
- "incluye": servicios incluidos, en frases cortas, con el ícono más adecuado (avion, escudo para asistencia, bus para traslados, hotel, comida para régimen, excursion, auto, barco, check para el resto).
- Montos como números sin símbolos ni separadores de miles.
- Si hay varias alternativas de hotel con distinto precio, cargalas en "opciones" y en "propuesta" poné el precio de la más económica.`;
}

// ── Normalización de lo que devuelve la IA ──
function normalizarRegimen(r) {
  const t = String(r || '').toLowerCase();
  if (!t || t === NO_FIGURA.toLowerCase()) return '';
  if (/all inclusive|todo incluido/.test(t)) return /24/.test(t) ? 'All inclusive 24 hs' : 'All inclusive';
  if (/pensi[oó]n completa|full board/.test(t)) return 'Pensión completa';
  if (/media pensi[oó]n|half board/.test(t)) return 'Media pensión';
  if (/desayuno|breakfast/.test(t)) return 'Desayuno';
  if (/solo aloj|room only|sin comida/.test(t)) return 'Solo alojamiento';
  return REGIMENES.includes(r) ? r : '';
}
function textoEquipaje(e) {
  if (!e) return '';
  const n = Number(e.valijas) || 0, kv = Number(e.kg_valija) || 0, kc = Number(e.kg_carry) || 0;
  const partes = [];
  if (n > 0) partes.push(`${n} valija${n > 1 ? 's' : ''}${kv ? ' de ' + kv + ' kg' : ''}`);
  if (kc > 0) partes.push(`carry on de ${kc} kg`);
  return partes.join(' + ');
}
function normalizarDatos(d, aeropuertos, planes) {
  const hora = h => /^\d{1,2}:\d{2}$/.test(String(h || '').trim()) ? String(h).trim().padStart(5, '0') : '';
  const dia = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '').trim()) ? String(f).trim() : '';
  (d.vuelos || []).forEach(v => {
    ['sale', 'llega'].forEach(lado => {
      const c = String(v[lado + '_codigo'] || '').trim().toUpperCase();
      v[lado + '_codigo'] = c;
      const a = aeropuertos[c];
      if (a) { if (a.ciudad) v[lado + '_ciudad'] = a.ciudad; if (a.aeropuerto) v[lado + '_aeropuerto'] = a.aeropuerto; }
    });
    v.sale_hora = hora(v.sale_hora); v.llega_hora = hora(v.llega_hora); v.fecha = dia(v.fecha);
    v.clase = CLASES.includes(v.clase) ? v.clase : '';
    v.llega_dias = Number(v.llega_dias) > 0 ? Number(v.llega_dias) : 0;
  });
  (d.hoteles || []).forEach(h => { h.regimen = normalizarRegimen(h.regimen); h.desde = dia(h.desde); h.hasta = dia(h.hasta); });
  (d.opciones || []).forEach(o => {
    o.regimen = normalizarRegimen(o.regimen);
    const t = String(o.titulo || '').trim();
    o.titulo = (/^(opci[oó]n|option)\s*\d*$/i.test(t) || t.toLowerCase() === String(o.hotel || '').toLowerCase()) ? '' : t;
  });
  const p = d.propuesta;
  p.fecha_desde = dia(p.fecha_desde); p.fecha_hasta = dia(p.fecha_hasta);
  p.equipaje = textoEquipaje(p.equipaje);
  const plan = planes[String(p.asistencia_plan || '').toUpperCase()];
  d.coberturas = plan ? plan.coberturas.map(c => ({ etiqueta: c.etiqueta, valor: c.valor })) : [];
  p.asistencia_nombre = plan ? [plan.empresa, plan.plan].filter(Boolean).join(' ') : '';
  delete p.asistencia_plan;
  return d;
}

function cargarConIA(entrada) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Falta la clave ANTHROPIC_API_KEY en las propiedades del script.');
  if (!entrada.base64 && !String(entrada.texto || '').trim()) throw new Error('Subí un archivo o pegá el texto de la cotización.');
  actualizarEstructura(true);
  const aeropuertos = aeropuertosHoja(), planes = planesHoja();

  const contenido = [];
  if (entrada.base64) {
    if (entrada.mime === 'application/pdf') {
      contenido.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: entrada.base64 } });
    } else if (/^image\/(png|jpeg|gif|webp)$/.test(entrada.mime)) {
      contenido.push({ type: 'image', source: { type: 'base64', media_type: entrada.mime, data: entrada.base64 } });
    } else {
      throw new Error('Formato no soportado. Usá PDF, PNG o JPG.');
    }
  }
  contenido.push({ type: 'text', text: instruccionesIA(aeropuertos, planes) + '\nRespondé únicamente llamando a la herramienta guardar_propuesta, sin texto adicional.' + (entrada.texto ? '\n\nTexto de la cotización:\n' + entrada.texto : '') });

  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: MODELO_IA,
      max_tokens: 8000,
      tools: [{ name: 'guardar_propuesta', description: 'Guarda los datos extraídos de la cotización', input_schema: esquemaIA(Object.values(planes).map(p => p.plan)) }],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: contenido }]
    })
  });
  const r = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() !== 200) throw new Error('Error de la IA: ' + (r.error && r.error.message || resp.getResponseCode()));
  const d = extraerDatos(r);
  if (!d || !d.propuesta) throw new Error('La IA no devolvió datos. Probá con otra captura o pegando el texto.');
  const busquedas = (d.propuesta.busquedas_fotos || []).slice(0, 4);
  delete d.propuesta.busquedas_fotos; delete d.propuesta.busqueda_fotos;
  normalizarDatos(d, aeropuertos, planes);

  // Escribir en el Sheet
  const id = idAleatorio(12);
  const link = `${baseUrl()}/p/${id}`;
  const prop = Object.assign({}, d.propuesta, {
    id, activa: 'si', cliente: entrada.cliente || '', asesor: entrada.asesor || '',
    mostrar_condiciones: 'si', link, etapa: entrada.etapa || '', vence: entrada.vence || '', estado: 'Enviada',
    prueba: entrada.prueba ? 'si' : ''
  });
  if (!prop.nota) prop.nota = 'Tarifa dinámica: el precio se confirma al reservar.';

  // Fotos: primero la biblioteca curada; la búsqueda en internet solo si la pestaña config lo permite
  const f = completarFotos(prop.destino, busquedas, d.hoteles || [], d.opciones || []);
  if (f.fotos.length) { prop.foto = f.fotos[0].url; prop.galeria = f.fotos.slice(1).map(x => x.url).join('\n'); }
  prop.creditos_fotos = f.creditos.some(Boolean) ? f.creditos.join('\n') : '';

  agregarFilas('propuestas', [prop]);
  agregarFilas('vuelos', (d.vuelos || []).map(v => Object.assign({ propuesta_id: id }, v)));
  agregarFilas('incluye', (d.incluye || []).map(v => Object.assign({ propuesta_id: id }, v)));
  agregarFilas('coberturas', (d.coberturas || []).map(v => Object.assign({ propuesta_id: id }, v)));
  agregarFilas('hoteles', (d.hoteles || []).map(v => Object.assign({ propuesta_id: id }, v)));
  if ((d.opciones || []).length > 1) agregarFilas('opciones', d.opciones.map(v => Object.assign({ propuesta_id: id }, v)));

  const avisos = [];
  if (!prop.asistencia_nombre) avisos.push('el plan de asistencia no está en la pestaña asistencias: cargá las coberturas a mano');
  if (!f.fotos.length) avisos.push(f.motivo);
  return {
    id, link,
    resumen: `${prop.destino || ''} · ${(d.vuelos || []).length} vuelos ·${(d.opciones || []).length > 1 ? ' ' + d.opciones.length + ' opciones ·' : ''} ${(d.hoteles || []).length} hotel(es) · ${(d.incluye || []).length} ítems incluidos · ${f.fotos.length ? f.fotos.length + ' fotos (' + f.origen + ')' : 'sin fotos'}${prop.prueba ? ' · marcada como PRUEBA' : ''}` +
      (avisos.length ? '<br><br><b>Revisá:</b> ' + avisos.join('; ') + '.' : '')
  };
}

// Toma los datos de la llamada a la herramienta; si la IA respondió con texto, busca el JSON en el texto
function extraerDatos(r) {
  const bloques = r.content || [];
  const uso = bloques.find(c => c.type === 'tool_use');
  if (uso) return uso.input;
  const texto = bloques.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(texto.slice(i, j + 1)); } catch (e) { return null; }
}

// Agrega filas respetando el orden de los encabezados de cada pestaña, todo como texto
function agregarFilas(nombre, objetos) {
  if (!objetos.length) return;
  const hoja = hojaPorNombre(nombre);
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  const filas = objetos.map(o => enc.map(h => (o[h] === undefined || o[h] === null) ? '' : String(o[h])));
  const desde = ultimaFilaConDatos(hoja) + 1;
  hoja.getRange(desde, 1, filas.length, enc.length).setNumberFormat('@').setValues(filas);
}

function ultimaFilaConDatos(hoja) {
  const col = hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 1), 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) if (String(col[i][0]).trim() !== '') return i + 1;
  return 1;
}

// ───────────────────────── Fotos automáticas ─────────────────────────
// Destino: Pexels (si hay PEXELS_API_KEY) o Wikimedia Commons (gratis, sin clave).
// Hotel: solo Wikimedia Commons y solo si la foto tiene el nombre del hotel (para no mostrar otro hotel).
// ───────────────────────── Fotos ─────────────────────────
// Orden de prioridad, para que no aparezcan fotos al azar:
//  1. Biblioteca curada (pestaña "fotos"): fotos elegidas por la agencia para cada destino y hotel.
//  2. Búsqueda en internet (Pexels / Wikimedia + selección con IA): solo si en "config" fotos_automaticas = si,
//     o cuando alguien usa a mano "Buscar fotos en internet".
//  3. Si no hay nada, la galería queda vacía para cargarla a mano.
// Cada foto lleva su crédito (autor / banco de imágenes / licencia), que se muestra en la propuesta.
const EXCLUIR = /\b(map|mapa|flag|bandera|escudo|coat of arms|logo|plano|diagram|catalog|catalogue|locator|svg|seal|bw|b&w|black and white|blanco y negro|monochrome|sepia|postcard|postal|historic|antigua)\b/i;
const normTxt = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const aFoto = x => typeof x === 'string' ? { url: x, credito: '' } : { url: x.url, credito: x.credito || '' };

// Varias fotos de la misma serie de Wikimedia ("..._01.jpg", "_02", "_03"): queda una sola
function serieFoto(u) {
  const s = String(u);
  if (!/wikimedia/.test(s)) return s;
  const nombre = decodeURIComponent(s.split('/').pop()).replace(/^\d+px-/, '').replace(/\.[a-z]+$/i, '');
  return nombre.replace(/[\s_\-]*\(?\d+\)?$/g, '').replace(/[\s_\-]*\(?\d+\)?$/g, '').toLowerCase();
}
function sinRepetidas(fotos) {
  const vistas = new Set();
  return fotos.map(aFoto).filter(f => { const k = serieFoto(f.url); if (!f.url || vistas.has(k)) return false; vistas.add(k); return true; });
}

// 1. Biblioteca: pestaña "fotos" (destino | tipo | url | credito). tipo = portada, galeria u hotel.
function fotosDeBiblioteca(nombre, tipos) {
  const n = normTxt(nombre);
  if (!n) return [];
  const filas = leerTabla('fotos').filter(r => r.url && r.destino && tipos.includes(normTxt(r.tipo || 'galeria')) && n.includes(normTxt(r.destino)));
  filas.sort((a, b) => (normTxt(a.tipo) === 'portada' ? 0 : 1) - (normTxt(b.tipo) === 'portada' ? 0 : 1));
  return sinRepetidas(filas.map(r => ({ url: r.url, credito: r.credito })));
}

// Completa las fotos de una propuesta (destino + hoteles/opciones). Devuelve las del destino y los créditos.
function completarFotos(destino, busquedas, hoteles, opciones, forzarInternet) {
  const auto = forzarInternet || normTxt(configHoja().fotos_automaticas) === 'si';
  let fotos = fotosDeBiblioteca(destino, ['portada', 'galeria']), origen = 'biblioteca';
  if (!fotos.length && auto) {
    try { fotos = buscarFotosDestino(busquedas && busquedas.length ? busquedas : [destino], destino, 7); origen = 'internet'; } catch (e) { console.warn(e); }
  }
  // un crédito por foto, en el mismo orden que portada + galería (después, los de los hoteles)
  const creditos = fotos.map(f => f.credito || '');
  hoteles.concat(opciones).forEach(h => {
    const nombre = h.nombre || h.hotel;
    let fh = fotosDeBiblioteca(nombre, ['hotel']);
    if (!fh.length && auto) { try { fh = buscarFotosHotel(nombre, h.ciudad || destino, 4); } catch (e) { console.warn(e); } }
    if (fh.length) { h.fotos = fh.map(x => x.url).join('\n'); fh.forEach(x => { if (x.credito && !creditos.includes(x.credito)) creditos.push(x.credito); }); }
  });
  return {
    fotos, origen, creditos,
    motivo: auto ? `no encontré fotos de ${destino}: cargalas a mano o agregalas a la biblioteca`
      : `no hay fotos de ${destino} en la biblioteca (pestaña fotos): cargalas a mano o usá "Buscar fotos en internet"`
  };
}

// 2. Internet: junta candidatas de varias búsquedas y la IA elige las mejores
function buscarFotosDestino(consultas, destino, cantidad) {
  consultas = [].concat(consultas || []).filter(Boolean);
  if (!consultas.length) consultas = [destino];
  const key = PropertiesService.getScriptProperties().getProperty('PEXELS_API_KEY');
  let fotos = [];
  if (key) {
    consultas.slice(0, 4).forEach(q => {
      try {
        const r = UrlFetchApp.fetch('https://api.pexels.com/v1/search?orientation=landscape&per_page=8&query=' + encodeURIComponent(q),
          { headers: { Authorization: key }, muteHttpExceptions: true });
        if (r.getResponseCode() === 200) fotos = fotos.concat((JSON.parse(r.getContentText()).photos || []).map(p => ({ url: p.src.large2x || p.src.large, credito: `${p.photographer} / Pexels` })));
      } catch (e) { console.warn('Pexels: ' + e.message); }
    });
  }
  if (fotos.length < 12) consultas.slice(0, 4).concat(destino).forEach(q => { fotos = fotos.concat(buscarWikimedia(q, 6)); });
  return elegirFotosConIA(sinRepetidas(fotos), destino, cantidad);
}

// La IA mira las candidatas (en tamaño chico) y devuelve las mejores, la portada primero.
const MODELO_FOTOS = 'claude-haiku-5-5';
function miniatura(u) {
  return String(u).replace(/(wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)\d+px-/, '$1500px-').replace(/([?&])width=1600/, '$1width=500').replace('dpr=2', 'dpr=1').replace(/([?&])w=\d+/, '$1w=500');
}
function imagenParaIA(u) {
  const mini = miniatura(u);
  try {
    const r = UrlFetchApp.fetch(mini, { muteHttpExceptions: true, followRedirects: true });
    const tipo = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '').split(';')[0];
    const bytes = r.getContent();
    if (r.getResponseCode() === 200 && /^image\/(jpeg|png|webp|gif)$/.test(tipo) && bytes.length < 1500000)
      return { type: 'image', source: { type: 'base64', media_type: tipo, data: Utilities.base64Encode(bytes) } };
  } catch (e) { console.warn('Miniatura: ' + e.message); }
  return { type: 'image', source: { type: 'url', url: mini } };
}
function elegirFotosConIA(candidatas, destino, cantidad) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const lista = candidatas.slice(0, 20);
  if (!key || lista.length <= 2) return lista.slice(0, cantidad);
  const contenido = [];
  lista.forEach((f, i) => { contenido.push({ type: 'text', text: `Foto ${i + 1}:` }); contenido.push(imagenParaIA(f.url)); });
  contenido.push({ type: 'text', text: `Sos editora de fotos de una agencia de viajes. Elegí hasta ${cantidad} fotos para la propuesta de viaje a ${destino} que va a ver un cliente.
Criterios:
- Tienen que mostrar ${destino} de verdad (si una foto parece de otro lugar, o no se puede saber, descartala).
- Lindas y luminosas, estilo folleto de viajes: cielo, mar, paisajes, lugares emblemáticos, calles con color.
- Variedad: no repitas la misma vista ni la misma playa; combiná playa, paisaje, ciudad o arquitectura y alguna actividad.
- Descartá SIEMPRE las fotos en blanco y negro o sepia (aunque sean lindas), y las casi iguales entre sí (misma escena, mismo encuadre: quedate con una). También mapas, carteles, documentos, fotos borrosas, oscuras o antiguas, primeros planos de personas, interiores sin interés y fotos de baja calidad.
- La primera es la portada: la más impactante, bien horizontal y sin texto.
Si hay pocas buenas, elegí menos: mejor pocas lindas que muchas malas.
Respondé solo llamando a la herramienta elegir_fotos.` });
  try {
    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: MODELO_FOTOS, max_tokens: 1000,
        tools: [{ name: 'elegir_fotos', description: 'Devuelve los números de las fotos elegidas, en orden', input_schema: { type: 'object', properties: { orden: { type: 'array', items: { type: 'integer' }, description: 'Números de foto elegidos; el primero es la portada' } }, required: ['orden'] } }],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: contenido }]
      })
    });
    if (resp.getResponseCode() !== 200) { DIAG_FOTOS += ' · IA fotos: ' + resp.getResponseCode(); return lista.slice(0, cantidad); }
    const d = extraerDatos(JSON.parse(resp.getContentText())) || {};
    const elegidas = [];
    (d.orden || []).forEach(n => { const f = lista[Number(n) - 1]; if (f && !elegidas.includes(f)) elegidas.push(f); });
    return elegidas.length ? elegidas.slice(0, cantidad) : lista.slice(0, cantidad);
  } catch (e) {
    DIAG_FOTOS += ' · IA fotos: ' + e.message;
    return lista.slice(0, cantidad);
  }
}

function buscarFotosHotel(nombre, ciudad, cantidad) {
  if (!nombre) return [];
  return buscarWikimedia(`${nombre} ${ciudad || ''}`, cantidad, nombre).slice(0, cantidad);
}

let DIAG_FOTOS = '';

// Primero pide las fotos a tu sitio de Vercel (/api/fotos), que consulta Wikimedia y trae autor y licencia.
// Si no responde, intenta directo desde Google.
function buscarWikimedia(consulta, max, nombreHotel) {
  const secret = PropertiesService.getScriptProperties().getProperty('TRACK_SECRET') || '';
  try {
    const u = `${baseUrl().replace(/\/a\/[^/]+$/, '')}/api/fotos?max=${max}&q=${encodeURIComponent(consulta)}` + (nombreHotel ? `&nombre=${encodeURIComponent(nombreHotel)}` : '');
    const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: { 'x-secret': secret } });
    const j = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() === 200 && Array.isArray(j.fotos)) return j.fotos.map(aFoto);
    DIAG_FOTOS = `sitio: ${r.getResponseCode()} ${j.error || ''}`;
  } catch (e) { DIAG_FOTOS = 'sitio: ' + e.message; }
  // Plan B: directo a Wikimedia
  const palabras = nombreHotel ? normTxt(nombreHotel).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['hotel', 'resort', 'the', 'and', 'spa'].includes(w)) : [];
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=' + Math.min(max * 3, 50) +
    '&gsrsearch=' + encodeURIComponent(consulta + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=1920';
  try {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { DIAG_FOTOS += ` · Wikimedia: ${r.getResponseCode()}`; return []; }
    const pages = Object.values((JSON.parse(r.getContentText()).query || {}).pages || {}).sort((a, b) => a.index - b.index);
    return sinRepetidas(pages.filter(p => {
      const ii = (p.imageinfo || [])[0];
      if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) return false;
      const ratio = ii.width / ii.height;
      if (ii.width < 1200 || ratio < 1.2 || ratio > 2.2) return false;
      if (EXCLUIR.test(p.title)) return false;
      return palabras.length ? palabras.every(w => normTxt(p.title).includes(w)) : true;
    }).map(p => {
      const ii = p.imageinfo[0], m = ii.extmetadata || {};
      const autor = String((m.Artist && m.Artist.value) || '').replace(/<[^>]*>/g, '').trim();
      const lic = String((m.LicenseShortName && m.LicenseShortName.value) || '').trim();
      return { url: ii.thumburl, credito: `${autor || 'Autor desconocido'} / Wikimedia Commons${lic ? ' (' + lic + ')' : ''}` };
    })).slice(0, max);
  } catch (e) { DIAG_FOTOS += ' · Wikimedia: ' + e.message; return []; }
}

// Menú: completa las fotos de la fila seleccionada (biblioteca primero, después internet)
function fotosFilaSeleccionada() { completarFotosFila(false); }
function fotosInternetFilaSeleccionada() { completarFotosFila(true); }
function completarFotosFila(internet) {
  const ui = SpreadsheetApp.getUi();
  const hoja = SpreadsheetApp.getActiveSheet();
  if (hoja.getName() !== 'propuestas') { ui.alert('Seleccioná una fila en la pestaña "propuestas".'); return; }
  const fila = hoja.getActiveRange().getRow();
  if (fila < 2) return;
  actualizarEstructura(true);
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  const val = hoja.getRange(fila, 1, 1, enc.length).getValues()[0];
  const get = k => val[enc.indexOf(k)];
  if ((get('foto') || get('galeria')) && ui.alert('Esta propuesta ya tiene fotos. ¿Reemplazarlas?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const dest = get('destino'), id = String(get('id'));
  // hoteles y opciones sin fotos de esta propuesta
  const filasHotel = [];
  ['hoteles', 'opciones'].forEach(n => {
    const h = SpreadsheetApp.getActive().getSheetByName(n);
    if (!h || h.getLastRow() < 2) return;
    const eh = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
    h.getRange(2, 1, h.getLastRow() - 1, eh.length).getValues().forEach((r, k) => {
      if (String(r[eh.indexOf('propuesta_id')]) !== id || r[eh.indexOf('fotos')]) return;
      filasHotel.push({ hoja: h, fila: k + 2, col: eh.indexOf('fotos') + 1, nombre: r[eh.indexOf(n === 'hoteles' ? 'nombre' : 'hotel')], ciudad: eh.includes('ciudad') ? r[eh.indexOf('ciudad')] : '' });
    });
  });
  const objs = filasHotel.map(x => ({ nombre: x.nombre, ciudad: x.ciudad }));
  const f = completarFotos(dest, internet ? [dest + ' beach', dest + ' landmark', dest + ' city', dest + ' landscape'] : [], objs, [], internet);
  if (!f.fotos.length && !objs.some(o => o.fotos)) { ui.alert('No encontré fotos: ' + f.motivo + '.' + (DIAG_FOTOS ? '\n\nDetalle técnico: ' + DIAG_FOTOS : '')); return; }
  if (f.fotos.length) {
    hoja.getRange(fila, enc.indexOf('foto') + 1).setValue(f.fotos[0].url);
    hoja.getRange(fila, enc.indexOf('galeria') + 1).setValue(f.fotos.slice(1).map(x => x.url).join('\n'));
  }
  hoja.getRange(fila, enc.indexOf('creditos_fotos') + 1).setValue(f.creditos.some(Boolean) ? f.creditos.join('\n') : '');
  let nHotel = 0;
  filasHotel.forEach((x, i) => { if (objs[i].fotos) { x.hoja.getRange(x.fila, x.col).setValue(objs[i].fotos); nHotel++; } });
  ui.alert(`Listo: ${f.fotos.length} fotos del destino (${f.origen})` + (nHotel ? ` y fotos para ${nHotel} hotel(es).` : '. Los hoteles sin fotos se completan a mano o desde la biblioteca.'));
}

// Menú: guarda las fotos de la fila seleccionada en la biblioteca, para reusarlas en próximas propuestas
function guardarEnBiblioteca() {
  const ui = SpreadsheetApp.getUi();
  const get = filaSeleccionada();
  actualizarEstructura(true);
  const dest = String(get('destino') || '').trim();
  if (!dest) { ui.alert('La fila no tiene destino.'); return; }
  const urls = [get('foto')].concat(String(get('galeria') || '').split(/\s*\n\s*|,(?=\s*https?:)/)).map(x => String(x || '').trim()).filter(x => /^https?:/.test(x));
  if (!urls.length) { ui.alert('La fila no tiene fotos.'); return; }
  const creditos = String(get('creditos_fotos') || '').split('\n');
  const yaEstan = new Set(leerTabla('fotos').map(r => r.url));
  const nuevas = urls.filter(u => !yaEstan.has(u)).map(u => ({ destino: dest, tipo: u === get('foto') ? 'portada' : 'galeria', url: u, credito: creditos[urls.indexOf(u)] || '' }));
  agregarFilas('fotos', nuevas);
  ui.alert(nuevas.length ? `Guardé ${nuevas.length} foto(s) de "${dest}" en la biblioteca. Las próximas propuestas a ${dest} las van a usar solas.` : 'Esas fotos ya estaban en la biblioteca.');
}

// ───────────────────────── Estructura del Sheet ─────────────────────────
// Agrega las columnas y pestañas nuevas sin tocar los datos existentes.
const ESTADOS = ['Enviada', 'En conversación', 'Reservada', 'Perdida'];
const SEMILLA_CONFIG = [
  ['base_url', 'https://agtravels.vercel.app', 'Dirección de las propuestas de esta agencia, sin barra al final. Con dominio propio: https://propuestas.tuagencia.com. Sin dominio: https://<sitio>/a/<clave>'],
  ['favicon_url', '', 'Ícono de la pestaña del navegador (PNG cuadrado, URL https://). Vacío = sin ícono si cambiaste "agencia"'],
  ['agencia', 'AG Travel', 'Nombre que aparece en las propuestas y en el PDF'],
  ['logo_url', '', 'Logo blanco con fondo transparente (URL que empiece con https:// o /). Vacío = el del sitio, o el nombre escrito si cambiaste "agencia"'],
  ['color_fondo', '#8A5A2B', 'Color principal (hex)'],
  ['color_fondo2', '#A8743D', 'Segundo tono del fondo (hex)'],
  ['color_acento', '#F4E1C1', 'Botones y precio destacado (hex)'],
  ['whatsapp', '', 'WhatsApp de la agencia (si la propuesta no tiene asesor). Formato 549...'],
  ['legajo', '', 'Número de legajo de agencia de viajes'],
  ['avisos_mail', 'no', 'si = mandar mails al asesor (abrió, quiere reservar, recordatorios). no = no se manda ningún mail; las aperturas se siguen registrando en el Sheet'],
  ['fotos_automaticas', 'no', 'si = si un destino no está en la biblioteca de fotos, buscarlas en internet al cargar con IA. no = dejar la galería vacía']
];
const SEMILLA_AEROPUERTOS = [
  ['COR', 'Córdoba', 'Ing. Taravella'], ['AEP', 'Buenos Aires', 'Aeroparque'], ['EZE', 'Buenos Aires', 'Ezeiza'], ['MDZ', 'Mendoza', 'El Plumerillo'],
  ['BRC', 'Bariloche', 'Teniente Candelaria'], ['IGR', 'Puerto Iguazú', 'Cataratas del Iguazú'], ['FTE', 'El Calafate', 'Comandante Armando Tola'],
  ['USH', 'Ushuaia', 'Malvinas Argentinas'], ['SLA', 'Salta', 'Martín Miguel de Güemes'],
  ['PTY', 'Panamá', 'Tocumen'], ['PUJ', 'Punta Cana', 'Punta Cana Intl'], ['SDQ', 'Santo Domingo', 'Las Américas'],
  ['AUA', 'Aruba', 'Reina Beatrix'], ['CUR', 'Curazao', 'Hato'], ['PMV', 'Isla Margarita', 'Santiago Mariño'],
  ['CUN', 'Cancún', 'Cancún Intl'], ['MEX', 'Ciudad de México', 'Benito Juárez'], ['HAV', 'La Habana', 'José Martí'], ['VRA', 'Varadero', 'Juan Gualberto Gómez'],
  ['MIA', 'Miami', 'Miami Intl'], ['MCO', 'Orlando', 'Orlando Intl'], ['JFK', 'Nueva York', 'John F. Kennedy'], ['EWR', 'Nueva York', 'Newark'],
  ['GRU', 'San Pablo', 'Guarulhos'], ['GIG', 'Río de Janeiro', 'Galeão'], ['FLN', 'Florianópolis', 'Hercílio Luz'], ['SSA', 'Salvador de Bahía', 'Luís Eduardo Magalhães'],
  ['MCZ', 'Maceió', 'Zumbi dos Palmares'], ['REC', 'Recife', 'Guararapes'], ['NAT', 'Natal', 'São Gonçalo do Amarante'],
  ['SCL', 'Santiago de Chile', 'Arturo Merino Benítez'], ['LIM', 'Lima', 'Jorge Chávez'], ['BOG', 'Bogotá', 'El Dorado'], ['CTG', 'Cartagena', 'Rafael Núñez'],
  ['ADZ', 'San Andrés', 'Gustavo Rojas Pinilla'], ['MVD', 'Montevideo', 'Carrasco'], ['PDP', 'Punta del Este', 'Capitán Curbelo'],
  ['MAD', 'Madrid', 'Barajas'], ['BCN', 'Barcelona', 'El Prat'], ['FCO', 'Roma', 'Fiumicino'], ['CDG', 'París', 'Charles de Gaulle']
];
// Planes de ejemplo: los valores salen de cotizaciones de prueba. Verificalos con las condiciones reales de cada empresa.
const SEMILLA_ASISTENCIAS = [
  ['UA 100', 'Universal Assistance', 'Asistencia médica', 'USD 100.000', 1], ['UA 100', 'Universal Assistance', 'Preexistencias', 'USD 2.000', 2],
  ['UA 100', 'Universal Assistance', 'Cancelación', 'USD 2.500 multicausa', 3], ['UA 100', 'Universal Assistance', 'Pérdida de equipaje', 'USD 1.200', 4],
  ['UA 100', 'Universal Assistance', 'Medicamentos', 'USD 800', 5], ['UA 100', 'Universal Assistance', 'Odontología', 'USD 600', 6],
  ['UA 100', 'Universal Assistance', 'Zona', 'Mundial, excepto país de residencia', 7],
  ['AC 150', 'Assist Card', 'Asistencia médica', 'USD 150.000', 1], ['AC 150', 'Assist Card', 'Preexistencias', 'USD 1.500', 2],
  ['AC 150', 'Assist Card', 'Cancelación', 'USD 3.000 multicausa', 3], ['AC 150', 'Assist Card', 'Pérdida de equipaje', 'USD 1.200', 4],
  ['AC 150', 'Assist Card', 'Medicamentos', 'USD 1.000', 5], ['AC 150', 'Assist Card', 'Odontología', 'USD 800', 6],
  ['AC 150', 'Assist Card', 'Zona', 'Mundial, excepto país de residencia', 7],
  ['AC 250', 'Assist Card', 'Asistencia médica', 'USD 250.000', 1], ['AC 250', 'Assist Card', 'Preexistencias', 'USD 3.000', 2],
  ['AC 250', 'Assist Card', 'Cancelación', 'USD 4.000 multicausa', 3], ['AC 250', 'Assist Card', 'Pérdida de equipaje', 'USD 1.500', 4],
  ['AC 250', 'Assist Card', 'Medicamentos', 'USD 1.500', 5], ['AC 250', 'Assist Card', 'Odontología', 'USD 800', 6],
  ['AC 250', 'Assist Card', 'Zona', 'Mundial, excepto país de residencia', 7]
];
function actualizarEstructura(silencioso) {
  const ss = SpreadsheetApp.getActive();
  const asegurar = (nombre, cols, semilla) => {
    let h = ss.getSheetByName(nombre);
    if (!h) {
      h = ss.insertSheet(nombre);
      h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); h.setFrozenRows(1);
      h.getRange(2, 1, 499, cols.length).setNumberFormat('@');
      if (semilla && semilla.length) h.getRange(2, 1, semilla.length, cols.length).setValues(semilla.map(r => r.map(String)));
      return h;
    }
    const enc = h.getRange(1, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0].map(String);
    const faltan = cols.filter(c => !enc.includes(c));
    if (faltan.length) {
      const desde = enc.filter(Boolean).length + 1;
      h.getRange(1, desde, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
      h.getRange(2, desde, 499, faltan.length).setNumberFormat('@');
    }
    return h;
  };
  const p = asegurar('propuestas', ['vence', 'estado', 'seguimiento', 'equipaje', 'creditos_fotos', 'prueba']);
  const enc = p.getRange(1, 1, 1, p.getLastColumn()).getValues()[0].map(String);
  const val = (col, lista) => { const c = enc.indexOf(col) + 1; if (c > 0) p.getRange(2, c, 499, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build()); };
  val('estado', ESTADOS); val('prueba', ['si', 'no']);
  asegurar('opciones', ['propuesta_id', 'titulo', 'hotel', 'habitacion', 'regimen', 'total', 'sena', 'saldo', 'unidad', 'fotos', 'destacada']);
  const hc = asegurar('config', ['clave', 'valor', 'descripcion'], SEMILLA_CONFIG);
  const claves = hc.getLastRow() > 1 ? hc.getRange(2, 1, hc.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  const faltanClaves = SEMILLA_CONFIG.filter(r => !claves.includes(r[0]));
  if (faltanClaves.length) hc.getRange(hc.getLastRow() + 1, 1, faltanClaves.length, 3).setValues(faltanClaves);
  asegurar('aeropuertos', ['codigo', 'ciudad', 'aeropuerto'], SEMILLA_AEROPUERTOS);
  asegurar('asistencias', ['plan', 'empresa', 'etiqueta', 'valor', 'orden'], SEMILLA_ASISTENCIAS);
  asegurar('fotos', ['destino', 'tipo', 'url', 'credito']);
  if (!silencioso) SpreadsheetApp.getActive().toast('Columnas y pestañas al día');
}

function marcarEstado(id, estado, noPisar) {
  const hoja = hojaPorNombre('propuestas');
  const datos = hoja.getDataRange().getValues();
  const enc = datos[0].map(String);
  const cId = enc.indexOf('id'), cE = enc.indexOf('estado');
  if (cE < 0) return;
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cId]) === String(id)) {
      if (!(noPisar || []).includes(String(datos[f][cE]))) hoja.getRange(f + 1, cE + 1).setValue(estado);
      return;
    }
  }
}

// ───────────────────────── Recordatorios de seguimiento ─────────────────────────
// Corre solo cada hora (entre 9 y 20 h). Avisa al asesor:
//  · si el cliente abrió la propuesta hace 48 h o más y no tocó Reservar ni Consultas
//  · si el precio vence mañana (o hoy) y la propuesta no está Reservada ni Perdida
// Para no avisar más de esa propuesta, poné el estado en "En conversación", "Reservada" o "Perdida".
function activarRecordatorios() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'revisarSeguimientos').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarSeguimientos').timeBased().everyHours(1).create();
  actualizarEstructura(true);
  SpreadsheetApp.getUi().alert('Recordatorios activados: el script revisa las propuestas cada hora, de 9 a 20 h.');
}

function revisarSeguimientosManual() {
  if (!avisosMailActivos()) { SpreadsheetApp.getUi().alert('Los avisos por mail están apagados (pestaña config → avisos_mail = no).'); return; }
  const n = revisarSeguimientos(true);
  SpreadsheetApp.getUi().alert(n ? `Se enviaron ${n} recordatorio(s).` : 'No hay propuestas que necesiten seguimiento ahora.');
}

function aFechaAR(t) {
  if (t instanceof Date) return t;
  let m = String(t || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}:00-03:00`);
  m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00-03:00`);
  return null;
}

function revisarSeguimientos(forzar) {
  if (!avisosMailActivos()) return 0; // avisos por mail apagados en config
  const hora = Number(Utilities.formatDate(new Date(), 'America/Argentina/Cordoba', 'H'));
  if (forzar !== true && (hora < 9 || hora >= 20)) return 0;
  const ss = SpreadsheetApp.getActive();
  const hp = ss.getSheetByName('propuestas'); if (!hp) return 0;
  const datos = hp.getDataRange().getValues();
  const enc = datos[0].map(String);
  const col = k => enc.indexOf(k);
  if (col('seguimiento') < 0) { actualizarEstructura(true); return revisarSeguimientos(forzar); }

  // eventos por propuesta
  const ev = {};
  const ap = ss.getSheetByName('aperturas');
  if (ap && ap.getLastRow() > 1) {
    ap.getRange(2, 1, ap.getLastRow() - 1, 5).getValues().forEach(r => {
      const id = String(r[1]); if (!id) return;
      const f = aFechaAR(r[0]); const e = String(r[4]);
      ev[id] = ev[id] || { primera: null, respondio: false };
      if (/^Abrió/.test(e) && f && (!ev[id].primera || f < ev[id].primera)) ev[id].primera = f;
      if (/reservar|Consultas/i.test(e)) ev[id].respondio = true;
    });
  }
  // emails de asesores
  const mails = {};
  const ha = ss.getSheetByName('asesores');
  if (ha && ha.getLastRow() > 1) ha.getRange(2, 1, ha.getLastRow() - 1, 4).getValues().forEach(r => { if (r[0]) mails[String(r[0])] = String(r[3] || ''); });
  const props = PropertiesService.getScriptProperties();
  const porDefecto = props.getProperty('AVISO_EMAIL') || Session.getEffectiveUser().getEmail();

  const ahora = new Date();
  let enviados = 0;
  for (let f = 1; f < datos.length; f++) {
    const r = datos[f];
    const id = String(r[col('id')] || ''); if (!id) continue;
    if (String(r[col('activa')] || 'si').toLowerCase() === 'no') continue;
    if (col('prueba') >= 0 && /^(si|sí|x|true)$/i.test(String(r[col('prueba')]).trim())) continue;
    const estado = String(r[col('estado')] || '');
    if (['En conversación', 'Reservada', 'Perdida'].includes(estado)) continue;
    const seg = String(r[col('seguimiento')] || '');
    const cliente = r[col('cliente')], destino = r[col('destino')], link = r[col('link')] || `${baseUrl()}/p/${id}`;
    const para = mails[String(r[col('asesor')])] || porDefecto;
    const avisos = [];

    const e = ev[id];
    if (e && e.primera && !e.respondio && !/48h/.test(seg) && ahora - e.primera >= 48 * 3600 * 1000) {
      const dias = Math.floor((ahora - e.primera) / 864e5);
      avisos.push({ marca: '48h', asunto: `⏰ Seguimiento: ${cliente} vio ${destino} hace ${dias} días y no escribió`,
        cuerpo: `${cliente} abrió la propuesta de ${destino} el ${Utilities.formatDate(e.primera, 'America/Argentina/Cordoba', 'dd/MM HH:mm')} y todavía no tocó "Reservar" ni "Consultas".\nVisitas: ${r[col('visitas')] || 1}\n\nEs un buen momento para escribirle.\n${link}` });
    }
    const v = aFechaAR(r[col('vence')]);
    if (v && !/vence/.test(seg)) {
      const finDia = new Date(v.getTime() + (24 * 3600 - 1) * 1000);
      const resta = finDia - ahora;
      if (resta > 0 && resta <= 36 * 3600 * 1000) {
        avisos.push({ marca: 'vence', asunto: `⌛ La propuesta de ${cliente} (${destino}) vence ${resta <= 24 * 3600 * 1000 ? 'hoy' : 'mañana'}`,
          cuerpo: `El precio de la propuesta de ${destino} para ${cliente} vence el ${Utilities.formatDate(v, 'America/Argentina/Cordoba', 'dd/MM')}.\n${e && e.primera ? `La abrió ${r[col('visitas')] || 1} vez/veces.` : 'Todavía no la abrió.'}\n\nAvisale antes de que venza o actualizá la fecha.\n${link}` });
      }
    }
    if (!avisos.length) continue;
    avisos.forEach(a => { if (para) MailApp.sendEmail(para, a.asunto, a.cuerpo); enviados++; });
    const nuevo = (seg ? seg + ' · ' : '') + avisos.map(a => a.marca + ' ' + Utilities.formatDate(ahora, 'America/Argentina/Cordoba', 'dd/MM')).join(' · ');
    hp.getRange(f + 1, col('seguimiento') + 1).setValue(nuevo);
  }
  return enviados;
}

// ───────────────────────── Utilidades ─────────────────────────
function hojaPorNombre(n) {
  const h = SpreadsheetApp.getActive().getSheetByName(n);
  if (!h) throw new Error(`No existe la pestaña "${n}".`);
  return h;
}

function idAleatorio(largo) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < largo; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
