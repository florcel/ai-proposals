// Genera demo.html estático con la primera propuesta de data/demo.json
import { writeFile, readFile } from 'node:fs/promises';
import { renderPropuesta } from '../lib/render.js';
const raw = JSON.parse(await readFile(new URL("../data/demo.json", import.meta.url), "utf8"));
const datos = raw.propuestas.map(p => ({ ...p, condiciones: raw.condiciones }));
const id = process.argv[2] || datos[0].id;
await writeFile(process.argv[3] || 'demo.html', renderPropuesta(datos.find(p => p.id === id)));
console.log('demo.html generado para', id);
