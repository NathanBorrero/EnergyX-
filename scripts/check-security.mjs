/**
 * Comprobaciones de seguridad del theme.
 *
 * DÓNDE ESTÁ LA SUPERFICIE DE VERDAD
 *
 * Shopify es dueño de la autenticación, del pago y de los datos personales, así
 * que este theme no guarda credenciales, no valida contraseñas y no toca
 * tarjetas. Lo que sí puede hacer mal, y es lo único que importa aquí:
 *
 *   1. EMITIR TEXTO DE OTRO SIN ESCAPAR. **Liquid no escapa por defecto.** Un
 *      `{{ }}` con texto que escribe una persona es una inyección esperando a
 *      ocurrir, y el caso grave es el que viene de un parámetro de URL —el
 *      término de búsqueda—, porque lo controla cualquiera que consiga que
 *      alguien abra un enlace.
 *
 *   2. ROMPER UN BLOQUE JSON. Un valor sin `| json` dentro de un `<script>` de
 *      datos no da un dato peor: da ninguno, porque el parseo falla.
 *
 *   3. ABRIR UNA VENTANA SIN AISLARLA, o traer código de un tercero.
 *
 *   4. FILTRAR UN SECRETO en un archivo que se sirve al navegador. Todo lo que
 *      hay en `theme/` es público: lo descarga cualquiera.
 *
 * POR QUÉ NO SE COMPRUEBA «TODO `{{ }}` DEBE LLEVAR ESCAPE»
 *
 * Porque daría sesenta avisos de los que cincuenta y nueve serían ruido —URLs
 * que genera Shopify, ids de sección, enums, números— y una comprobación con
 * ese ruido se desactiva a la semana. Se comprueba lo que de verdad puede
 * contener una comilla: TEXTO QUE ESCRIBE UNA PERSONA.
 *
 *   node scripts/check-security.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(ROOT, 'theme');

/** @type {{name: string, problems: string[], notes: string[]}[]} */
const results = [];

/**
 * @param {string} name
 * @param {() => Promise<string[]|{problems: string[], notes: string[]}>} fn
 */
async function check(name, fn) {
  try {
    const out = (await fn()) ?? [];
    if (Array.isArray(out)) results.push({ name, problems: out, notes: [] });
    else results.push({ name, problems: out.problems ?? [], notes: out.notes ?? [] });
  } catch (error) {
    results.push({ name, problems: [`lanzó: ${error instanceof Error ? error.message : String(error)}`], notes: [] });
  }
}

/** @param {string} dir */
async function walk(dir, match) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, match)));
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p);

/** Liquid sin comentarios: documentar un riesgo no puede contar como correrlo. */
function code(source) {
  return source.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
}

const liquid = new Map();
for (const f of await walk(THEME, /\.liquid$/)) liquid.set(f, code(await readFile(f, 'utf8')));

/**
 * Fuentes de TEXTO LIBRE: lo escribe una persona y puede traer comillas, `<`
 * o `>`. `search.terms` y `request.path` los controla un VISITANTE; el resto,
 * el comerciante desde el admin.
 *
 * La lista es explícita a propósito. Una heurística del tipo «todo lo que no
 * reconozca» produce ruido, y una comprobación con ruido se desactiva.
 */
const FREE_TEXT = new RegExp(
  '\\b(' +
    'search\\.terms|request\\.path|' +
    'shop\\.(?:name|description|phone|address[a-z_.]*)|' +
    '(?:section|block)\\.settings\\.[a-z_]+|' +
    '[a-z_]*\\.(?:title|alt|label|vendor|name|description|note|caption|content|excerpt|author)' +
  ')\\b',
);

/** Filtros que dejan el valor seguro para el contexto donde se emite. */
const ESCAPING = /\|\s*(escape|escape_once|url_encode|json|handle|md5|t)\b/;

