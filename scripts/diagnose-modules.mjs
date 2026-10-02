/**
 * Diagnóstico de los módulos de la ficha de producto.
 *
 * LA PREGUNTA QUE RESPONDE: ¿concatenar los módulos pequeños mejora algo de
 * verdad, o solo baja un número que no se nota?
 *
 * LO QUE MIDE, por recurso:
 *   · cuándo se pide y cuándo acaba de llegar
 *   · si BLOQUEA el renderizado (`renderBlockingStatus`, lo dice el navegador)
 *   · bytes transferidos frente a bytes descomprimidos
 *   · el protocolo que se negoció
 * Y por página: FCP, LCP, tareas largas, y el instante en que cada componente
 * queda DEFINIDO, que es cuando el grafo de módulos terminó de ejecutarse.
 *
 * EL PROTOCOLO IMPORTA MÁS QUE EL NÚMERO DE PETICIONES
 *
 * Shopify sirve los assets del theme por HTTP/2, donde las peticiones se
 * multiplexan sobre una conexión y cuestan muy poco. Un servidor de pruebas en
 * HTTP/1.1 limita a seis conexiones en paralelo y hace que cada petición parezca
 * cara: medir ahí EXAGERA el beneficio de concatenar, y la conclusión saldría
 * sesgada justo hacia el cambio más arriesgado.
 *
 * Así que esto sirve el banco por los DOS protocolos y compara. El certificado
 * es autofirmado porque un navegador no habla HTTP/2 sin TLS.
 *
 *   node scripts/diagnose-modules.mjs
 */

import { createServer as createHttp } from 'node:http';
import { createSecureServer } from 'node:http2';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CERT_DIR = process.env.NE_CERT_DIR;
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
  console.log('N/E  diagnóstico: Playwright no disponible');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Sirve un archivo COMPRIMIDO, como lo hace el CDN de Shopify.
 *
 * Sin esto la medición mentía en la dirección que más importa: el servidor
 * entregaba `ne-core.css` en 15 863 B cuando Shopify lo entrega en 3 549, así
 * que los tiempos de descarga salían del orden de cuatro veces más largos de lo
 * real y cualquier conclusión sobre bytes estaba sesgada.
 *
 * Se detecta por el `transferSize` frente al `decodedBodySize` del propio
 * navegador: si son iguales, no hubo compresión.
 *
 * @param {string} pathname
 */
async function resolveFile(pathname) {
  const target = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) return null;
  try {
    const raw = await readFile(target);
    const type = MIME[path.extname(target)] ?? 'application/octet-stream';
    // Texto sí, imágenes no: un PNG ya viene comprimido.
    const compress = /^(text|application\/(javascript|json))/.test(type);
    return compress
      ? { body: gzipSync(raw, { level: 9 }), type, encoding: 'gzip' }
      : { body: raw, type, encoding: null };
  } catch {
    return null;
  }
}

/** Servidor HTTP/1.1. */
const h1 = createHttp(async (req, res) => {
  const file = await resolveFile(new URL(req.url ?? '/', 'http://l').pathname);
  if (!file) {
    res.writeHead(404).end('no');
    return;
  }
  const headers = { 'Content-Type': file.type };
  if (file.encoding) headers['Content-Encoding'] = file.encoding;
  res.writeHead(200, headers);
  res.end(file.body);
});
await new Promise((r) => h1.listen(0, '127.0.0.1', r));
const h1Port = h1.address().port;

/** Servidor HTTP/2 sobre TLS, que es lo que sirve Shopify. */
let h2 = null;
let h2Port = null;
if (CERT_DIR) {
  h2 = createSecureServer({
    key: await readFile(path.join(CERT_DIR, 'key.pem')),
    cert: await readFile(path.join(CERT_DIR, 'cert.pem')),
    allowHTTP1: false,
  });
  h2.on('stream', async (stream, reqHeaders) => {
    const file = await resolveFile(reqHeaders[':path'] ?? '/');
    if (!file) {
      stream.respond({ ':status': 404 });
      stream.end('no');
      return;
    }
    const resHeaders = { ':status': 200, 'content-type': file.type };
    if (file.encoding) resHeaders['content-encoding'] = file.encoding;
    stream.respond(resHeaders);
    stream.end(file.body);
  });
  await new Promise((r) => h2.listen(0, '127.0.0.1', r));
  h2Port = h2.address().port;
}

const browser = await chromium.launch({ executablePath: process.env.NE_CHROMIUM ?? '/opt/pw-browsers/chromium' });

/**
 * Una carga instrumentada.
 *
 * @param {string} origin
 * @param {string} file
 * @param {boolean} throttle
 */
