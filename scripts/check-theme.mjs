/**
 * Comprobaciones del theme que Theme Check no hace.
 *
 * Theme Check —el linter oficial de Shopify— valida sintaxis Liquid, claves de
 * traducción, esquemas y ámbito de CSS. Lo que no puede validar es el CONTRATO
 * ENTRE EL JAVASCRIPT Y EL MARCADO, porque no lee el JavaScript. Y ahí es donde
 * este theme falla de verdad:
 *
 *   · el script busca `[data-ne-x]` y el Liquid no lo pinta  -> mejora muerta
 *   · el Liquid pinta `[data-ne-x]` y el script no lo usa     -> marcado muerto
 *   · el script pide un texto que no está en el puente        -> cadena vacía
 *   · el script pide una ruta que no está en el puente        -> no hace nada
 *
 * Ninguno de esos cuatro casos rompe la página de forma visible: la mejora
 * simplemente no ocurre, y el fallo pasa inadvertido hasta que alguien nota que
 * el contador del carrito no se mueve. Los cuatro aparecieron de verdad
 * escribiendo estos componentes.
 *
 * Sin dependencias: lectura de archivos y expresiones regulares.
 *
 *   node scripts/check-theme.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(ROOT, 'theme');
const COMPONENTS = path.join(THEME, 'assets', 'ne-components.js');
const LAYOUT = path.join(THEME, 'layout', 'theme.liquid');

/** @type {{name: string, problems: string[], notes: string[]}[]} */
const results = [];

/**
 * Registra una comprobación.
 *
 * Distingue FALLO de NOTA a propósito, y la asimetría está razonada:
 *
 *   · Que el script busque un gancho que el marcado no pinta es un FALLO: la
 *     mejora no ocurre nunca y nadie se entera.
 *   · Que el marcado pinte un gancho que el script no usa es una NOTA: puede
 *     existir para CSS, para una app o para una página que falta. Convertirlo
 *     en fallo obligaría a una lista de excepciones tan larga que la
 *     comprobación dejaría de significar nada.
 *
 * @param {string} name
 * @param {() => Promise<string[]|{problems: string[], notes: string[]}>} fn
 */
async function check(name, fn) {
  try {
    const out = (await fn()) ?? [];
    if (Array.isArray(out)) results.push({ name, problems: out, notes: [] });
    else results.push({ name, problems: out.problems ?? [], notes: out.notes ?? [] });
  } catch (error) {
    results.push({ name, problems: [`la comprobación lanzó: ${error.message}`], notes: [] });
  }
}

/**
 * Lista recursiva de archivos del theme con una extensión dada.
 * @param {string} dir
 * @param {RegExp} match
 * @returns {Promise<string[]>}
 */
async function walk(dir, match) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, match)));
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}

/** @param {string} p */
const rel = (p) => path.relative(ROOT, p);

const liquidFiles = await walk(THEME, /\.liquid$/);
const jsonFiles = await walk(THEME, /\.json$/);
const liquidSource = new Map();
for (const f of liquidFiles) liquidSource.set(f, await readFile(f, 'utf8'));

/**
 * Quita los comentarios de Liquid.
 *
 * Imprescindible y no cosmético: los comentarios de este theme EXPLICAN las
 * trampas que el código evita —«`forloop.index`, NO `line.index`»— y escanear
 * el archivo entero convierte esas explicaciones en falsos positivos. Ya pasó
 * tres veces: con `content_for_header`, con los ganchos del script y con esta.
 *
 * @param {string} source
 * @returns {string}
 */
function withoutComments(source) {
  return source.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
}

/** Igual que `liquidSource`, sin comentarios. Es lo que se escanea. */
const liquidCode = new Map([...liquidSource].map(([f, src]) => [f, withoutComments(src)]));
const allLiquid = [...liquidCode.values()].join('\n');
/** Los bancos de pruebas. Declarados en un sitio para que no se olvide ninguno. */
const HARNESSES = [
  'product-harness.html',
  'cart-harness.html',
  'cart-empty-harness.html',
  'home-harness.html',
];

const js = await readFile(COMPONENTS, 'utf8');
const layout = await readFile(LAYOUT, 'utf8');

