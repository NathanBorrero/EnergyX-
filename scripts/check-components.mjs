/**
 * Verificación de los componentes EN UN NAVEGADOR REAL.
 *
 * POR QUÉ NO SON PRUEBAS NORMALES
 *
 * Los módulos de `src/lib` son funciones puras y se prueban con `node:test`, sin
 * DOM. Los componentes de `theme/assets/ne-components.js` son lo contrario: son
 * elementos personalizados, y su comportamiento depende de cosas que solo
 * existen en un navegador —`customElements`, `dataset`, eventos, radios,
 * `FormData`—. Simular eso con objetos falsos daría una prueba que pasa mientras
 * el navegador real falla, que es peor que no tener prueba.
 *
 * Así que esto carga el banco de pruebas en Chromium y comprueba el
 * comportamiento observable.
 *
 * QUÉ ENCONTRÓ YA: que `data-ne-3d-mode` se lee como `dataset['ne-3dMode']` y no
 * como `dataset.ne3dMode`, con lo que el ajuste de 3D del theme se ignoraba por
 * completo. Ninguna lectura del código lo habría dicho con certeza.
 *
 * DEPENDENCIA OPCIONAL, DECLARADA
 *
 * Necesita Playwright, que es la única dependencia externa del proyecto y NO se
 * versiona. Si no está, esta comprobación se declara NO EJECUTADA. No se declara
 * superada: afirmar que pasó algo que no corrió es el éxito falso que §183
 * prohíbe.
 *
 *   node scripts/check-components.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{name: string, problems: string[]}[]} */
const results = [];

/**
 * @param {string} name
 * @param {() => Promise<string[]>} fn
 */
async function check(name, fn) {
  try {
    results.push({ name, problems: (await fn()) ?? [] });
  } catch (error) {
    results.push({ name, problems: [`lanzó: ${error instanceof Error ? error.message : String(error)}`] });
  }
}

// ---------------------------------------------------------------------------
// Playwright y Chromium: opcionales y comprobados, no supuestos.
// ---------------------------------------------------------------------------
let chromium = null;
for (const spec of [process.env.NE_PLAYWRIGHT, 'playwright'].filter(Boolean)) {
  try {
    const mod = await import(spec);
    // Playwright se publica como CommonJS y como ESM: en el primer caso las
    // familias de navegador cuelgan de `default`, en el segundo son exports
    // nombrados. Se aceptan las dos formas en lugar de suponer una.
    chromium = mod.chromium ?? mod.default?.chromium ?? null;
    if (chromium) break;
  } catch {
    /* siguiente candidato */
  }
}

if (!chromium) {
  console.log('');
  console.log('N/E  componentes en navegador: Playwright no disponible');
  console.log('     (instálalo fuera del repositorio y apunta NE_PLAYWRIGHT a su módulo)');
  console.log('');
  console.log('NO EJECUTADA. Esto no cuenta como superada.');
  process.exitCode = 0;
  process.exit(0);
}

/**
 * Resuelve el puente de textos desde los archivos de idioma REALES.
 *
 * Lee la lista de claves que declara `theme.liquid` —`"clave": {{ 'ruta' | t:
 * var: '[[var]]' }}`— y la resuelve contra `locales/es.default.json`,
 * convirtiendo los huecos `{{ var }}` de Liquid en los `[[var]]` que el script
 * del theme rellena. Es un `t` mínimo, suficiente para este puente.
 *
 * Así el banco prueba los textos de la tienda, no una copia.
 *
 * @returns {Promise<Record<string, string>>}
 */
async function resolveStrings() {
  const layout = await readFile(path.join(ROOT, 'theme', 'layout', 'theme.liquid'), 'utf8');
  const locale = JSON.parse(
    await readFile(path.join(ROOT, 'theme', 'locales', 'es.default.json'), 'utf8'),
  );
  const block = layout.match(/<script type="application\/json" id="ne-strings">([\s\S]*?)<\/script>/);
  if (!block) throw new Error('theme.liquid no declara el bloque #ne-strings');

  /** @type {Record<string, string>} */
  const out = {};
  const line = /"([a-z0-9_]+)"\s*:\s*\{\{\s*'([^']+)'\s*\|\s*t([^}]*)\}\}/g;
  for (const m of block[1].matchAll(line)) {
    const [, key, lookup, rest] = m;
    let value = lookup.split('.').reduce((node, part) => node?.[part], locale);
    if (typeof value !== 'string') throw new Error(`la clave de idioma '${lookup}' no existe`);
    // Los argumentos del filtro `t`: `: size: '[[size]]', original: '[[original]]'`
    for (const arg of rest.matchAll(/([a-z_]+)\s*:\s*'([^']*)'/g)) {
      value = value.split(`{{ ${arg[1]} }}`).join(arg[2]);
    }
    out[key] = value;
  }
  return out;
}

const STRINGS = await resolveStrings();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Servidor estático mínimo.
 *
 * Hace falta porque un `<script type="module">` no se carga desde `file://`: el
 * navegador lo bloquea por origen. Es `node:http`, sin dependencias.
 */
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const target = path.join(ROOT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    let body = await readFile(target);
    if (target.endsWith('-harness.html')) {
      // Se sustituye el bloque de textos del banco por el resuelto de los
      // archivos de idioma reales.
      body = Buffer.from(
        body
          .toString('utf8')
          .replace(
            /(<script type="application\/json" id="ne-strings">)[\s\S]*?(<\/script>)/,
            `$1\n      ${JSON.stringify(STRINGS, null, 2).split('\n').join('\n      ')}\n    $2`,
          ),
      );
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('no encontrado');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const HARNESS = `http://127.0.0.1:${port}/scripts/fixtures/product-harness.html`;
const CART_HARNESS = `http://127.0.0.1:${port}/scripts/fixtures/cart-harness.html`;

const browser = await chromium.launch({ executablePath: process.env.NE_CHROMIUM ?? '/opt/pw-browsers/chromium' });

/**
 * Abre el banco con la analítica y la red instrumentadas.
 *
 * `Shopify.analytics.publish` se sustituye por un espía: es la única forma de
 * comprobar que el evento de talla se publica de verdad, y además evita enviar
 * nada a ningún sitio.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.attrs] Atributos a forzar antes de montar.
 * @returns {Promise<import('playwright').Page>}
 */
/**
 * Pulsa un chip por su etiqueta.
 *
 * Los radios están visualmente ocultos y envueltos por su `<label>`, que es lo
 * que una persona pulsa de verdad. Hacer click en el input directamente falla
 * —la etiqueta intercepta el puntero— y además probaría algo que nadie hace.
 *
 * @param {import('playwright').Page} page
 * @param {string} id
 */
async function pickChip(page, id) {
  await page.locator(`label[for="${id}"]`).click();
  await page.waitForTimeout(60);
}

/**
 * Contexto de iPhone, no de escritorio.
 *
 * POR QUÉ, Y POR QUÉ SE CAMBIÓ
 *
 * Este theme sirve primero a un teléfono. Las pruebas corrían en un contexto de
 * escritorio por defecto, así que verificaban un navegador que no es el que más
 * importa: sin `pointer: coarse`, sin `hasTouch`, con un viewport ancho donde
 * los puntos de ruptura de móvil no se aplican y donde las reglas que dependen
 * del puntero —como la contención del 3D— se comportan al contrario.
 *
 * Quien necesite escritorio lo pide explícitamente con `{ desktop: true }`.
 *
 * @param {{desktop?: boolean, url?: string}} [opts]
 */
function contextOptions(opts = {}) {
  if (opts.desktop) return {};
  return {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  };
}

async function openHarness(opts = {}) {
  const context = await browser.newContext(contextOptions(opts));
  const page = await context.newPage();
  page.__context = context;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Solo errores del propio script. Un 404 de un recurso del banco no dice
    // nada sobre los componentes y solo haría ruido.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  await page.addInitScript(() => {
    globalThis.__nePublished = [];
    globalThis.Shopify = {
      analytics: {
        publish(name, data) {
          globalThis.__nePublished.push({ name, data });
        },
      },
    };
    globalThis.__neRequests = [];
  });

  if (opts.attrs) {
    await page.addInitScript((attrs) => {
      document.addEventListener('DOMContentLoaded', () => {}, { once: true });
      globalThis.__neForcedAttrs = attrs;
    }, opts.attrs);
  }

  await page.goto(opts.url ?? HARNESS, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-ne-picker]')?.dataset.neEnhanced === 'true', {
    timeout: 5000,
  }).catch(() => {});
  page.__errors = errors;

  // Cerrar la página cierra su contexto. Sin esto quedaba un contexto abierto
  // por prueba, y veinte contextos vivos consumen memoria sin motivo.
  const closePage = page.close.bind(page);
  page.close = async () => {
    await closePage();
    await context.close();
  };

  return page;
}