async function load(origin, file, throttle) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url().split('/').pop()}`);
  });

  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
    globalThis.__m = { lt: [], fcp: null, lcp: null, defined: {} };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) globalThis.__m.lt.push({ d: Math.round(e.duration), t: Math.round(e.startTime) });
      }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') globalThis.__m.fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) globalThis.__m.lcp = Math.round(e.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      /* el resto sigue valiendo */
    }
    // El instante en que cada componente queda definido es cuando el grafo de
    // módulos acabó de ejecutarse. Es el dato que dice si los módulos retrasan
    // la interactividad, y no se puede deducir de las cabeceras.
    for (const tag of ['ne-variant-picker', 'ne-size-guide', 'ne-product-gallery', 'ne-cart', 'ne-cod-coverage']) {
      customElements.whenDefined(tag).then(() => {
        globalThis.__m.defined[tag] = Math.round(performance.now());
      });
    }
  });

  if (throttle) {
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  await page.goto(`${origin}/scripts/fixtures/${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').pop(),
      start: Math.round(r.startTime),
      end: Math.round(r.responseEnd),
      duration: Math.round(r.duration),
      blocking: r.renderBlockingStatus ?? 'desconocido',
      transfer: r.transferSize ?? 0,
      encoded: r.encodedBodySize ?? 0,
      decoded: r.decodedBodySize ?? 0,
      protocol: r.nextHopProtocol || '(?)',
    }));
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      resources,
      ...globalThis.__m,
      navProtocol: nav?.nextHopProtocol || '(?)',
      load: Math.round(nav?.loadEventEnd ?? 0),
    };
  });

  await context.close();
  return { ...data, errors };
}

/** @param {number[]} xs */
function median(xs) {
  const c = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!c.length) return null;
  const m = Math.floor(c.length / 2);
  return c.length % 2 ? c[m] : (c[m - 1] + c[m]) / 2;
}

const origins = [['HTTP/1.1', `http://127.0.0.1:${h1Port}`]];
if (h2Port) origins.push(['HTTP/2', `https://127.0.0.1:${h2Port}`]);

for (const [label, origin] of origins) {
  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log(`${label} · ficha de producto · CPU 4× + 4G lento · mediana de ${RUNS}`);
  console.log(`${'='.repeat(70)}`);

  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await load(origin, 'product-harness.html', true));

  const bad = runs.flatMap((r) => r.errors);
  if (bad.length > 0) {
    console.log(`\n  ⚠ LA PÁGINA NO ESTÁ SANA, la medición no vale: ${[...new Set(bad)].join(' | ')}`);
    continue;
  }
  console.log(`  página sana: 0 errores · protocolo negociado: ${runs[0].navProtocol}`);
  const sinComprimir = runs[0].resources.filter(
    (r) => r.name.endsWith('.css') || r.name.endsWith('.js'),
  ).filter((r) => r.decoded > 0 && r.transfer >= r.decoded);
  if (sinComprimir.length > 0) {
    console.log(`  ⚠ SIN COMPRIMIR: ${sinComprimir.map((r) => r.name).join(', ')} — la medición de bytes no representa a Shopify`);
  }

  const first = runs[0];
  console.log('');
  console.log('  recurso                        pedido   llega   dur  bloquea      transfer  descomp');
  for (const r of first.resources.sort((a, b) => a.start - b.start)) {
    console.log(
      `  ${r.name.padEnd(30)} ${String(r.start).padStart(5)}ms ${String(r.end).padStart(6)}ms ${String(r.duration).padStart(4)}  ${String(r.blocking).padEnd(12)} ${String(r.transfer).padStart(7)} ${String(r.decoded).padStart(8)}`,
    );
  }

  const jsRes = first.resources.filter((r) => r.name.endsWith('.js'));
  console.log('');
  console.log(`  JavaScript: ${jsRes.length} peticiones · ${jsRes.reduce((a, r) => a + r.transfer, 0)} B transferidos · ${jsRes.reduce((a, r) => a + r.decoded, 0)} B descomprimidos`);
  const jsStart = Math.min(...jsRes.map((r) => r.start));
  const jsEnd = Math.max(...jsRes.map((r) => r.end));
  console.log(`  ventana de descarga de JS: ${jsStart}ms → ${jsEnd}ms (${jsEnd - jsStart}ms)`);

  console.log('');
  console.log(`  FCP          ${median(runs.map((r) => r.fcp))} ms`);
  console.log(`  LCP          ${median(runs.map((r) => r.lcp))} ms`);
  console.log(`  load         ${median(runs.map((r) => r.load))} ms`);
  console.log(`  TBT          ${median(runs.map((r) => r.lt.reduce((a, x) => a + Math.max(0, x.d - 50), 0)))} ms`);
  console.log(`  tareas largas ${first.lt.map((x) => `${x.d}ms@${x.t}`).join(' ') || 'ninguna'}`);
  const picker = median(runs.map((r) => r.defined['ne-variant-picker']));
  console.log(`  selector definido (grafo ejecutado): ${picker} ms`);
}

await browser.close();
h1.close();
h2?.close();
