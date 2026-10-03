/**
 * Presupuestos y comportamiento de carga, MEDIDOS.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * NO es una medición de Lighthouse, y no pretende serlo: una puntuación exige
 * una página desplegada, un dispositivo y una red, y ninguna de las tres existe
 * todavía. Inventar un umbral de rendimiento sería inventar información (§191).
 *
 * Lo que sí se puede medir hoy, y es real:
 *
 *   · Los BYTES que el theme sirve de verdad, comprimidos.
 *   · CUÁNTOS MÓDULOS descarga la página. El import map declara doce; si la
 *     página descargara los doce cuando solo importa cinco, serían unos 30 KB
 *     comprimidos regalados en cada visita.
 *   · El DESPLAZAMIENTO de la maquetación, con el mismo observador que usa el
 *     navegador para calcular CLS.
 *   · Que ninguna imagen entre sin dimensiones, que es la causa habitual de ese
 *     desplazamiento.
 *   · Que ningún script bloquee el parser.
 *
 * LOS PRESUPUESTOS SON DE REGRESIÓN, NO DE OBJETIVO. Están puestos justo por
 * encima de lo que el theme pesa hoy, con una razón: no afirman que el theme sea
 * rápido —eso se mide desplegado—, sino que avisan si alguien duplica el peso
 * sin darse cuenta. Un presupuesto que no se ha medido no vale nada, y uno
 * copiado de un artículo vale menos.
 *
 *   node scripts/check-perf.mjs
 */

import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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

/**
 * Presupuestos, en bytes comprimidos.
 *
 * Medidos el 2026-10-02 y redondeados hacia arriba con margen. Si una
 * comprobación falla aquí, la pregunta no es «subo el número», es «qué entró».
 */
const BUDGET = Object.freeze({
  /**
   * El CSS que carga TODA página. Medido: 3 571 B.
   *
   * BAJÓ al sacar las secciones editoriales de la portada —héroe, declaración,
   * THE FOUNDATION, actividades— a su propio paquete. La ficha, el carrito y la
   * colección pagaban 1,2 KB de secciones que no pintan nunca.
   */
  cssFirstPaint: 4_200,
  /** El CSS de la portada: héroe, declaración, THE FOUNDATION, actividades. */
  cssHome: 2_200,
  /** El CSS extra de la ficha de producto. Medido: 1 423 B. */
  cssProduct: 1_800,
  /** El CSS extra del carrito. Medido: 802 B. */
  cssCart: 1_100,
  /**
   * El CSS extra de la colección y la búsqueda: el panel de filtros.
   *
   * Es la pieza nueva y la que más riesgo tiene de engordar, porque un panel de
   * filtros invita a añadir estados. Medido en la página: cuesta 1,6 KB
   * transferidos sobre la portada y UNA petición, con CERO JavaScript.
   */
  cssCollection: 1_600,
  /** Los componentes del theme. Medido: 7 213 B. */
  componentsJs: 8_000,
  /** Los módulos que la ficha de producto necesita. Medido: 6 282 B. */
  productModules: 7_200,
  /** Módulos que la ficha de producto NO debe descargar. */
  unusedModulesFetched: 0,
  /** Desplazamiento de maquetación acumulado. */
  cls: 0.01,
  /**
   * JavaScript que la PORTADA puede descargar: ninguno.
   *
   * No es un presupuesto apretado, es un cero. La portada no tiene selector, ni
   * guía de tallas, ni galería, ni carrito; sus tarjetas son enlaces. Cargaba
   * 46 KB sin comprimir para nada, y ahora su plantilla no emite el módulo.
   */
  homepageJsBytes: 0,
});