/**
 * Estado de un chip, tal como lo vería el comprador.
 * @param {import('playwright').Page} page
 * @param {string} option
 */
function chipStates(page, option) {
  return page.evaluate((opt) => {
    const group = document.querySelector(`[data-ne-option="${opt}"]`);
    return Array.from(group.querySelectorAll('.ne-picker__chip')).map((chip) => {
      const input = chip.querySelector('input');
      const face = chip.querySelector('[data-ne-chip-face]');
      return {
        value: input.value,
        state: chip.dataset.neState,
        checked: input.checked,
        disabled: input.disabled,
        srText: chip.querySelector('[data-ne-chip-state]').textContent,
        lineThrough: getComputedStyle(face).textDecorationLine.includes('line-through'),
        borderStyle: getComputedStyle(face).borderTopStyle,
      };
    });
  }, option);
}

// ---------------------------------------------------------------------------
// 1 · El selector toma el mando, y solo entonces se oculta el control de reserva.
// ---------------------------------------------------------------------------
await check('el selector mejora y oculta el control de reserva', async () => {
  const page = await openHarness();
  const problems = [];

  const enhanced = await page.locator('[data-ne-picker]').getAttribute('data-ne-enhanced');
  if (enhanced !== 'true') problems.push('el selector no se marcó como mejorado');

  const fallbackVisible = await page.locator('[data-ne-picker-fallback]').isVisible();
  if (fallbackVisible) problems.push('el `<select>` de reserva sigue visible con el selector activo');

  // Oculto NO es ausente: sigue siendo el control que postea el `id`.
  // Se comprueba por FormData, que es lo que de verdad se envía.
  //
  // Nota verificada en Chromium: `form.id` NO devuelve el atributo id cuando el
  // formulario tiene un control llamado `id` —y este lo tiene, es el select de
  // variante—: el acceso con nombre gana y devuelve el elemento. Comprobarlo
  // así daba un falso negativo.
  const inForm = await page.evaluate(() => {
    const select = document.querySelector('[data-ne-variant-select]');
    if (!select || select.name !== 'id' || !(select.form instanceof HTMLFormElement)) return false;
    if (select.form.getAttribute('id') !== 'ne-product-form-banco') return false;
    return [...new FormData(select.form).keys()].includes('id');
  });
  if (!inForm) problems.push('el `<select name="id">` dejó de estar asociado al formulario que postea');

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 2 · AGOTADA e INEXISTENTE se distinguen. Es la razón de ser del componente.
// ---------------------------------------------------------------------------
await check('agotada e inexistente se pintan distinto', async () => {
  const page = await openHarness();
  const problems = [];

  // Partida: Color = Negro. La 41 en Negro existe y está agotada.
  const negro = await chipStates(page, 'Talla');
  const t41 = negro.find((c) => c.value === '41');
  if (t41.state !== 'unavailable') problems.push(`Negro/41 debería ser 'unavailable', es '${t41.state}'`);
  if (t41.disabled) problems.push('Negro/41 está agotada pero existe: no debe deshabilitarse');
  if (!t41.lineThrough) problems.push('Negro/41 no se pinta tachada');
  if (!t41.srText.includes('agotado')) problems.push(`Negro/41 no lo dice a un lector de pantalla: "${t41.srText}"`);

  // Cambio a Cuero: la 40 no se fabrica en Cuero.
  await pickChip(page, 'c-cuero');
  const cuero = await chipStates(page, 'Talla');
  const c40 = cuero.find((c) => c.value === '40');
  if (c40.state !== 'nonexistent') problems.push(`Cuero/40 debería ser 'nonexistent', es '${c40.state}'`);
  if (c40.borderStyle !== 'dashed') problems.push(`Cuero/40 no se pinta con borde discontinuo (es ${c40.borderStyle})`);
  if (!c40.srText.includes('no se fabrica')) problems.push(`Cuero/40 no lo dice a un lector de pantalla: "${c40.srText}"`);

  // SIGUE SIENDO ELEGIBLE, y esto es la corrección de un fallo real: cuando los
  // `nonexistent` se deshabilitaban, un color entero quedaba inalcanzable —para
  // llegar a Cuero había que cambiar de talla, pero la talla puesta solo existía
  // en Negro—. Elegirlo es lo que dispara la reconciliación.
  if (c40.disabled) {
    problems.push('Cuero/40 quedó deshabilitada: todo valor que la matriz lista es alcanzable');
  }

  // Y la 41 en Cuero sí se puede comprar: el mismo valor, otro estado.
  const c41 = cuero.find((c) => c.value === '41');
  if (c41.state !== 'available') problems.push(`Cuero/41 debería ser 'available', es '${c41.state}'`);

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 3 · Reconciliación: cambiar de color no deja la página en un estado imposible.
// ---------------------------------------------------------------------------
await check('cambiar de color suelta la talla imposible', async () => {
  const page = await openHarness();
  const problems = [];

  // Negro/40 de partida. Cuero no se fabrica en 40.
  await pickChip(page, 'c-cuero');

  const state = await page.evaluate(() => ({
    talla: document.querySelector('[data-ne-option="Talla"] [data-ne-chosen]').textContent,
    color: document.querySelector('[data-ne-option="Color"] [data-ne-chosen]').textContent,
    mensaje: document.querySelector('[data-ne-picker-message]').hidden
      ? null
      : document.querySelector('[data-ne-picker-message]').textContent.trim(),
    botonDesactivado: document.querySelector('[data-ne-add-to-cart]').disabled,
  }));

  if (state.color !== 'Cuero') problems.push(`el color que acaba de tocar debe conservarse, quedó "${state.color}"`);
  if (state.talla !== '') problems.push(`la talla imposible debe soltarse, quedó "${state.talla}"`);
  if (!state.mensaje || !state.mensaje.includes('Talla')) {
    problems.push(`debe pedirse la talla que falta, el mensaje fue "${state.mensaje}"`);
  }
  if (!state.botonDesactivado) problems.push('sin talla elegida el botón de añadir no puede estar activo');

  // Y al elegir una talla que sí existe en Cuero, la ficha vuelve a ser comprable.
  await pickChip(page, 't-42');
  const after = await page.evaluate(() => ({
    select: document.querySelector('[data-ne-variant-select]').value,
    precio: document.querySelector('[data-ne-price-current]').textContent.trim(),
    comparado: document.querySelector('.ne-price__compare').hidden
      ? null
      : document.querySelector('.ne-price__compare').textContent.trim(),
    sku: document.querySelector('[data-ne-sku]').textContent.trim(),
    url: location.search,
    botonDesactivado: document.querySelector('[data-ne-add-to-cart]').disabled,
  }));

  if (after.select !== '4005') problems.push(`el select debe apuntar a Cuero/42 (4005), apunta a ${after.select}`);
  if (after.precio !== '$130.000') problems.push(`el precio debe ser el de la variante, es "${after.precio}"`);
  if (after.comparado !== '$160.000') problems.push(`el precio comparado debe aparecer, es "${after.comparado}"`);
  if (after.sku !== 'BP-CUE-42') problems.push(`la referencia debe seguir a la variante, es "${after.sku}"`);
  if (!after.url.includes('variant=4005')) problems.push(`la URL debe llevar ?variant=4005, lleva "${after.url}"`);
  if (after.botonDesactivado) problems.push('con variante comprable el botón debe estar activo');

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 4 · El recomendador de talla, de punta a punta.
// ---------------------------------------------------------------------------
await check('el recomendador recomienda y deja rastro en la línea', async () => {
  const page = await openHarness();
  const problems = [];

  await page.locator('.ne-sizeguide__summary').click();
  // Coma decimal: en español es lo que se escribe, y un parseFloat directo
  // devolvería una talla menos.
  await page.locator('[data-ne-foot-input]').fill('25,9');
  await page.locator('[data-ne-recommend]').click();
  await page.waitForTimeout(50);

  const out = await page.evaluate(() => ({
    mensaje: document.querySelector('[data-ne-recommendation]').textContent.trim(),
    oculto: document.querySelector('[data-ne-recommendation]').hidden,
    aplicar: document.querySelector('[data-ne-apply-size]')?.textContent?.trim() ?? null,
  }));

  if (out.oculto) problems.push('la recomendación no se mostró');
  // 25,9 cae exactamente en la 41, que en Negro está AGOTADA: tiene que
  // sustituirla, no recomendar algo que no se puede comprar.
  if (!out.mensaje.includes('42')) {
    problems.push(`con la 41 agotada debe sustituir por la 42; dijo: "${out.mensaje}"`);
  }
  if (!/agotada/i.test(out.mensaje)) {
    problems.push(`debe decir que la suya está agotada; dijo: "${out.mensaje}"`);
  }

  if (!out.aplicar || !out.aplicar.includes('42')) {
    problems.push(`debe ofrecer elegir la talla recomendada; el botón dice "${out.aplicar}"`);
  }

  // El botón de aplicar la selecciona de verdad en el selector.
  await page.locator('[data-ne-apply-size]').click();
  await page.waitForTimeout(50);
  const applied = await page.evaluate(() => ({
    talla: document.querySelector('[data-ne-option="Talla"] [data-ne-chosen]').textContent,
    select: document.querySelector('[data-ne-variant-select]').value,
  }));
  if (applied.talla !== '42') problems.push(`aplicar la talla no la seleccionó, quedó "${applied.talla}"`);
  if (applied.select !== '4003') problems.push(`el select debe apuntar a Negro/42 (4003), apunta a ${applied.select}`);

  // Rastro en la línea de carrito: PERSISTE AL PEDIDO, y es el único canal que
  // permite cruzar después recomendación con devolución.
  const attrs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ne-attr]')).map((i) => ({
      key: i.getAttribute('data-ne-attr'),
      value: i.value,
      disabled: i.disabled,
    })),
  );
  const get = (k) => attrs.find((a) => a.key === k);

  if (get('_ne_foot_length_cm').disabled || get('_ne_foot_length_cm').value !== '25.9') {
    problems.push(`la medida debe viajar al pedido; va "${get('_ne_foot_length_cm').value}" (deshabilitado: ${get('_ne_foot_length_cm').disabled})`);
  }
  if (get('_ne_size_recommended').disabled || get('_ne_size_recommended').value !== '42') {
    problems.push(`la talla recomendada debe viajar; va "${get('_ne_size_recommended').value}"`);
  }
  if (get('_ne_size_chosen').disabled || get('_ne_size_chosen').value !== '42') {
    problems.push(`la talla elegida debe viajar; va "${get('_ne_size_chosen').value}"`);
  }
  if (get('_ne_size_followed').value !== 'true') {
    problems.push(`debe registrar que siguió la recomendación; va "${get('_ne_size_followed').value}"`);
  }
  if (get('_ne_size_guide_used').value !== 'true') {
    problems.push(`debe registrar que abrió la guía; va "${get('_ne_size_guide_used').value}"`);
  }

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 5 · El evento de talla se publica, una vez, y sin precio.
// ---------------------------------------------------------------------------
await check('el evento de talla se publica sin duplicar y sin precio', async () => {
  const page = await openHarness();
  const problems = [];

  await pickChip(page, 't-42');
  await pickChip(page, 't-42'); // misma talla otra vez: no debe duplicar

  const published = await page.evaluate(() => globalThis.__nePublished);
  const sizeEvents = published.filter((e) => e.name === 'ne:size_selected');

  if (sizeEvents.length !== 1) {
    problems.push(`debe publicarse una vez por talla distinta; se publicó ${sizeEvents.length} vez/veces`);
  }
  if (sizeEvents.length > 0) {
    const data = sizeEvents[0].data;
    if (data.size !== '42') problems.push(`la talla publicada es "${data.size}"`);
    if (data.status !== 'available') problems.push(`el estado publicado es "${data.status}"`);
    if (data.product_id !== '9999999999') problems.push(`el producto publicado es "${data.product_id}"`);
    // El precio se omite a propósito: incluirlo invitaría a sumar ingresos desde
    // un evento de cliente, que es la métrica mentirosa que el proyecto evita.
    const forbidden = Object.keys(data).filter((k) => /price|revenue|total|valor/i.test(k));
    if (forbidden.length > 0) problems.push(`el evento no debe llevar dinero: ${forbidden.join(', ')}`);
  }

  // Cambiar de color no debe contarse como una nueva selección de talla.
  await pickChip(page, 'c-cuero');
  const after = await page.evaluate(() => globalThis.__nePublished.filter((e) => e.name === 'ne:size_selected').length);
  if (after !== 1) problems.push(`cambiar de color publicó una selección de talla de más (${after} en total)`);

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 6 · Añadir al carrito: intercepta, usa la ruta de Shopify, no recarga.
// ---------------------------------------------------------------------------
await check('añadir al carrito usa la ruta de Shopify sin recargar', async () => {
  const page = await openHarness();
  const problems = [];

  await page.route('**/cart/add', async (route) => {
    const request = route.request();
    await page.evaluate(
      (payload) => globalThis.__neRequests.push(payload),
      { method: request.method(), body: request.postData() ?? '' },
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 4003, quantity: 1, sections: {} }),
    });
  });

  // Una marca en `window` sobrevive a `history.replaceState` y NO sobrevive a una
  // navegación real. `framenavigated` no sirve: Playwright también lo emite para
  // las navegaciones del mismo documento, y el selector usa `replaceState` para
  // mantener `?variant=`, así que daba un falso positivo.
  await page.evaluate(() => {
    globalThis.__neAlive = true;
  });

  await pickChip(page, 't-42');
  await page.locator('[data-ne-add-to-cart]').click();
  await page.waitForTimeout(400);

  const alive = await page.evaluate(() => globalThis.__neAlive === true);
  if (!alive) problems.push('el documento se recargó: la intercepción no funcionó');

  const requests = await page.evaluate(() => globalThis.__neRequests);
  if (requests.length !== 1) {
    problems.push(`debe hacerse exactamente una petición; se hicieron ${requests.length}`);
  } else {
    const body = requests[0].body;
    if (requests[0].method !== 'POST') problems.push(`el método debe ser POST, fue ${requests[0].method}`);
    if (!body.includes('4003')) problems.push('la petición no lleva el id de la variante elegida');
    if (!body.includes('sections')) problems.push('la petición no pide la sección de cabecera para repintar el contador');
    if (!body.includes('sections--banco__header')) {
      problems.push('la sección pedida no es la que declara el marcado: el contador no se actualizaría');
    }
    // Las atribuciones vacías no viajan.
    if (body.includes('_ne_size_recommended')) {
      problems.push('una atribución sin valor viajó al pedido');
    }
  }

  const label = await page.locator('[data-ne-add-label]').textContent();
  if (label.trim() !== 'Añadido') problems.push(`debe confirmarse en el botón; dice "${label.trim()}"`);

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 7 · El 3D es opcional de verdad, y el ajuste del theme se respeta.
// ---------------------------------------------------------------------------
await check('el 3D respeta el ajuste del theme y degrada a la fotografía', async () => {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  const problems = [];

  // 7a · modo `off`: no se ofrece 3D en absoluto.
  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });
  // El modo llega por la URL del banco y se aplica al atributo antes de que el
  // componente monte, igual que Liquid lo renderizaría.
  await page.goto(`${HARNESS}?model_mode=off`, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  const offState = await page.evaluate(() => ({
    triggerVisible: !document.querySelector('[data-ne-model-trigger]').hidden,
    slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
    fotoVisible: !document.querySelector('[data-ne-model-fallback]').hidden,
  }));
  if (offState.triggerVisible) {
    problems.push('con el ajuste en «off» no debe ofrecerse 3D: el ajuste del theme se está ignorando');
  }
  if (!offState.slotHidden) problems.push('con «off» el visor no debe estar visible');
  if (!offState.fotoVisible) problems.push('la fotografía debe seguir siendo la experiencia');
  await page.close();

  // 7b · a demanda: el visor no se revela hasta que se pide, y si no carga, se
  //      vuelve a la fotografía y se dice. El banco no trae ningún modelo, así
  //      que el visor nunca emite `load`: es el camino de fallo real.
  const page2 = await openHarness();
  const before = await page2.evaluate(() => ({
    slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
    triggerVisible: !document.querySelector('[data-ne-model-trigger]').hidden,
  }));
  if (!before.slotHidden) problems.push('a demanda el visor no debe cargarse de entrada');
  if (!before.triggerVisible) problems.push('a demanda debe ofrecerse el botón de 3D');

  await page2.locator('[data-ne-model-trigger]').click();
  await page2.waitForTimeout(100);
  const during = await page2.evaluate(() => ({
    slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
    etiqueta: document.querySelector('[data-ne-model-trigger]').textContent.trim(),
    cargando: document.querySelector('[data-ne-model-trigger]').dataset.neLoading,
  }));
  if (during.slotHidden) problems.push('al pedirlo, el visor debe revelarse');
  if (during.cargando !== 'true') problems.push('debe indicarse que está cargando');
  if (during.etiqueta !== 'Cargando el modelo') problems.push(`la etiqueta de carga dice "${during.etiqueta}"`);

  const arHidden = await page2.evaluate(() => document.querySelector('[data-ne-ar-trigger]').hidden);
  if (!arHidden) problems.push('sin visor que confirme AR, el botón de AR no debe aparecer');

  if (page2.__errors.length > 0) problems.push(`errores en consola: ${page2.__errors.join(' | ')}`);
  await page2.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 7bis · «Menos movimiento» se obedece. En el CSS Y en el 3D.
//
//   Esto estaba escrito y NO estaba comprobado en ejecución. El CSS tiene su
//   media query y el script consulta `matchMedia`, pero nada verificaba que el
//   navegador acabara haciendo lo que se pretende. Una media query mal escrita
//   —o un token que alguien mueva fuera del bloque— no rompe nada visible: solo
//   deja de obedecer a quien pidió menos movimiento, que es justo la persona que
//   no va a reportarlo.
//
//   Se comprueban las dos mitades del contrato:
//
//     · el CSS: las duraciones se colapsan y el desplazamiento suave se apaga;
//     · el 3D: con `eager` pedido en el theme, el visor NO se abre solo. Un
//       contexto WebGL arrancando sin que nadie lo pida es exactamente el
//       movimiento que se está rechazando.
//
//   La mitad del 3D se mide en ESCRITORIO a propósito: en un teléfono `eager`
//   no se honra nunca, así que ahí la rama de «menos movimiento» quedaría tapada
//   por la del dispositivo y la prueba pasaría sin probar nada.
// ---------------------------------------------------------------------------
await check('«menos movimiento» se obedece en el CSS y en el 3D', async () => {
  const problems = [];

  // 7bis-a · el CSS, en el banco real y con el CSS real.
  for (const [motion, shouldAnimate] of [['reduce', false], ['no-preference', true]]) {
    const context = await browser.newContext({ ...contextOptions(), reducedMotion: motion });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(HARNESS, { waitUntil: 'load' });

    const css = await page.evaluate(() => {
      const button = document.querySelector('.ne-button');
      const root = document.documentElement;
      const styles = getComputedStyle(button);
      /** Suma de las duraciones declaradas, en milisegundos. */
      const total = styles.transitionDuration
        .split(',')
        .map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000))
        .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return {
        transitionMs: total,
        scrollBehavior: getComputedStyle(root).scrollBehavior,
        token: getComputedStyle(root).getPropertyValue('--ne-dur').trim(),
      };
    });
    await page.close();
    await context.close();

    if (shouldAnimate) {
      if (css.transitionMs <= 1) {
        problems.push(`sin preferencia las transiciones deberían durar algo y duran ${css.transitionMs} ms`);
      }
      if (css.scrollBehavior !== 'smooth') {
        problems.push(`sin preferencia el desplazamiento debería ser suave y es "${css.scrollBehavior}"`);
      }
    } else {
      if (css.transitionMs > 1) {
        problems.push(`con «menos movimiento» las transiciones todavía duran ${css.transitionMs} ms`);
      }
      if (css.scrollBehavior !== 'auto') {
        problems.push(`con «menos movimiento» el desplazamiento suave sigue activo: "${css.scrollBehavior}"`);
      }
      if (css.token !== '0ms') {
        problems.push(`con «menos movimiento» el token de duración vale "${css.token}" en lugar de 0ms`);
      }
    }
  }

  // 7bis-b · el 3D con `eager` pedido: en escritorio, para que la rama que se
  //          mide sea la de «menos movimiento» y no la del dispositivo.
  for (const [motion, shouldOpen] of [['reduce', false], ['no-preference', true]]) {
    const context = await browser.newContext({ ...contextOptions({ desktop: true }), reducedMotion: motion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(`${HARNESS}?model_mode=eager`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => ({
      slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
      expanded: document.querySelector('[data-ne-model-trigger]').getAttribute('aria-expanded'),
    }));
    await page.close();
    await context.close();

    if (errors.length > 0) problems.push(`errores con reducedMotion=${motion}: ${errors.join(' | ')}`);

    if (shouldOpen && state.slotHidden) {
      problems.push('con `eager` y sin preferencia de movimiento el visor debería abrirse solo, y no se abre');
    }
    if (!shouldOpen && !state.slotHidden) {
      problems.push('con «menos movimiento» el visor 3D se abrió solo: arranca un contexto WebGL que nadie pidió');
    }
    if (!shouldOpen && state.expanded === 'true') {
      problems.push('con «menos movimiento» el botón de 3D se anuncia como expandido sin que nadie lo pidiera');
    }
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 8 · SE COMPRA SIN JAVASCRIPT. Es el requisito que sostiene todo lo demás.
// ---------------------------------------------------------------------------
await check('la ficha se compra con JavaScript desactivado', async () => {
  const problems = [];
  const context = await browser.newContext({ ...contextOptions(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(HARNESS, { waitUntil: 'load' });

  // Que JavaScript está desactivado se comprueba POR EL EFECTO: nadie montó los
  // componentes, así que nadie marcó `data-ne-enhanced`. No vale `evaluate`:
  // Playwright lo inyecta por el protocolo de depuración y sigue funcionando
  // aunque la página no pueda ejecutar sus propios scripts.
  const enhanced = await page.locator('[data-ne-picker]').getAttribute('data-ne-enhanced');
  if (enhanced !== null) {
    problems.push('el contexto no tenía JavaScript desactivado: la comprobación no vale');
  }

  // Se inspecciona solo con selectores.
  const selectVisible = await page.locator('[data-ne-variant-select]').isVisible();
  if (!selectVisible) problems.push('sin JavaScript el `<select>` de variante tiene que estar visible');

  const chipsVisible = await page.locator('[data-ne-option="Talla"] .ne-picker__values').isVisible();
  if (chipsVisible) problems.push('sin JavaScript los chips quedan inertes: no deben mostrarse como si funcionaran');

  const action = await page.locator('#ne-product-form-banco').getAttribute('action');
  if (!action || !action.includes('/cart/add')) problems.push(`el formulario debe postear a /cart/add, postea a "${action}"`);

  const submitEnabled = await page.locator('[data-ne-add-to-cart]').isEnabled();
  if (!submitEnabled) problems.push('sin JavaScript el botón de añadir tiene que estar activo');

  const guideOpens = await page.locator('.ne-sizeguide__details').isVisible();
  if (!guideOpens) problems.push('la guía de tallas usa <details>: debe seguir abriéndose sin JavaScript');

  await context.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 7bis · El 3D no se adelanta en un teléfono, y se apaga al salir de la vista.
//
//        Las dos mitades de la directiva de rendimiento: no cargar lo pesado
//        antes de que haga falta, y soltar lo que ya no se está mirando. Un
//        contexto WebGL abierto consume GPU y batería mientras el comprador lee
//        la ficha cien píxeles más abajo.
// ---------------------------------------------------------------------------
await check('el 3D se contiene en móvil y se apaga fuera de la vista', async () => {
  const problems = [];

  // 7bis-a · En un teléfono, `eager` no se honra. No es una suposición sobre el
  //          dispositivo: es una decisión de prioridad.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await mobile.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });
  await mobile.goto(`${HARNESS}?model_mode=eager`, { waitUntil: 'load' });
  await mobile.waitForTimeout(400);

  const onPhone = await mobile.evaluate(() => ({
    coarse: matchMedia('(hover: none) and (pointer: coarse)').matches,
    slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
    triggerVisible: !document.querySelector('[data-ne-model-trigger]').hidden,
    fotoVisible: !document.querySelector('[data-ne-model-fallback]').hidden,
  }));

  if (!onPhone.coarse) {
    problems.push('el contexto no se comporta como un teléfono: la comprobación no vale');
  } else {
    if (!onPhone.slotHidden) {
      problems.push('con `eager` en un teléfono el 3D NO debe abrirse solo: es el recurso más pesado y compite por GPU y datos');
    }
    if (!onPhone.triggerVisible) problems.push('debe seguir ofreciéndose el 3D a un toque');
    if (!onPhone.fotoVisible) problems.push('la fotografía debe seguir siendo la experiencia');
  }
  await phone.close();

  // 7bis-b · Al salir de la vista, se cierra y se libera.
  const page = await openHarness();
  await page.locator('[data-ne-model-trigger]').click();
  await page.waitForTimeout(150);

  if (await page.evaluate(() => document.querySelector('[data-ne-model-slot]').hidden)) {
    problems.push('el visor debería estar abierto antes de comprobar que se apaga');
  }

  // Se instrumenta lo que el componente llama al liberar: `model-viewer` no
  // expone un «destruir», así que lo que se puede comprobar de verdad es que se
  // le pide volver al póster y dejar de renderizar.
  await page.evaluate(() => {
    const viewer = document.querySelector('model-viewer');
    globalThis.__released = [];
    viewer.pause = () => globalThis.__released.push('pause');
    viewer.showPoster = () => globalThis.__released.push('showPoster');
  });

  // Fuera de la vista de verdad, más allá del margen de 200px del observador.
  await page.evaluate(() => {
    const filler = document.createElement('div');
    filler.style.height = '3000px';
    document.body.append(filler);
    globalThis.scrollTo(0, 2800);
  });
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => ({
    slotHidden: document.querySelector('[data-ne-model-slot]').hidden,
    fotoVisible: !document.querySelector('[data-ne-model-fallback]').hidden,
    released: globalThis.__released ?? [],
    etiqueta: document.querySelector('[data-ne-model-trigger]').textContent.trim(),
  }));

  if (!after.slotHidden) problems.push('al salir de la vista el visor debe cerrarse');
  if (!after.fotoVisible) problems.push('al cerrarse debe volver la fotografía');
  if (!after.released.includes('showPoster')) {
    problems.push(`debe pedirse al visor volver al póster y dejar de renderizar; se llamó a: ${after.released.join(', ') || '(nada)'}`);
  }
  if (after.etiqueta !== 'Ver en 3D') {
    problems.push(`el botón debe volver a ofrecer el 3D; dice "${after.etiqueta}"`);
  }

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 7ter · El vídeo de un tercero no se carga hasta que alguien lo pide.
//
//        Un embed de YouTube o Vimeo trae varios cientos de KB de JavaScript
//        ajeno, cookies y conexiones a dominios que no son Shopify, y lo hace en
//        la carga inicial aunque nadie vaya a verlo. En una ficha de producto el
//        vídeo casi nunca es lo primero que se mira.
// ---------------------------------------------------------------------------
await check('el vídeo de un tercero espera a que se lo pidan', async () => {
  const problems = [];
  const page = await openHarness();

  // El `<template>` es la clave: el navegador lo parsea y no carga su
  // contenido. Si hubiera un `<iframe>` vivo en el documento, ya habría salido
  // una petición al tercero.
  const before = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe').length,
    dentroDelTemplate: document.querySelector('[data-ne-video-embed]')?.content?.querySelectorAll('iframe').length ?? 0,
    boton: !!document.querySelector('[data-ne-video-play]'),
    miniatura: !!document.querySelector('[data-ne-video-facade] img'),
  }));

  if (before.iframes !== 0) {
    problems.push(`hay ${before.iframes} iframe(s) en el documento antes de pedir el vídeo: el tercero ya se cargó`);
  }
  if (before.dentroDelTemplate !== 1) {
    problems.push('el embed debe estar dentro de un <template>, que no se carga');
  }
  if (!before.boton) problems.push('falta el botón de reproducir');
  if (!before.miniatura) problems.push('falta la miniatura: el comprador vería un hueco');

  await page.locator('[data-ne-video-play]').click();
  await page.waitForTimeout(150);

  const after = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe').length,
    boton: !!document.querySelector('[data-ne-video-play]'),
  }));

  if (after.iframes !== 1) problems.push(`tras pedirlo debe haber exactamente un iframe; hay ${after.iframes}`);
  if (after.boton) problems.push('el botón debe desaparecer al cambiarse por el vídeo');

  if (page.__errors.length > 0) problems.push(`errores en consola: ${page.__errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 8bis · La red de seguridad: si el módulo no llega, vuelve el control que
//        permite comprar.
//
//        Tener JavaScript NO es lo mismo que que el módulo haya montado. La
//        maquetación se decide antes del primer paint para que la página no se
//        desplace, y eso significa que los chips se pintan contando con un
//        script que todavía no ha llegado. Si no llega —error de red, error de
//        sintaxis, un bloqueador—, unos chips inertes prometerían algo que no
//        funciona y la venta se perdería en silencio.
// ---------------------------------------------------------------------------
await check('si el módulo no llega, vuelve el control de reserva', async () => {
  const problems = [];
  const page = await browser.newPage();
  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });

  // Se bloquea el módulo: es exactamente lo que pasa con un fallo de red.
  await page.route('**/ne-components.js', (route) => route.abort());
  await page.goto(HARNESS, { waitUntil: 'load' });

  // Antes de que venza la red de seguridad, los chips siguen pintados: es el
  // precio de no desplazar la página, y es temporal.
  const before = await page.evaluate(() => ({
    marca: document.documentElement.classList.contains('ne-js'),
    chips: getComputedStyle(document.querySelector('.ne-picker__values')).display,
  }));
  if (!before.marca) problems.push('la marca de JavaScript debería estar puesta desde el primer paint');

  // Y al vencer, el `<select>` vuelve.
  await page.waitForFunction(() => !document.documentElement.classList.contains('ne-js'), {
    timeout: 6000,
  }).catch(() => {});

  const after = await page.evaluate(() => ({
    marca: document.documentElement.classList.contains('ne-js'),
    chips: getComputedStyle(document.querySelector('.ne-picker__values')).display,
    selectVisible: getComputedStyle(document.querySelector('[data-ne-picker-fallback]')).display !== 'none',
    enhanced: document.querySelector('[data-ne-picker]').getAttribute('data-ne-enhanced'),
  }));

  if (after.marca) problems.push('la marca de JavaScript debía retirarse al no montar el módulo');
  if (after.chips !== 'none') problems.push(`los chips inertes deben dejar de pintarse; siguen en display:${after.chips}`);
  if (!after.selectVisible) problems.push('el `<select>` que permite comprar debe volver a estar visible');
  if (after.enhanced !== null) problems.push('nada debería haberse marcado como mejorado');

  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 8ter · TODOS los bancos cargan su grafo de módulos sin un solo error.
//
//        Nació de un fallo que envenenó una medición: el banco de la portada no
//        tenía import map, así que `ne-components.js` lanzaba «Failed to resolve
//        module specifier» y NINGÚN elemento personalizado se definía. La
//        portada no tiene componentes que mejorar, así que la página se veía
//        perfecta —y la medición de rendimiento dio un número buenísimo de una
//        página con el JavaScript roto.
//
//        Un error de módulo no se ve. Hay que preguntarlo.
// ---------------------------------------------------------------------------
await check('todos los bancos definen sus componentes sin errores', async () => {
  const problems = [];
  const EXPECTED = ['ne-variant-picker', 'ne-size-guide', 'ne-product-gallery', 'ne-cart', 'ne-cod-coverage'];

  // La portada NO entra: su plantilla no emite el módulo a propósito, porque no
  // tiene ni un componente. Exigirle que los defina sería exigirle que cargue
  // 46 KB para nada. Lo que sí se le exige, abajo, es cargar SIN errores.
  for (const file of ['product-harness.html', 'cart-harness.html', 'cart-empty-harness.html']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url().split('/').pop()}`);
    });
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    // El módulo se registra entero o no se registra: si falta uno, el grafo
    // falló antes de llegar a los `define`.
    const defined = await page.evaluate(
      (tags) => tags.filter((t) => !!customElements.get(t)),
      EXPECTED,
    );
    await page.close();

    if (errors.length > 0) {
      problems.push(`${file}: ${errors.join(' | ')}`);
    }
    if (defined.length !== EXPECTED.length) {
      const missing = EXPECTED.filter((t) => !defined.includes(t));
      problems.push(`${file}: no se definieron ${missing.join(', ')}: el grafo de módulos no llegó al final`);
    }
  }

  // La portada Y LA COLECCIÓN: sin errores, sin módulo y SIN NINGÚN componente
  // definido. Si alguno apareciera, significaría que están cargando JavaScript
  // que no usan. La colección entra aquí porque su panel de filtros es un
  // formulario y un `<details>`: nada de eso necesita una línea de script, y
  // esta comprobación es la que impide que alguien se la añada sin darse cuenta.
  for (const file of ['home-harness.html', 'collection-harness.html']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url().split('/').pop()}`);
    });
    const scripts = [];
    page.on('request', (r) => {
      const name = r.url().split('/').pop() ?? '';
      if (name.endsWith('.js')) scripts.push(name);
    });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const defined = await page.evaluate(
      (tags) => tags.filter((t) => !!customElements.get(t)),
      EXPECTED,
    );
    await page.close();

    if (errors.length > 0) problems.push(`${file}: ${errors.join(' | ')}`);
    if (scripts.length > 0) {
      problems.push(`${file} descargó JavaScript que no usa: ${scripts.join(', ')}`);
    }
    if (defined.length > 0) {
      problems.push(`${file} definió componentes que no tiene: ${defined.join(', ')}`);
    }
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 8ante · NI HABLA CON NADIE MÁS, NI GUARDA NADA EN EL DISPOSITIVO.
//
//   Hay una comprobación estática que busca dominios de terceros en el Liquid.
//   No basta: un `@import` dentro del CSS, una fuente remota, un píxel en una
//   imagen o una llamada desde el script no aparecen leyendo el marcado. Lo
//   único que lo demuestra es mirar las peticiones que el navegador hace de
//   verdad.
//
//   Y lo mismo con el almacenamiento. Una cookie, un `localStorage` o un
//   `sessionStorage` escritos antes de que nadie acepte nada convierten al
//   theme en parte del problema de consentimiento, en lugar de dejar ese asunto
//   donde le corresponde: en el banner de Shopify y en la API de privacidad.
//
//   Lo que este theme guarda hoy es NADA. Esta comprobación existe para que
//   siga siendo nada, y para que el día que deje de serlo sea una decisión
//   consciente y no un efecto secundario.
// ---------------------------------------------------------------------------
await check('no habla con nadie más ni guarda nada en el dispositivo', async () => {
  const problems = [];

  for (const file of [
    'home-harness.html',
    'collection-harness.html',
    'product-harness.html',
    'cart-harness.html',
    'cart-empty-harness.html',
  ]) {
    const context = await browser.newContext(contextOptions());
    const page = await context.newPage();
    const foreign = new Set();
    page.on('request', (r) => {
      let url;
      try {
        url = new URL(r.url());
      } catch {
        return;
      }
      // `data:` y `blob:` no salen a la red. Todo lo demás que no sea el propio
      // banco es una conexión a otro sitio.
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') foreign.add(url.origin);
    });
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() => {
      const read = (store) => {
        try {
          return Array.from({ length: store.length }, (_, i) => store.key(i));
        } catch {
          return [];
        }
      };
      let cookie = '';
      try {
        cookie = document.cookie;
      } catch {
        /* bloqueado: nada que informar */
      }
      return {
        local: read(globalThis.localStorage ?? { length: 0 }),
        session: read(globalThis.sessionStorage ?? { length: 0 }),
        cookie,
      };
    });
    await page.close();
    await context.close();

    if (foreign.size > 0) {
      problems.push(`${file}: pidió recursos a ${[...foreign].join(', ')}`);
    }
    if (stored.local.length > 0) {
      problems.push(`${file}: escribió en localStorage (${stored.local.join(', ')}) sin que nadie lo aceptara`);
    }
    if (stored.session.length > 0) {
      problems.push(`${file}: escribió en sessionStorage (${stored.session.join(', ')})`);
    }
    if (stored.cookie.length > 0) {
      problems.push(`${file}: puso cookies desde el theme (${stored.cookie.slice(0, 80)})`);
    }
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 8pre · LA NAVEGACIÓN EXISTE EN EL TELÉFONO.
//
//   Esto parece una obviedad y fue un defecto real de este theme durante todo
//   el proyecto: `.ne-header__nav { display: none }` por debajo de 48em, sin
//   cajón, sin botón y sin nada que lo sustituyera. En un teléfono —el
//   dispositivo que esta tienda sirve primero— la tienda NO TENÍA NAVEGACIÓN.
//
//   Y estuvo invisible precisamente porque todas las comprobaciones corrían a
//   980px de ancho, donde la media query de escritorio sí se aplica. Las dos
//   cosas se arreglaron juntas, y esta comprobación es la que impide que la
//   primera vuelva.
//
//   Se mide en los DOS anchos: que exista en el teléfono, y que la maqueta de
//   escritorio siga siendo de una sola fila.
// ---------------------------------------------------------------------------
await check('la navegación existe en el teléfono', async () => {
  const problems = [];

  for (const [label, opts, expectRows] of [
    ['teléfono 390', contextOptions(), 2],
    ['escritorio 1280', { viewport: { width: 1280, height: 900 } }, 1],
  ]) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.Shopify = { analytics: { publish() {} } };
    });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/collection-harness.html`, { waitUntil: 'load' });

    const header = await page.evaluate(() => {
      const nav = document.querySelector('.ne-header__nav');
      const links = [...document.querySelectorAll('.ne-header__link')];
      const brand = document.querySelector('.ne-header__brand');
      const box = (el) => (el ? el.getBoundingClientRect() : null);
      const navBox = box(nav);
      const brandBox = box(brand);
      return {
        navExists: !!nav,
        navDisplay: nav ? getComputedStyle(nav).display : null,
        navHeight: navBox ? Math.round(navBox.height) : 0,
        // Dos filas = el menú empieza por debajo del logotipo.
        rows: navBox && brandBox && navBox.top >= brandBox.bottom - 1 ? 2 : 1,
        links: links.map((el) => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
        }),
        pageScrollsSideways: document.documentElement.scrollWidth > globalThis.innerWidth + 1,
      };
    });
    await page.close();
    await context.close();

    if (!header.navExists) {
      problems.push(`${label}: no hay cabecera con navegación en el marcado`);
      continue;
    }
    if (header.navDisplay === 'none' || header.navHeight === 0) {
      problems.push(`${label}: la navegación está OCULTA (display: ${header.navDisplay}, alto ${header.navHeight})`);
    }
    if (header.links.length === 0) {
      problems.push(`${label}: la navegación no tiene ni un enlace`);
    }
    for (const link of header.links) {
      if (link.h < 24 || link.w < 24) {
        problems.push(`${label}: el enlace «${link.text}» mide ${link.w}×${link.h}, por debajo de 24×24`);
      }
    }
    if (header.rows !== expectRows) {
      problems.push(
        `${label}: la cabecera se maqueta en ${header.rows} fila(s) y se esperaban ${expectRows}`,
      );
    }
    if (header.pageScrollsSideways) {
      problems.push(`${label}: la página se desplaza en horizontal, así que algo no cabe`);
    }
  }

  return problems;
});

// ---------------------------------------------------------------------------
// 8bis · El panel de filtros envía EXACTAMENTE lo que Shopify espera.
//
//   Un panel de filtros que se ve bien y manda mal los parámetros devuelve
//   resultados —los equivocados—, y eso no se nota mirando la página. Lo que se
//   comprueba aquí es la peticion que el navegador va a hacer de verdad.
//
//   Tres cosas que, si se rompen, rompen la navegación entera:
//
//     · Marcar dos tallas tiene que mandar LAS DOS. Es el fallo clásico de un
//       panel de casillas: si cada una lleva su propio `name`, la última gana.
//     · El orden tiene que viajar CON los filtros. Dos formularios separados
//       harían que ordenar borrase lo filtrado.
//     · `page` NO puede viajar. Al cambiar un filtro el resultado es otro, y
//       conservar «página 7» deja al comprador en una página que no existe.
// ---------------------------------------------------------------------------
await check('el panel de filtros envía lo que Shopify espera', async () => {
  const problems = [];
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/collection-harness.html`, { waitUntil: 'load' });

  // Se lee la petición de navegación que el formulario provoca, no una
  // reconstrucción nuestra de lo que creemos que provoca.
  const sent = async () => {
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.isNavigationRequest() && r.url().includes('/collections/all'), { timeout: 4000 }),
      page.locator('.ne-filters button[type="submit"]').click(),
    ]);
    return new URL(request.url());
  };

  // La 41 ya viene marcada en el banco. Se marca también la 40.
  await page.locator('#ne-filter-filter\\.v\\.option\\.talla-1').check();
  let url = await sent();
  let talla = url.searchParams.getAll('filter.v.option.talla');

  if (!(talla.includes('40') && talla.includes('41'))) {
    problems.push(`marcar dos tallas mandó ${JSON.stringify(talla)}: se pierde una, así que filtraría por la otra`);
  }
  if (url.searchParams.get('sort_by') !== 'manual') {
    problems.push(`el orden no viajó con los filtros: sort_by=${url.searchParams.get('sort_by')}`);
  }
  if (url.searchParams.has('page')) {
    problems.push('el formulario reenvió `page`: al filtrar dejaría al comprador en una página que puede no existir');
  }

  // Y al desmarcarlo todo, el parámetro tiene que DESAPARECER, no quedarse
  // vacío: `filter.v.option.talla=` filtraría por la talla «nada».
  await page.goBack({ waitUntil: 'load' }).catch(() => {});
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/collection-harness.html`, { waitUntil: 'load' });
  await page.locator('#ne-filter-filter\\.v\\.option\\.talla-2').uncheck();
  url = await sent();
  talla = url.searchParams.getAll('filter.v.option.talla');
  if (talla.length > 0) {
    problems.push(`sin ninguna talla marcada todavía mandó ${JSON.stringify(talla)}`);
  }

  await page.close();
  await context.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 8ter · Y funciona con JavaScript DESACTIVADO, porque no lo usa.
//
//   El acordeón es `<details>` y quitar un filtro es un `<a href>`. Las dos
//   cosas son del navegador, no del theme. Esta comprobación existe para que
//   nadie las sustituya por un botón con `onclick` sin que algo lo cante: ese
//   cambio no rompe nada visible, y rompe la página entera sin script.
// ---------------------------------------------------------------------------
await check('el panel de filtros funciona sin JavaScript', async () => {
  const problems = [];
  const context = await browser.newContext({ ...contextOptions(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/collection-harness.html`, { waitUntil: 'load' });

  // El grupo con algo elegido viene abierto: la decisión del comprador no se
  // esconde detrás de un acordeón cerrado.
  const openGroups = await page.locator('details.ne-filter[open]').count();
  if (openGroups < 1) {
    problems.push('ningún grupo de filtros viene abierto: lo ya elegido quedaría escondido');
  }

  // Y un grupo cerrado se abre pulsando su resumen. Sin una línea de script.
  //
  // Se resuelve a un HANDLE antes de pulsar, no a un `locator`. Un `locator` es
  // una CONSULTA que se vuelve a evaluar en cada uso: con
  // `details:not([open])` el clic abría el grupo correcto y la lectura
  // posterior ya apuntaba al SIGUIENTE grupo cerrado, que lógicamente seguía
  // cerrado. La prueba fallaba con la página buena. Y el mismo error, en otra
  // comprobación, podría hacerla pasar con la página mala.
  const closed = await page.locator('details.ne-filter:not([open])').first().elementHandle();
  if (!closed) {
    problems.push('no hay ningún grupo de filtros cerrado: no se puede comprobar que el acordeón abra');
  } else {
    await (await closed.$('summary')).click();
    if (!(await closed.evaluate((el) => el.open))) {
      problems.push('el acordeón no abrió sin JavaScript: alguien lo cambió por un control que necesita script');
    }
  }

  // Quitar un filtro es un enlace de verdad, con destino de verdad.
  const chip = page.locator('a.ne-chip-remove').first();
  const href = await chip.getAttribute('href');
  if (!href || href === '#' || href.startsWith('javascript:')) {
    problems.push(`quitar un filtro no es un enlace navegable: href=${JSON.stringify(href)}`);
  }

  // El formulario es GET y el botón es un submit de verdad.
  const form = await page.locator('form.ne-filters').evaluate((el) => ({
    method: el.method,
    hasSubmit: !!el.querySelector('button[type="submit"]'),
  }));
  if (form.method !== 'get') problems.push(`el formulario de filtros no es GET: ${form.method}`);
  if (!form.hasSubmit) problems.push('el formulario de filtros no tiene botón de envío: sin script no se podría aplicar');

  await page.close();
  await context.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 9 · El carrito: una sola fuente de totales, y sin recargar.
// ---------------------------------------------------------------------------
await check('el carrito actualiza por la API de Shopify, no recalculando', async () => {
  const problems = [];
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${CART_HARNESS}`, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  // Las etiquetas de cantidad tienen que apuntar cada una a SU campo. Es el
  // fallo que tenía la sección: `line.index` no existe en Liquid, así que todas
  // las líneas recibían el mismo id y todas las etiquetas enfocaban la primera.
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ne-cart__line')).map((li) => {
      const label = li.querySelector('label');
      const input = li.querySelector('[data-ne-line-qty]');
      return { for: label?.getAttribute('for'), id: input?.id, apunta: label?.control === input };
    }),
  );
  const ids = new Set(labels.map((l) => l.id));
  if (ids.size !== labels.length) {
    problems.push(`los campos de cantidad comparten id: ${[...ids].join(', ')}`);
  }
  for (const l of labels) {
    if (!l.apunta) problems.push(`la etiqueta "${l.for}" no apunta a su propio campo (${l.id})`);
  }

  const enhanced = await page.locator('[data-ne-cart]').getAttribute('data-ne-enhanced');
  if (enhanced !== 'true') problems.push('el carrito no se marcó como mejorado');

  // Se intercepta la API de carrito y se devuelve una cabecera y un carrito
  // RENDERIZADOS POR SHOPIFY, que es de donde salen los totales.
  const calls = [];
  await page.route('**/cart/change', async (route) => {
    calls.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        item_count: 1,
        sections: {
          'banco-cart': '<div id="shopify-section-banco-cart"><ne-cart class="ne-section" data-ne-cart data-ne-section-id="banco-cart"><p class="ne-visually-hidden" data-ne-cart-status role="status"></p><strong data-ne-cart-subtotal>$260.000</strong></ne-cart></div>',
          'sections--banco__header':
            '<div id="shopify-section-sections--banco__header"><header class="ne-header" data-ne-header data-ne-section-id="sections--banco__header"><span data-ne-cart-count>2</span></header></div>',
        },
      }),
    });
  });

  await page.evaluate(() => {
    globalThis.__neAlive = true;
  });

  // Quitar la primera línea: es el enlace nativo, interceptado.
  await page.locator('[data-ne-cart-line] [data-ne-line-remove]').first().click();
  await page.waitForTimeout(400);

  if (!(await page.evaluate(() => globalThis.__neAlive === true))) {
    problems.push('el documento se recargó: la intercepción no funcionó');
  }

  if (calls.length !== 1) {
    problems.push(`debe hacerse una petición; se hicieron ${calls.length}`);
  } else {
    const body = calls[0];
    // Por `key`, no por posición: la posición cambia si las líneas se reordenan.
    if (body.id !== '4001:aaaaaaaa') problems.push(`la línea se identificó como "${body.id}"`);
    if (body.quantity !== 0) problems.push(`quitar es cantidad 0; se envió ${body.quantity}`);
    if (!Array.isArray(body.sections) || body.sections.length !== 2) {
      problems.push(`deben pedirse las dos secciones afectadas; se pidieron ${JSON.stringify(body.sections)}`);
    }
    if (!body.sections_url?.startsWith('/')) {
      problems.push(`sections_url debe empezar por «/»; es "${body.sections_url}"`);
    }
  }

  // Los totales vienen de Shopify: se sustituye el HTML, no se recalcula.
  const after = await page.evaluate(() => ({
    subtotal: document.querySelector('[data-ne-cart-subtotal]')?.textContent?.trim() ?? null,
    contador: document.querySelector('[data-ne-cart-count]')?.textContent?.trim() ?? null,
  }));
  if (after.subtotal !== '$260.000') problems.push(`el subtotal debe venir de Shopify; es "${after.subtotal}"`);
  if (after.contador !== '2') problems.push(`el contador debe venir de Shopify; es "${after.contador}"`);

  // El componente se recrea al sustituir su sección, y vuelve a montar.
  const remounted = await page.locator('[data-ne-cart]').getAttribute('data-ne-enhanced');
  if (remounted !== 'true') problems.push('tras repintar la sección el carrito no volvió a montarse');

  if (errors.length > 0) problems.push(`errores en consola: ${errors.join(' | ')}`);
  await page.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 9bis · Cobertura contra entrega: responde con lo que sabe, y calla lo que no.
//
//        Con contra entrega el comprador no paga por adelantado, así que
//        rechazar el paquete no le cuesta y el flete de ida y vuelta lo paga la
//        marca. Saber antes de pedir si hay cobertura evita el pedido que iba a
//        volver.
//
//        Lo que se verifica además es que NO INVENTE: sin lista utilizable no
//        puede afirmar que no entregamos en una ciudad.
// ---------------------------------------------------------------------------
await check('la cobertura contra entrega responde sin inventar', async () => {
  const problems = [];
  const page = await browser.newPage();
  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });
  await page.goto(CART_HARNESS, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  if ((await page.locator('[data-ne-cod]').getAttribute('data-ne-enhanced')) !== 'true') {
    problems.push('el componente de cobertura no se montó');
  }

  /** @param {string} place */
  async function ask(place) {
    await page.locator('[data-ne-cod-input]').fill(place);
    await page.locator('[data-ne-cod-check]').click();
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const el = document.querySelector('[data-ne-cod-result]');
      return { hidden: el.hidden, text: el.textContent.trim() };
    });
  }

  // En la lista, escrito distinto: la normalización del módulo arregló
  // exactamente estos casos —puntuación y acentos— y aquí se comprueba de punta
  // a punta, no solo en la prueba unitaria.
  for (const written of ['Bogotá D.C.', 'bogota dc', 'BOGOTA D.C', 'Medellín', 'medellin']) {
    const out = await ask(written);
    if (out.hidden || !/^Sí, entregamos/.test(out.text)) {
      problems.push(`«${written}» está en la lista y la respuesta fue: "${out.text}"`);
    }
  }

  // Fuera de la lista: se dice, y se ofrece la alternativa.
  const outside = await ask('Leticia');
  if (outside.hidden || !/Todavía no entregamos/.test(outside.text)) {
    problems.push(`una ciudad fuera de la lista debe decirse; la respuesta fue: "${outside.text}"`);
  }

  // Vacío: se pide el dato, no se adivina.
  const empty = await ask('');
  if (empty.hidden || !/Escribe tu ciudad/.test(empty.text)) {
    problems.push(`sin ciudad debe pedirse el dato; la respuesta fue: "${empty.text}"`);
  }
  await page.close();

  // SIN LISTA UTILIZABLE NO SE AFIRMA NADA. Es la mitad que importa: una lista
  // vacía no significa «no hay cobertura», significa «no se sabe».
  const page2 = await browser.newPage();
  await page2.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });
  await page2.route('**/cart-harness.html', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /"codCoverage":\s*\[[^\]]*\]/,
      '"codCoverage": []',
    );
    await route.fulfill({ response, body, headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  await page2.goto(CART_HARNESS, { waitUntil: 'load' });
  await page2.waitForTimeout(250);
  await page2.locator('[data-ne-cod-input]').fill('Leticia');
  await page2.locator('[data-ne-cod-check]').click();
  await page2.waitForTimeout(80);
  const unknown = await page2.evaluate(() => {
    const el = document.querySelector('[data-ne-cod-result]');
    return { hidden: el.hidden, text: el.textContent.trim() };
  });
  if (!unknown.hidden || unknown.text !== '') {
    problems.push(
      `sin lista utilizable no se puede afirmar nada, y dijo: "${unknown.text}"`,
    );
  }
  await page2.close();

  return problems;
});

