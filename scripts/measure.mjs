/**
 * Métricas de carga reales, con estrangulamiento móvil.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE APARTE DE `check-perf.mjs`
 *
 * `check-perf.mjs` vigila PRESUPUESTOS: falla si el peso crece. Esto es otra
 * cosa: MIDE la experiencia de carga —FCP, LCP, CLS, INP, TBT, peso total,
 * número de peticiones— para poder decidir qué optimizar con un número delante,
 * no con una intuición.
 *
 * MÉTODO, el que documenta Shopify para medir un theme:
 *   · CPU estrangulada 4× Y red 4G lenta A LA VEZ (1,6 Mbps bajada,
 *     750 Kbps subida, 150 ms de ida y vuelta).
 *   · Tres ejecuciones, y se toma la MEDIANA. Una sola medición no dice nada.
 *
 * LO QUE ESTO NO ES: una puntuación de Lighthouse sobre la tienda real. Mide el
 * banco de pruebas, que sirve el CSS y el JavaScript REALES del theme con
 * marcado de prueba.
 *
 * LO QUE SÍ REPRODUCE DE PRODUCCIÓN: la compresión. El servidor entrega gzip,
 * igual que el CDN de Shopify, porque sin eso entregaba `ne-core.css` en
 * 15 863 B donde Shopify entrega 3 849 y los tiempos de descarga salían cuatro
 * veces más largos de lo real. Se detectó comparando `transferSize` con
 * `decodedBodySize` en el navegador.
 *
 * LO QUE NO REPRODUCE: el CDN y su latencia real. Los tiempos son comparables
 * entre ejecuciones —sirven para decidir si una optimización mejora algo— pero
 * no son la cifra de campo.
 *
 *   node scripts/measure.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = Number(process.env.NE_RUNS ?? 3);

let chromium = null;
for (const spec of [process.env.NE_PLAYWRIGHT, 'playwright'].filter(Boolean)) {
  try {
    const mod = await import(spec);
    chromium = mod.chromium ?? mod.default?.chromium ?? null;
    if (chromium) break;
  } catch {
    /* siguiente */
  }
}
if (!chromium) {
  console.log('N/E  medición: Playwright no disponible');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/** Peticiones y bytes servidos, contados en el servidor. */
let served = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const target = path.join(ROOT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    const raw = await readFile(target);
    const type = MIME[path.extname(target)] ?? 'application/octet-stream';

    // SE SIRVE COMPRIMIDO, como lo hace el CDN de Shopify.
    //
    // Sin esto la medición mentía donde más importa: entregaba `ne-core.css` en
    // 15 863 B cuando Shopify lo entrega en 3 849, así que los tiempos de
    // descarga salían del orden de cuatro veces más largos de lo real. Se
    // detectó comparando `transferSize` con `decodedBodySize` en el propio
    // navegador: eran iguales, señal de que no hubo compresión.
    //
    // Las imágenes no: un PNG ya viene comprimido.
    const compress = /^(text|application\/(javascript|json))/.test(type);
    const body = compress ? gzipSync(raw, { level: 9 }) : raw;

    // Se cuentan los bytes QUE VIAJAN, que es lo que paga el comprador, y
    // aparte los descomprimidos, que es lo que el navegador parsea.
    served.push({ path: url.pathname, bytes: body.length, decoded: raw.length });

    const headers = { 'Content-Type': type };
    if (compress) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404).end('no');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.NE_CHROMIUM ?? '/opt/pw-browsers/chromium' });

/**
 * Una medición. Devuelve las métricas de una sola carga.
 *
 * @param {string} file
 * @param {boolean} interact ¿Simular una interacción para medir INP?
 */