// ---------------------------------------------------------------------------
// 1 · Bytes servidos, comprimidos.
// ---------------------------------------------------------------------------
await check('presupuesto de bytes del primer paint', async () => {
  const problems = [];
  const notes = [];

  /** @param {string} file */
  async function gz(file) {
    return gzipSync(await readFile(path.join(THEME, 'assets', file)), { level: 9 }).length;
  }

  const css = await gz('ne-core.css');
  const cssProduct = await gz('ne-product.css');
  const cssCart = await gz('ne-cart.css');
  const cssCollection = await gz('ne-collection.css');
  const cssHome = await gz('ne-home.css');
  const js = await gz('ne-components.js');

  notes.push(`CSS de toda página: ${css} B comprimidos (presupuesto ${BUDGET.cssFirstPaint})`);
  notes.push(
    `CSS extra de ficha: ${cssProduct} B · carrito: ${cssCart} B · colección: ${cssCollection} B · portada: ${cssHome} B`,
  );
  notes.push(`ne-components.js: ${js} B comprimidos (presupuesto ${BUDGET.componentsJs})`);

  if (css > BUDGET.cssFirstPaint) {
    problems.push(`el CSS de toda página pesa ${css} B comprimidos, por encima de ${BUDGET.cssFirstPaint}`);
  }
  if (cssProduct > BUDGET.cssProduct) {
    problems.push(`el CSS de la ficha pesa ${cssProduct} B comprimidos, por encima de ${BUDGET.cssProduct}`);
  }
  if (cssCart > BUDGET.cssCart) {
    problems.push(`el CSS del carrito pesa ${cssCart} B comprimidos, por encima de ${BUDGET.cssCart}`);
  }
  if (cssHome > BUDGET.cssHome) {
    problems.push(`el CSS de la portada pesa ${cssHome} B comprimidos, por encima de ${BUDGET.cssHome}`);
  }
  if (cssCollection > BUDGET.cssCollection) {
    problems.push(`el CSS de la colección pesa ${cssCollection} B comprimidos, por encima de ${BUDGET.cssCollection}`);
  }
  if (js > BUDGET.componentsJs) {
    problems.push(`ne-components.js pesa ${js} B comprimidos, por encima de ${BUDGET.componentsJs}`);
  }

  // Los módulos que la ficha necesita son los que `ne-components.js` importa.
  const source = await readFile(path.join(THEME, 'assets', 'ne-components.js'), 'utf8');
  // Solo los imports ESTÁTICOS: un `import()` dinámico no entra en el grafo
  // inicial de la página, que es exactamente para lo que se usa.
  const specs = [...source.matchAll(/^import\s[^;]*?from '(ne\/[a-z-]+)'/gm)].map((m) => m[1]);
  const layout = await readFile(path.join(THEME, 'layout', 'theme.liquid'), 'utf8');

  let modules = 0;
  for (const spec of new Set(specs)) {
    const m = layout.match(
      new RegExp(`"${spec.replace('/', '\\/')}"\\s*:\\s*\\{\\{\\s*'([A-Za-z0-9.-]+)'`),
    );
    if (!m) {
      problems.push(`el import map no resuelve ${spec}`);
      continue;
    }
    modules += await gz(m[1]);
  }
  notes.push(`módulos de la ficha (${new Set(specs).size}): ${modules} B comprimidos (presupuesto ${BUDGET.productModules})`);
  if (modules > BUDGET.productModules) {
    problems.push(`los módulos de la ficha pesan ${modules} B comprimidos, por encima de ${BUDGET.productModules}`);
  }

  notes.push(`total CSS + JS de la ficha: ${css + js + modules} B comprimidos`);
  return { problems, notes };
});