// ---------------------------------------------------------------------------
// 1 · Texto de una persona dentro de un atributo HTML.
// ---------------------------------------------------------------------------
await check('texto libre escapado en atributos', () => {
  const problems = [];
  for (const [file, source] of liquid) {
    for (const m of source.matchAll(/\s([a-zA-Z-]+)\s*=\s*"([^"]*\{\{[^"]*)"/g)) {
      const [, attr, value] = m;
      for (const tag of value.matchAll(/\{\{-?(.*?)-?\}\}/g)) {
        const expression = tag[1].trim();
        if (!FREE_TEXT.test(expression)) continue;
        if (ESCAPING.test(expression)) continue;
        problems.push(
          `${rel(file)}: ${attr}="{{ ${expression} }}" emite texto de una persona sin escapar; una comilla rompe el atributo`,
        );
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 2 · Texto de una persona interpolado en una traducción.
//
//     El caso grave del theme: el término de búsqueda viene de la URL. La
//     documentación de Shopify NO dice si el filtro `t` escapa lo que
//     interpola, y su propio ejemplo lo emite sin escapar. Un control de
//     seguridad no se apoya en un comportamiento sin verificar.
// ---------------------------------------------------------------------------
await check('texto libre escapado antes de interpolarlo en una traducción', () => {
  const problems = [];
  for (const [file, source] of liquid) {
    for (const m of source.matchAll(/\{\{-?\s*'[^']+'\s*\|\s*t:([^}]*)\}\}/g)) {
      for (const arg of m[1].matchAll(/[a-z_]+\s*:\s*([^,}]+)/g)) {
        const value = arg[1].trim();
        if (!FREE_TEXT.test(value)) continue;
        if (ESCAPING.test(value)) continue;
        problems.push(
          `${rel(file)}: \`t: ... ${value}\` interpola texto de una persona sin escapar en una cadena que se emite cruda`,
        );
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 3 · Bloques de datos JSON: todo valor por `| json`.
// ---------------------------------------------------------------------------
await check('bloques de datos JSON sin interpolación cruda', () => {
  const problems = [];
  for (const [file, source] of liquid) {
    for (const block of source.matchAll(
      /<script[^>]*type="application\/(?:json|ld\+json)"[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      for (const tag of block[1].matchAll(/\{\{-?([\s\S]*?)-?\}\}/g)) {
        const expression = tag[1].trim();
        if (!/\|\s*json\s*$/.test(expression)) {
          problems.push(
            `${rel(file)}: \`{{ ${expression} }}\` dentro de un bloque JSON no acaba en \`| json\`: un valor con una comilla rompe el bloque entero`,
          );
        }
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 4 · Nada de código de terceros, y ninguna ventana sin aislar.
// ---------------------------------------------------------------------------
await check('sin código de terceros ni ventanas sin aislar', () => {
  const problems = [];
  const assets = [...liquid];

  for (const [file, source] of assets) {
    // Orígenes externos. Shopify sirve todo lo del theme desde su propio CDN.
    for (const m of source.matchAll(/<(?:script|link)[^>]*(?:src|href)="(https?:\/\/[^"]+)"/g)) {
      const url = m[1];
      if (/^https?:\/\/(?:cdn\.shopify\.com|fonts\.shopifycdn\.com)/.test(url)) continue;
      problems.push(`${rel(file)}: carga ${url} de un tercero; el theme solo debe servirse del CDN de Shopify`);
    }
    // `target="_blank"` sin aislar da acceso a `window.opener`.
    for (const m of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      if (!/rel="[^"]*noopener/.test(m[0])) {
        problems.push(`${rel(file)}: un enlace con target="_blank" sin rel="noopener" expone window.opener`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 5 · Nada parecido a un secreto en archivos que se sirven al navegador.
// ---------------------------------------------------------------------------
await check('sin secretos en archivos públicos', async () => {
  const problems = [];
  const files = [
    ...(await walk(THEME, /\.(liquid|js|css|json)$/)),
    ...(await walk(path.join(ROOT, 'shopify'), /\.(js|md|graphql)$/)),
  ];

  /**
   * Formas de secreto, no palabras sueltas.
   *
   * Buscar la palabra «token» daría un falso positivo en cada comentario que
   * explique por qué NO hay tokens. Se buscan las FORMAS: el prefijo de un
   * token de acceso de Shopify, una clave privada, una asignación con un valor
   * largo que parezca aleatorio.
   */
  const SHAPES = [
    [/\bshp(?:at|ca|pa|ss)_[0-9a-fA-F]{32}\b/, 'un token de acceso de Shopify'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'una clave privada'],
    [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'una clave de acceso de AWS'],
    [/\bsk_(?:live|test)_[0-9a-zA-Z]{20,}\b/, 'una clave secreta de Stripe'],
    [/(?:api[_-]?key|secret|password|passwd)\s*[:=]\s*['"][A-Za-z0-9+/_-]{20,}['"]/i, 'una credencial asignada'],
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const [shape, label] of SHAPES) {
      const m = shape.exec(source);
      if (m) {
        // No se imprime el valor: lo que se reporta es dónde está.
        // El mensaje no afirma que se sirva al navegador: un secreto dentro de
        // un comentario de Liquid sí se elimina del lado del servidor. Pero
        // está versionado y en el historial, que es motivo suficiente.
        problems.push(
          `${rel(file)}: parece contener ${label}; sácalo de aquí y rótalo — está versionado, y si no está en un comentario de Liquid también se sirve al navegador`,
        );
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6 · El `{% capture %}` de Liquid personalizado es deliberado y está acotado.
// ---------------------------------------------------------------------------
await check('el Liquid personalizado está acotado a su bloque', () => {
  const problems = [];
  const notes = [];
  let found = 0;
  for (const [file, source] of liquid) {
    for (const m of source.matchAll(/\{\{\s*((?:block|section)\.settings\.custom_liquid)\s*\}\}/g)) {
      found += 1;
      notes.push(`${rel(file)}: ${m[1]} — Liquid que escribe el comerciante, deliberado`);
    }
  }
  if (found === 0) {
    notes.push('ninguna sección expone Liquid personalizado');
  }
  // No es un hallazgo: es un requisito de la tienda de themes y solo lo puede
  // usar quien ya tiene acceso al admin. Se informa para que esté a la vista.
  return { problems, notes };
});

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------
const failed = results.filter((r) => r.problems.length > 0);
console.log('');
for (const r of results) {
  console.log(`${r.problems.length === 0 ? 'OK  ' : 'FALLA'} ${r.name}`);
  for (const p of r.problems) console.log(`       ${p}`);
  for (const n of r.notes) console.log(`       nota: ${n}`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} comprobaciones de seguridad pasan`);
if (failed.length > 0) process.exitCode = 1;