async function measure(file, interact) {
  // iPhone: 390×844 y relación de píxeles 3, que es lo que más importa según la
  // directiva. Se estrangula la CPU y la red A LA VEZ, que es el método.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
    globalThis.__m = { cls: 0, longTasks: [], fcp: null, lcp: null, inp: null };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__m.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') globalThis.__m.fcp = e.startTime;
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((l) => {
        // El último candidato gana: así es como se define LCP.
        for (const e of l.getEntries()) globalThis.__m.lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) globalThis.__m.longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const d = e.duration ?? 0;
          if (globalThis.__m.inp === null || d > globalThis.__m.inp) globalThis.__m.inp = d;
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {
      /* un navegador sin estas métricas no invalida las demás */
    }
  });

  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  served = [];
  const start = Date.now();
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  if (interact) {
    // Una interacción real: elegir una talla. Es lo que de verdad hace el
    // comprador y lo que INP tiene que medir.
    const chip = page.locator('label[for="t-42"]');
    if ((await chip.count()) > 0) {
      await chip.tap({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(900);
    }
  }

  const m = await page.evaluate(() => ({ ...globalThis.__m }));
  const nav = await page.evaluate(() => {
    const [n] = performance.getEntriesByType('navigation');
    return n ? { domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd } : {};
  });

  await context.close();

  // TBT: lo que cada tarea larga excede de 50 ms.
  const tbt = m.longTasks.reduce((a, d) => a + Math.max(0, d - 50), 0);
  const bytes = served.reduce((a, r) => a + r.bytes, 0);
  const js = served.filter((r) => r.path.endsWith('.js')).reduce((a, r) => a + r.bytes, 0);
  const css = served.filter((r) => r.path.endsWith('.css')).reduce((a, r) => a + r.bytes, 0);
  const decoded = served.reduce((a, r) => a + (r.decoded ?? r.bytes), 0);

  return {
    fcp: m.fcp,
    lcp: m.lcp,
    cls: m.cls,
    inp: m.inp,
    tbt,
    requests: served.length,
    bytes,
    js,
    css,
    decoded,
    load: nav.load,
    wall: Date.now() - start,
  };
}

/** @param {number[]} xs */
function median(xs) {
  const clean = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

const PAGES = [
  ['portada', 'home-harness.html', false],
  ['ficha de producto', 'product-harness.html', true],
  // El carrito entra porque el diagnóstico de módulos apuntó a un desperdicio
  // ahí: carga el grafo completo de `ne-components.js`, que incluye la
  // aritmética de tallas, y el carrito no la usa.
  ['carrito', 'cart-harness.html', false],
  // Y la colección, que es la página que más pesa en la puntuación de velocidad
  // de la tienda de themes y la única con el panel de filtros.
  ['colección', 'collection-harness.html', false],
];

console.log('');
console.log('MEDICIÓN con CPU 4× + 4G lento, iPhone 390×844@3x');
console.log(`${RUNS} ejecuciones por página, se informa la mediana.`);
console.log('');

const summary = {};
for (const [label, file, interact] of PAGES) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await measure(file, interact));

  const ms = (v) => (v === null ? '—' : `${Math.round(v)} ms`);
  const kb = (v) => `${(v / 1024).toFixed(1)} KB`;

  const r = {
    fcp: median(runs.map((x) => x.fcp)),
    lcp: median(runs.map((x) => x.lcp)),
    cls: median(runs.map((x) => x.cls)),
    inp: median(runs.map((x) => x.inp)),
    tbt: median(runs.map((x) => x.tbt)),
    load: median(runs.map((x) => x.load)),
    requests: median(runs.map((x) => x.requests)),
    bytes: median(runs.map((x) => x.bytes)),
    js: median(runs.map((x) => x.js)),
    css: median(runs.map((x) => x.css)),
    decoded: median(runs.map((x) => x.decoded)),
  };
  summary[label] = r;

  console.log(`── ${label}`);
  console.log(`   FCP        ${ms(r.fcp)}`);
  console.log(`   LCP        ${ms(r.lcp)}`);
  console.log(`   CLS        ${r.cls === null ? '—' : r.cls.toFixed(4)}`);
  console.log(`   INP        ${ms(r.inp)}${interact ? '' : ' (sin interacción)'}`);
  console.log(`   TBT        ${ms(r.tbt)}`);
  console.log(`   load       ${ms(r.load)}`);
  console.log(`   peticiones ${r.requests}`);
  console.log(`   transferido ${kb(r.bytes)}  (JS ${kb(r.js)} · CSS ${kb(r.css)}) — comprimido, como Shopify`);
  console.log(`   parseado   ${kb(r.decoded)}  (lo que el navegador descomprime y lee)`);
  console.log('');
}

await browser.close();
server.close();

// Umbrales públicos de Google para «bueno», como referencia, no como promesa.
console.log('Referencia de Google para «bueno»: LCP ≤ 2500 ms · CLS ≤ 0,1 · INP ≤ 200 ms');