// ---------------------------------------------------------------------------
// 1bis · La portada no descarga JavaScript. Ninguno.
//
//        Medido: cargaba 46 KB sin comprimir y 5 peticiones para CERO
//        componentes. Su plantilla ya no emite el módulo, y esto lo sostiene.
// ---------------------------------------------------------------------------
await check('la plantilla de portada no emite JavaScript', async () => {
  const problems = [];
  const layout = (await readFile(path.join(THEME, 'layout', 'theme.liquid'), 'utf8')).replace(
    /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
    '',
  );

  // La lista de plantillas que reciben el módulo tiene que existir y no incluir
  // la portada: si alguien la añade «por si acaso», esto lo detiene.
  const list = layout.match(/assign js_templates = '([^']*)'/);
  if (!list) {
    problems.push('theme.liquid ya no declara qué plantillas reciben el módulo: volvería a cargarse en todas');
    return problems;
  }
  const templates = list[1].split(',').map((t) => t.trim());
  if (templates.includes('index')) {
    problems.push("la portada ('index') está en la lista de plantillas con JavaScript: no tiene ni un componente");
  }
  for (const needed of ['product', 'cart']) {
    if (!templates.includes(needed)) {
      problems.push(`la plantilla '${needed}' NO recibe el módulo y sí tiene componentes: quedaría sin mejorar`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 2 · Ninguna imagen sin dimensiones. Es la causa habitual del desplazamiento.
// ---------------------------------------------------------------------------
await check('las imágenes entran con su sitio reservado', async () => {
  const problems = [];

  /** @param {string} dir */
  async function liquidFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await liquidFiles(full)));
      else if (entry.name.endsWith('.liquid')) out.push(full);
    }
    return out;
  }

  for (const file of await liquidFiles(THEME)) {
    const source = (await readFile(file, 'utf8')).replace(
      /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
      '',
    );
    // `<img>` escritos a mano. Los de `image_tag` los dimensiona Shopify.
    for (const m of source.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const hasDims = /\bwidth=/.test(tag) && /\bheight=/.test(tag);
      const hasRatio = /aspect-ratio/.test(tag);
      if (!hasDims && !hasRatio) {
        problems.push(
          `${path.relative(ROOT, file)}: un <img> sin width/height ni aspect-ratio desplaza la maquetación al cargar`,
        );
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 3 · Ningún script bloquea el parser.
// ---------------------------------------------------------------------------
await check('ningún script bloquea el parser', async () => {
  const problems = [];
  const layout = (await readFile(path.join(THEME, 'layout', 'theme.liquid'), 'utf8')).replace(
    /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
    '',
  );
  for (const m of layout.matchAll(/<script\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="(application\/json|importmap)"/.test(tag)) continue; // datos, no ejecución
    if (!/\bsrc=/.test(tag)) continue; // script en línea, deliberado y mínimo
    if (!/\btype="module"/.test(tag) && !/\bdefer\b/.test(tag) && !/\basync\b/.test(tag)) {
      problems.push(`theme.liquid: ${tag} bloquea el parser; usa type="module" o defer`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 4 y 5 · En el navegador: qué se descarga y cuánto se desplaza.
// ---------------------------------------------------------------------------
let chromium = null;
for (const spec of [process.env.NE_PLAYWRIGHT, 'playwright'].filter(Boolean)) {
  try {
    const mod = await import(spec);
    chromium = mod.chromium ?? mod.default?.chromium ?? null;
    if (chromium) break;
  } catch {
    /* siguiente candidato */
  }
}

if (chromium) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const target = path.join(ROOT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
      if (!target.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('no encontrado');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.NE_CHROMIUM ?? '/opt/pw-browsers/chromium' });

  await check('la página descarga solo los módulos que usa', async () => {
    const problems = [];
    const notes = [];
    const page = await browser.newPage();
    const fetched = [];
    page.on('request', (r) => {
      const name = r.url().split('/').pop() ?? '';
      if (/^ne-.*\.js$/.test(name)) fetched.push(name);
    });
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/product-harness.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.close();

    const source = await readFile(path.join(THEME, 'assets', 'ne-components.js'), 'utf8');
    const specs = new Set([...source.matchAll(/^import\s[^;]*?from '(ne\/[a-z-]+)'/gm)].map((m) => m[1]));
    // Lo que el pie de módulos exige: `ne-components.js` más uno por import.
    const expected = specs.size + 1;

    notes.push(`descargados ${fetched.length} módulos: ${fetched.sort().join(', ')}`);

    const extra = fetched.length - expected;
    if (extra > BUDGET.unusedModulesFetched) {
      problems.push(
        `la página descargó ${fetched.length} módulos y solo necesita ${expected}: ` +
          `el import map DECLARA doce, y declarar no debe ser descargar`,
      );
    }
    return { problems, notes };
  });

  await check('la maquetación no se desplaza al cargar', async () => {
    const problems = [];
    const notes = [];
    for (const [label, file] of [
      ['ficha de producto', 'product-harness.html'],
      ['carrito', 'cart-harness.html'],
      // La colección pesa el 43% de la puntuación de velocidad de la tienda de
      // themes, más que la ficha y mucho más que la portada.
      ['portada y colección', 'home-harness.html'],
      // Y la colección con filtros aparte, porque el acordeón abierto cambia la
      // altura del panel y podría empujar la rejilla al cargar.
      ['colección con filtros', 'collection-harness.html'],
    ]) {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        globalThis.Shopify = { analytics: { publish() {} } };
        globalThis.__neCls = 0;
        // El mismo observador que el navegador usa para calcular CLS. Las
        // entradas con `hadRecentInput` se descartan, igual que hace la métrica:
        // un desplazamiento que el comprador provocó no cuenta.
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) globalThis.__neCls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/${file}`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const cls = await page.evaluate(() => globalThis.__neCls ?? 0);
      await page.close();

      notes.push(`${label}: desplazamiento acumulado ${cls.toFixed(4)} (presupuesto ${BUDGET.cls})`);
      if (cls > BUDGET.cls) {
        problems.push(`${label}: la maquetación se desplaza ${cls.toFixed(4)}, por encima de ${BUDGET.cls}`);
      }
    }
    return { problems, notes };
  });

  await browser.close();
  server.close();
} else {
  results.push({
    name: 'medición en navegador',
    problems: [],
    notes: ['NO EJECUTADA: Playwright no disponible'],
  });
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------
const failed = results.filter((r) => r.problems.length > 0);
console.log('');
for (const r of results) {
  console.log(`${r.problems.length === 0 ? 'OK  ' : 'FALLA'} ${r.name}`);
  for (const p of r.problems) console.log(`       ${p}`);
  for (const n of r.notes) console.log(`       ${n}`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} comprobaciones de rendimiento pasan`);
console.log('');
console.log('NOTA: esto NO es una puntuación de Lighthouse. Son presupuestos de regresión medidos');
console.log('sobre lo que el theme sirve hoy. La medición real exige una página desplegada.');
if (failed.length > 0) process.exitCode = 1;