/**
 * El JavaScript sin comentarios.
 *
 * Hace falta porque los comentarios de este theme EXPLICAN los ganchos y las
 * trampas —«`data-ne-3d-mode` se leería como...»— y contar esas menciones como
 * uso real daba un falso positivo que contradecía el arreglo que el propio
 * comentario documenta.
 */
const jsCode = js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
  .join('\n');

// ---------------------------------------------------------------------------
// 1. Ganchos DOM: lo que el script busca, el Liquid lo pinta. Y al revés.
// ---------------------------------------------------------------------------

/** camelCase de dataset -> atributo kebab. `neOptionName` -> `data-ne-option-name`. */
function datasetToAttribute(camel) {
  return `data-${camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Ganchos que existen solo para CSS o solo para el estado interno del script.
 * No tienen que aparecer en los dos lados, y se declaran aquí para que la
 * excepción sea explícita en lugar de silenciosa.
 */
const HOOKS_CSS_ONLY = new Set([
  'data-ne-state', // tres estados del selector, pintado por el script, estilado por CSS
  'data-ne-loading', // estado de botón, pintado por el script
  'data-ne-busy', // actualización de carrito en vuelo, pintado por el script
  'data-ne-enhanced', // el script declara que tomó el mando; lo lee el CSS
  'data-ne-mounted', // guardia de montaje, solo del script
  'data-ne-media-type', // lo pinta Liquid para el CSS, el script no lo necesita
  'data-ne-apply-size', // lo crea el script, no existe en Liquid
  'data-ne-attr', // genérico: el valor concreto se comprueba aparte
  'data-ne-product-id', // leído vía dataset del contenedor de producto
  'data-ne-product-handle',
  'data-ne-section-id',
]);

await check('ganchos del script existen en el marcado', () => {
  const problems = [];

  const fromStrings = new Set(
    [...jsCode.matchAll(/data-ne-[a-z0-9-]+/g)].map((m) => m[0]),
  );
  const fromDataset = new Set(
    [...jsCode.matchAll(/\.dataset(?:\?\.)?\.(ne[A-Za-z0-9]+)/g)].map((m) =>
      datasetToAttribute(m[1]),
    ),
  );
  const wanted = new Set([...fromStrings, ...fromDataset]);

  const provided = new Set(
    [...allLiquid.matchAll(/data-ne-[a-z0-9-]+/g)].map((m) => m[0]),
  );

  const notes = [];

  for (const hook of wanted) {
    if (HOOKS_CSS_ONLY.has(hook)) continue;
    if (!provided.has(hook)) {
      problems.push(`el script busca ${hook} y ningún archivo Liquid lo pinta`);
    }
  }
  for (const hook of provided) {
    if (HOOKS_CSS_ONLY.has(hook)) continue;
    if (!wanted.has(hook)) {
      notes.push(`${hook} se pinta en Liquid y el script no lo lee`);
    }
  }

  /**
   * LA TRAMPA DEL DÍGITO. Verificada en Chromium, no deducida.
   *
   * `data-ne-3d-mode` NO se lee como `dataset.ne3dMode`: el guion solo se
   * colapsa cuando le sigue una letra minúscula, así que la clave real es
   * `dataset['ne-3dMode']` y el acceso con punto devuelve `undefined`.
   *
   * Pasó de verdad: el ajuste de 3D del theme se ignoraba por completo, «off»
   * incluido, y la página no daba ninguna señal. Por eso se prohíbe la forma
   * entera en lugar de confiar en recordarlo.
   */
  for (const hook of new Set([...provided, ...wanted])) {
    if (/-\d/.test(hook)) {
      problems.push(
        `${hook} tiene un dígito tras un guion: dataset lo expone como ['${hook
          .replace(/^data-/, '')
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase())}'] y el acceso con punto daría undefined. Renómbralo sin dígitos.`,
      );
    }
  }

  return { problems, notes };
});