// ---------------------------------------------------------------------------
// 10 · El carrito se usa sin JavaScript.
// ---------------------------------------------------------------------------
await check('el carrito funciona con JavaScript desactivado', async () => {
  const problems = [];
  const context = await browser.newContext({ ...contextOptions(), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(CART_HARNESS, { waitUntil: 'load' });

  if ((await page.locator('[data-ne-cart]').getAttribute('data-ne-enhanced')) !== null) {
    problems.push('el contexto no tenía JavaScript desactivado: la comprobación no vale');
  }

  const action = await page.locator('form.ne-cart__form').getAttribute('action');
  if (action !== '/cart') problems.push(`el formulario debe postear al carrito; postea a "${action}"`);

  const updates = await page.locator('[name="updates[]"]').count();
  if (updates !== 2) problems.push(`deben haber dos campos updates[]; hay ${updates}`);

  const removeHref = await page.locator('[data-ne-line-remove]').first().getAttribute('href');
  if (!removeHref?.includes('/cart/change')) {
    problems.push(`quitar debe ser un enlace nativo de Shopify; es "${removeHref}"`);
  }

  for (const name of ['update', 'checkout']) {
    if (!(await page.locator(`button[name="${name}"]`).isEnabled())) {
      problems.push(`el botón "${name}" debe estar activo sin JavaScript`);
    }
  }

  await context.close();
  return problems;
});

// ---------------------------------------------------------------------------
// 9 · Ningún campo de un componente pisa una propiedad del DOM.
// ---------------------------------------------------------------------------
await check('los campos de los componentes no pisan propiedades del DOM', async () => {
  const problems = [];
  const source = await readFile(path.join(ROOT, 'theme', 'assets', 'ne-components.js'), 'utf8');

  // Campos que los componentes asignan: `this.x = ...`.
  const fields = [...new Set([...source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=[^=]/g)].map((m) => m[1]))];

  const page = await browser.newPage();
  await page.goto(HARNESS, { waitUntil: 'load' });

  // La lista la da el navegador, no una lista escrita a mano: recorre la cadena
  // de prototipos de un elemento personalizado real.
  const collisions = await page.evaluate((names) => {
    const el = document.querySelector('ne-variant-picker');
    const owned = new Set();
    for (let proto = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
      // Se para en la clase del componente: sus propios métodos no son colisión.
      if (proto.constructor && /^Ne[A-Z]/.test(proto.constructor.name)) continue;
      for (const key of Object.getOwnPropertyNames(proto)) owned.add(key);
    }
    return names.filter((n) => owned.has(n));
  }, fields);
  await page.close();

  for (const name of collisions) {
    problems.push(
      `this.${name} pisa una propiedad del DOM: la asignación se convierte a texto o se ignora y el componente falla en silencio`,
    );
  }
  return problems;
});

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------
await browser.close();
server.close();

const failed = results.filter((r) => r.problems.length > 0);
console.log('');
for (const r of results) {
  console.log(`${r.problems.length === 0 ? 'OK  ' : 'FALLA'} ${r.name}`);
  for (const p of r.problems) console.log(`       ${p}`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} comprobaciones de componentes pasan`);
if (failed.length > 0) process.exitCode = 1;