// ---------------------------------------------------------------------------
// 2. Puente de textos: `text('clave')` <-> bloque #ne-strings.
// ---------------------------------------------------------------------------
await check('textos del script existen en el puente de idioma', () => {
  const problems = [];

  const block = layout.match(/<script type="application\/json" id="ne-strings">([\s\S]*?)<\/script>/);
  if (!block) return ['theme.liquid no declara el bloque #ne-strings'];

  const declared = new Set([...block[1].matchAll(/"([a-z0-9_]+)"\s*:/g)].map((m) => m[1]));
  const used = new Set([...jsCode.matchAll(/\btext\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));

  for (const key of used) {
    if (!declared.has(key)) {
      problems.push(`el script pide el texto '${key}' y #ne-strings no lo declara (saldría vacío)`);
    }
  }
  for (const key of declared) {
    if (!used.has(key)) {
      problems.push(`#ne-strings declara '${key}' y el script no lo usa (clave muerta)`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 3. Puente de rutas: `ROUTES.x` <-> bloque #ne-routes.
// ---------------------------------------------------------------------------
await check('rutas del script existen en el puente de rutas', () => {
  const problems = [];

  const block = layout.match(/<script type="application\/json" id="ne-routes">([\s\S]*?)<\/script>/);
  if (!block) return ['theme.liquid no declara el bloque #ne-routes'];

  const declared = new Set([...block[1].matchAll(/"([a-z0-9_]+)"\s*:/g)].map((m) => m[1]));
  const used = new Set([...jsCode.matchAll(/\bROUTES\.([a-z0-9_]+)/g)].map((m) => m[1]));

  for (const key of used) {
    if (!declared.has(key)) {
      problems.push(`el script usa ROUTES.${key} y #ne-routes no lo declara`);
    }
  }
  // Las rutas declaradas y no usadas todavía no son un fallo: el puente las
  // expone para las páginas que faltan. Se informan sin fallar.
  return problems;
});

// ---------------------------------------------------------------------------
// 4. Atribuciones de línea: lo que escribe el script tiene campo en el form.
// ---------------------------------------------------------------------------
await check('atribuciones de línea tienen campo en el formulario', async () => {
  const problems = [];
  const cartLine = await readFile(path.join(ROOT, 'src', 'lib', 'cart-line.js'), 'utf8');

  // Claves que `sizeFitAttributes` puede devolver.
  const keys = new Set([...cartLine.matchAll(/out\.(_ne_[a-z_]+)\s*=/g)].map((m) => m[1]));
  const fields = new Set([...allLiquid.matchAll(/data-ne-attr="(_ne_[a-z_]+)"/g)].map((m) => m[1]));

  for (const key of keys) {
    if (!fields.has(key)) {
      problems.push(`sizeFitAttributes produce ${key} y ningún formulario tiene su campo: el dato se perdería`);
    }
  }
  for (const field of fields) {
    if (!keys.has(field)) {
      problems.push(`el formulario declara el campo ${field} y sizeFitAttributes nunca lo produce`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 5. Elementos personalizados: usados en Liquid <-> definidos en el script.
// ---------------------------------------------------------------------------
await check('elementos personalizados definidos', () => {
  const problems = [];
  const used = new Set([...allLiquid.matchAll(/<(ne-[a-z-]+)[\s>]/g)].map((m) => m[1]));
  const defined = new Set([...jsCode.matchAll(/define\(\s*'(ne-[a-z-]+)'/g)].map((m) => m[1]));

  for (const tag of used) {
    if (!defined.has(tag)) problems.push(`<${tag}> se usa en el marcado y el script no lo define`);
  }
  for (const tag of defined) {
    if (!used.has(tag)) problems.push(`el script define <${tag}> y ningún marcado lo usa`);
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6. Referencias que tienen que resolver: assets y snippets.
// ---------------------------------------------------------------------------
await check('assets referenciados existen', async () => {
  const problems = [];
  const present = new Set(await readdir(path.join(THEME, 'assets')));
  const sources = [allLiquid, jsCode].join('\n');
  for (const m of sources.matchAll(/'([A-Za-z0-9._-]+\.(?:css|js|svg|png|jpg|webp|woff2?))'\s*\|\s*asset_url/g)) {
    if (!present.has(m[1])) problems.push(`asset_url referencia '${m[1]}', que no está en theme/assets`);
  }

  // LOS BANCOS TAMBIÉN, y esta parte nació de un fallo real: al fusionar el CSS,
  // un banco quedó pidiendo tres archivos que ya no existían. Los 404 no rompen
  // la página, simplemente la dejan sin estilos, así que la medición de
  // rendimiento dio un número BUENÍSIMO y falso. Una referencia muerta en un
  // banco no es un detalle de prueba: envenena la medición.
  for (const name of HARNESSES) {
    const text = await readFile(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8');
    for (const m of text.matchAll(/(?:href|src)="\/theme\/assets\/([A-Za-z0-9._-]+)"/g)) {
      if (!present.has(m[1])) {
        problems.push(`${name} pide /theme/assets/${m[1]}, que no existe: la página se mediría sin estilos`);
      }
    }
    for (const m of text.matchAll(/"\/theme\/assets\/([A-Za-z0-9._-]+)"/g)) {
      if (!present.has(m[1])) {
        problems.push(`${name} mapea /theme/assets/${m[1]} en su import map, y no existe`);
      }
    }
  }
  return problems;
});

await check('snippets renderizados existen', async () => {
  const problems = [];
  const present = new Set(
    (await readdir(path.join(THEME, 'snippets'))).map((f) => f.replace(/\.liquid$/, '')),
  );
  for (const [file, source] of liquidCode) {
    for (const m of source.matchAll(/\{%-?\s*render\s+'([A-Za-z0-9._-]+)'/g)) {
      if (!present.has(m[1])) {
        problems.push(`${rel(file)} renderiza el snippet '${m[1]}', que no existe`);
      }
    }
  }
  return problems;
});

await check('secciones de plantillas y grupos existen', async () => {
  const problems = [];
  const present = new Set(
    (await readdir(path.join(THEME, 'sections')))
      .filter((f) => f.endsWith('.liquid'))
      .map((f) => f.replace(/\.liquid$/, '')),
  );
  for (const file of jsonFiles) {
    const name = rel(file);
    if (!name.includes('/templates/') && !name.includes('/sections/')) continue;
    const data = JSON.parse(await readFile(file, 'utf8'));
    const sections = data.sections ?? {};
    for (const [id, def] of Object.entries(sections)) {
      const type = def?.type;
      if (typeof type !== 'string') continue;
      if (type.startsWith('@')) continue; // bloques de app
      if (!present.has(type)) {
        problems.push(`${name}: la sección '${id}' es de tipo '${type}', que no existe en theme/sections`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6bis. `.index` sobre la variable de un bucle: la propiedad no existe.
//
//   Pasó de verdad en el carrito: `line.index` NO es una propiedad del objeto
//   `line_item`. Liquid devuelve nil ante una propiedad inexistente, y
//   `nil | plus: 1` es 1, así que TODAS las líneas del carrito recibieron el id
//   `ne-cart-qty-1`: ids duplicados y etiquetas que enfocaban todas el primer
//   campo. Theme Check no lo ve porque no sigue las propiedades de los objetos.
//
//   El contador del bucle en Liquid es `forloop.index`, siempre.
// ---------------------------------------------------------------------------
await check('ninguna variable de bucle usa .index', () => {
  const problems = [];
  for (const [file, source] of liquidCode) {
    // Variables de bucle declaradas en este archivo.
    const loopVars = new Set(
      [...source.matchAll(/\{%-?\s*for\s+([A-Za-z_][\w]*)\s+in\s/g)].map((m) => m[1]),
    );
    for (const v of loopVars) {
      const bad = new RegExp(`\\b${v}\\.index\\b`);
      if (bad.test(source)) {
        problems.push(
          `${rel(file)}: usa \`${v}.index\`, que no existe en los objetos de Liquid; el contador es \`forloop.index\``,
        );
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6ter. El banco de pruebas no se aparta del marcado real.
//
//   TERCERA FORMA DEL MISMO PROBLEMA. El banco llevaba CSS copiado —resuelto
//   cargando el archivo real—, textos copiados —resuelto resolviéndolos del
//   locale— y marcado simplificado, que es la que más engaña: la auditoría medía
//   elementos SIN las clases del theme, así que aprobaba cosas que en la tienda
//   pueden fallar, y una inyección deliberada de un fallo de contraste no
//   disparó nada porque la regla no llegaba a aplicarse.
//
//   Comparar el marcado completo es imposible sin renderizar Liquid. Comparar
//   las CLASES sí: si una pieza usa `.ne-picker__chosen` y el banco no la lleva,
//   nada de lo que esa clase estila está siendo medido.
// ---------------------------------------------------------------------------
await check('el banco de pruebas lleva las clases del marcado real', async () => {
  const problems = [];

  /** Piezas que los bancos reproducen. */
  const MIRRORED = [
    'theme/snippets/ne-variant-picker.liquid',
    'theme/snippets/ne-size-guide.liquid',
    'theme/snippets/ne-buy-buttons.liquid',
    'theme/snippets/ne-price.liquid',
    'theme/snippets/ne-product-specs.liquid',
    'theme/sections/main-cart.liquid',
    'theme/snippets/ne-cod-coverage.liquid',
    'theme/sections/header.liquid',
    'theme/layout/theme.liquid',
  ];

  /**
   * Clases `ne-*` literales de un marcado. Se ignoran las que llevan Liquid
   * dentro, porque su valor depende de los datos.
   * @param {string} text
   */
  function neClasses(text) {
    const out = new Set();
    for (const m of text.matchAll(/class="([^"]*)"/g)) {
      for (const token of m[1].split(/\s+/)) {
        if (token.startsWith('ne-') && !token.includes('{')) out.add(token);
      }
    }
    return out;
  }

  const wanted = new Set();
  for (const file of MIRRORED) {
    const full = path.join(ROOT, file);
    const source = liquidCode.get(full);
    if (source === undefined) {
      problems.push(`${file} está declarado como espejado y no existe`);
      continue;
    }
    for (const c of neClasses(source)) wanted.add(c);
  }

  const present = new Set();
  for (const name of HARNESSES) {
    const text = await readFile(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8');
    for (const c of neClasses(text)) present.add(c);
  }

  for (const c of wanted) {
    if (!present.has(c)) {
      problems.push(
        `la clase .${c} se usa en el marcado real y ningún banco la lleva: nada de lo que estila se está midiendo`,
      );
    }
  }

  // El bootstrap de maquetación también. Es un script en línea de `theme.liquid`
  // que decide, antes del primer paint, quién manda en el selector. Un banco sin
  // él mediría un desplazamiento que la tienda no tiene, o al revés.
  const layoutHasBoot = /classList\.add\('ne-js'\)/.test(layout);
  if (!layoutHasBoot) {
    problems.push("theme.liquid no pone la marca `ne-js` antes del primer paint: el selector se pintaría y luego se desplazaría");
  }
  for (const name of HARNESSES) {
    const text = await readFile(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8');
    if (!/classList\.add\('ne-js'\)/.test(text)) {
      problems.push(`${name} no lleva el bootstrap de maquetación de theme.liquid: mediría un desplazamiento distinto al real`);
    }
  }

  // EL MODULEPRELOAD TAMBIÉN, y por el mismo motivo. Se midió que rompe una
  // cascada de descubrimiento que costaba 197 ms hasta poder tocar la página.
  // Un banco con componentes que se quede sin él mide esa cascada y hace creer
  // que la tienda es más lenta de lo que es.
  const layoutPreloads = [...layout.matchAll(/rel="modulepreload"/g)].length;
  const declared = layout.match(/assign preload_modules = '([^']*)'/);
  if (layoutPreloads === 0 || !declared) {
    problems.push('theme.liquid ya no precarga los módulos: volvería la cascada de descubrimiento de 197 ms');
  } else {
    const expected = declared[1].split(',').map((m) => m.trim()).filter(Boolean);
    // Los bancos CON componentes. La portada no emite el módulo, así que
    // tampoco precarga nada.
    for (const name of ['product-harness.html', 'cart-harness.html', 'cart-empty-harness.html']) {
      const text = await readFile(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8');
      for (const module of expected) {
        if (!text.includes(`rel="modulepreload"`) || !text.includes(module)) {
          problems.push(`${name} no precarga ${module} como hace theme.liquid: mediría la cascada que la tienda no tiene`);
        }
      }
      if (!/fetchpriority="low"/.test(text)) {
        problems.push(`${name} precarga sin fetchpriority="low": competiría con el CSS bloqueante y mediría un FCP peor`);
      }
    }
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 6quater. El pixel personalizado: vocabulario compartido y sin dinero.
//
//   Un pixel personalizado es un script suelto en un sandbox de Shopify: NO
//   puede importar módulos, así que repite el vocabulario de etapas de
//   `analytics-taxonomy.js`. La repetición es inevitable; la deriva no.
//
//   Y comprueba lo que de verdad importa: que el pixel NO reenvíe dinero.
//   Tenerlo en un evento de cliente invita a sumar ingresos desde el navegador,
//   que es la cifra falsa que todo el diseño de analítica evita. El ingreso vive
//   en `orders/paid`.
// ---------------------------------------------------------------------------
await check('el pixel usa el vocabulario de la taxonomía y no envía dinero', async () => {
  const problems = [];
  const pixelPath = path.join(ROOT, 'shopify', 'pixel', 'custom-pixel.js');

  let pixel;
  try {
    pixel = await readFile(pixelPath, 'utf8');
  } catch {
    return ['shopify/pixel/custom-pixel.js no existe'];
  }

  const taxonomy = await readFile(path.join(ROOT, 'src', 'lib', 'analytics-taxonomy.js'), 'utf8');

  // Etapas que declara cada lado.
  const taxonomyStages = new Set(
    [...taxonomy.matchAll(/^\s{2}[A-Z_]+:\s*'([a-z_]+)',/gm)].map((m) => m[1]),
  );
  const pixelBlock = pixel.match(/const STAGE = \{([\s\S]*?)\};/);
  if (!pixelBlock) return ['el pixel no declara un bloque STAGE reconocible'];
  const pixelStages = [...pixelBlock[1].matchAll(/[A-Z_]+:\s*'([a-z_]+)'/g)].map((m) => m[1]);

  if (pixelStages.length === 0) problems.push('el pixel no declara ninguna etapa');
  for (const stage of pixelStages) {
    if (!taxonomyStages.has(stage)) {
      problems.push(
        `el pixel usa la etapa '${stage}', que no existe en analytics-taxonomy.js: los dos vocabularios se han separado`,
      );
    }
  }

  // El pixel solo puede medir las etapas de cliente. Una etapa de servidor aquí
  // significa que alguien está a punto de contar pedidos desde el navegador.
  const SERVER_SIDE = ['order_created', 'order_confirmed', 'order_shipped', 'order_delivered', 'order_returned'];
  for (const stage of pixelStages) {
    if (SERVER_SIDE.includes(stage)) {
      problems.push(
        `el pixel declara la etapa de servidor '${stage}': eso se mide con webhooks de pedido, no en el cliente`,
      );
    }
  }

  // Sin comentarios: el pixel EXPLICA por qué no envía dinero, y esa
  // explicación no puede contar como enviarlo.
  const code = pixel
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');

  // Claves de dinero en la construcción del payload.
  for (const m of code.matchAll(/^\s*([a-z_]*(?:price|amount|total|revenue|value)[a-z_]*)\s*:/gim)) {
    problems.push(`el pixel construye el campo '${m[1]}': ningún importe sale de un evento de cliente`);
  }

  // `checkout_completed` señalaría lo mismo que `orders/create` pero sujeto a
  // consentimiento, así que daría una cifra MENOR para el mismo hecho.
  if (/analytics\.subscribe\(\s*['"]checkout_completed['"]/.test(code)) {
    problems.push(
      "el pixel se suscribe a 'checkout_completed': duplica `orders/create` con una cifra menor, y dos números para el mismo hecho producen un informe que miente",
    );
  }

  // El consentimiento no es opcional.
  if (!/analyticsProcessingAllowed/.test(code)) {
    problems.push('el pixel no comprueba `analyticsProcessingAllowed`: enviaría datos sin consentimiento');
  }
  if (!/visitorConsentCollected/.test(code)) {
    problems.push(
      'el pixel no escucha `visitorConsentCollected`: mediría toda la sesión con el consentimiento inicial, ignorando una aceptación posterior',
    );
  }

  // El evento propio es entrada no confiable y tiene que viajar marcado.
  if (!/trusted/.test(code)) {
    problems.push('el pixel no marca la confianza del evento: un informe no podría distinguir el dato manipulable');
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 6quinquies. JSON-LD sin interpolación cruda.
//
//   Dentro de un bloque `application/ld+json`, TODA interpolación tiene que
//   pasar por el filtro `json`. Es el fallo clásico de los datos estructurados:
//   un título de producto con una comilla —«Botín "Andes"»— rompe el JSON, y un
//   bloque roto no da un dato peor, da NINGÚN dato, porque el buscador descarta
//   el script entero. Y se descubre semanas después, en una caída de tráfico.
//
//   Los literales de Liquid dentro del bloque —`"https://schema.org/InStock"`
//   elegido por un `if`— no son interpolación y no necesitan filtro.
// ---------------------------------------------------------------------------
await check('JSON-LD sin interpolación cruda', () => {
  const problems = [];
  for (const [file, source] of liquidCode) {
    for (const block of source.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      for (const tag of block[1].matchAll(/\{\{-?([\s\S]*?)-?\}\}/g)) {
        const expression = tag[1].trim();
        if (!/\|\s*json\s*$/.test(expression)) {
          problems.push(
            `${rel(file)}: \`{{ ${expression} }}\` dentro de JSON-LD no acaba en \`| json\`: un valor con una comilla rompería el bloque entero`,
          );
        }
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6sexies. Un modificador usado sin su clase base tiene que ser autosuficiente.
//
//   `.ne-button--text` se usaba en cuatro sitios SIN `.ne-button`, y por sí sola
//   no declaraba `display`. En un elemento en línea `min-height` no hace nada,
//   así que su mínimo de área de pulsado nunca se aplicó. Lo midió la auditoría:
//   71×21 contra un mínimo de 24.
//
//   No se prohíbe usar un modificador solo: `.ne-section--vast` declara su
//   propio `padding-block` y es una variante legítima. Lo que se exige es que
//   quien se use solo DECLARE lo que necesita para sostenerse.
// ---------------------------------------------------------------------------
await check('los modificadores usados solos se sostienen solos', async () => {
  const problems = [];
  const css = [

    // El CSS FUENTE, no el generado: es donde se edita, y donde una regla mal
    // escrita hay que arreglarla.
    await readFile(path.join(ROOT, 'src', 'theme', 'css', 'tokens.css'), 'utf8'),
    await readFile(path.join(ROOT, 'src', 'theme', 'css', 'base.css'), 'utf8'),
    await readFile(path.join(ROOT, 'src', 'theme', 'css', 'shell.css'), 'utf8'),
    await readFile(path.join(ROOT, 'src', 'theme', 'css', 'product.css'), 'utf8'),
    await readFile(path.join(ROOT, 'src', 'theme', 'css', 'cart.css'), 'utf8'),
  ].join('\n');

  /** Modificadores usados sin su base, en todo el marcado. */
  const standalone = new Set();
  for (const source of liquidCode.values()) {
    for (const m of source.matchAll(/class="([^"]*)"/g)) {
      const tokens = m[1].split(/\s+/).filter((t) => t.startsWith('ne-'));
      for (const token of tokens) {
        if (!token.includes('--')) continue;
        const clean = token.split('{')[0]; // la clase puede ir seguida de Liquid
        const base = clean.split('--')[0];
        if (!tokens.some((t) => t.split('{')[0] === base)) standalone.add(clean);
      }
    }
  }

  for (const modifier of standalone) {
    // La regla del modificador, tal como está declarada.
    const rule = css.match(
      new RegExp(`\\.${modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
    );
    if (!rule) {
      problems.push(`.${modifier} se usa sin su clase base y no tiene ninguna regla propia`);
      continue;
    }
    const body = rule[1];
    // Si fija un alto mínimo, tiene que fijar también un `display` que lo haga
    // efectivo: en un elemento en línea, `min-height` se ignora.
    if (/min-height/.test(body) && !/display\s*:/.test(body)) {
      problems.push(
        `.${modifier} se usa sin su clase base y declara min-height sin display: en un elemento en línea ese mínimo se ignora`,
      );
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6septies. Ningún ajuste del theme que nadie lea.
//
//   Un ajuste declarado en `settings_schema.json` aparece en el editor del
//   theme: el comerciante lo ve, lo cambia, y si ningún Liquid lo lee NO PASA
//   NADA. Un control que miente es peor que una función que falta, porque el
//   comerciante cree que ya lo configuró.
//
//   Pasó con tres: `analytics_size_selected_event`, `cod_prevalidation` y
//   `cod_coverage_list`. Estaban en el editor y ningún archivo los leía.
//
//   Y al revés: leer `settings.algo` que el esquema no declara da `nil` en
//   silencio, que es la otra mitad del mismo problema.
// ---------------------------------------------------------------------------
await check('los ajustes del theme se declaran y se leen', async () => {
  const problems = [];
  const schema = JSON.parse(
    await readFile(path.join(THEME, 'config', 'settings_schema.json'), 'utf8'),
  );

  /** Ids declarados en el esquema global. */
  const declared = new Set();
  for (const group of schema) {
    for (const setting of group.settings ?? []) {
      if (typeof setting.id === 'string') declared.add(setting.id);
    }
  }

  /**
   * Ajustes que el Liquid lee de verdad.
   *
   * Hay que distinguir `settings.x` —global— de `section.settings.x` y
   * `block.settings.x`, que viven en el esquema de cada sección. Sin esa
   * distinción, trece ajustes de sección aparecerían como «no declarados».
   */
  const read = new Set();
  for (const source of liquidCode.values()) {
    for (const m of source.matchAll(/(^|[^.\w])settings\.([a-z_][a-z0-9_]*)/g)) {
      read.add(m[2]);
    }
  }

  for (const id of declared) {
    if (!read.has(id)) {
      problems.push(
        `el ajuste '${id}' está en settings_schema.json y ningún Liquid lo lee: aparece en el editor y no hace nada`,
      );
    }
  }
  for (const id of read) {
    if (!declared.has(id)) {
      problems.push(
        `el Liquid lee \`settings.${id}\` y settings_schema.json no lo declara: devolvería nil en silencio`,
      );
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 7. Elegibilidad de streaming. Verificado contra la documentación de Shopify:
//    si se incumple, la página deja de streamearse EN SILENCIO.
// ---------------------------------------------------------------------------
await check('elegibilidad de streaming del layout', async () => {
  const problems = [];

  // Los comentarios de Liquid se descuentan: este layout EXPLICA las reglas del
  // streaming en prosa, y contar esas menciones daría un falso positivo.
  const code = layout.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
  const occurrences = [...code.matchAll(/content_for_header/g)];
  const bare = [...code.matchAll(/\{\{\s*content_for_header\s*\}\}/g)];

  if (bare.length !== 1) {
    problems.push(
      `\`{{ content_for_header }}\` tiene que aparecer exactamente una vez como etiqueta simple; aparece ${bare.length} vez/veces`,
    );
  }
  if (occurrences.length !== bare.length) {
    problems.push(
      'content_for_header aparece con filtros, asignado a variable o dentro de otra etiqueta: eso anula el streaming',
    );
  }

  if (bare.length === 1) {
    const at = bare[0].index;
    const head = code.indexOf('<head>');
    const headEnd = code.indexOf('</head>');
    if (!(head < at && at < headEnd)) {
      problems.push('`{{ content_for_header }}` tiene que estar dentro de <head> y con </head> después');
    }
    // El CSS del primer paint va ARRIBA, para que se descargue mientras Liquid
    // renderiza las secciones.
    for (const m of code.matchAll(/stylesheet_tag/g)) {
      if (m.index > at) {
        problems.push('hay un stylesheet_tag por debajo de content_for_header: pierde el solape con el streaming');
      }
    }
  }

  // Plantillas en JSON, que es la otra condición del streaming.
  const templates = await readdir(path.join(THEME, 'templates'));
  for (const t of templates) {
    if (t.endsWith('.liquid')) {
      problems.push(`templates/${t} es Liquid: las plantillas .liquid no se streamean, usa JSON`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 8. Todo el JSON del theme parsea, esquemas incluidos.
// ---------------------------------------------------------------------------
await check('JSON del theme válido, esquemas incluidos', async () => {
  const problems = [];
  for (const file of jsonFiles) {
    try {
      JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      problems.push(`${rel(file)}: ${error.message}`);
    }
  }
  for (const [file, source] of liquidSource) {
    for (const m of source.matchAll(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/g)) {
      try {
        JSON.parse(m[1]);
      } catch (error) {
        problems.push(`${rel(file)}: el bloque schema no es JSON válido: ${error.message}`);
      }
    }
  }
  return problems;
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
console.log(`${results.length - failed.length}/${results.length} comprobaciones del theme pasan`);

if (failed.length > 0) process.exitCode = 1;
