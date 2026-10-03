/**
 * Auditoría de accesibilidad SOBRE LA PÁGINA RENDERIZADA.
 *
 * POR QUÉ ESTO NO ES LO MISMO QUE VALIDAR LA PALETA
 *
 * La paleta ya se validó con `a11y-contrast.js` antes de escribir una línea de
 * CSS, y encontró un borde a 2.37:1 contra un mínimo de 3:1. Pero validar los
 * tokens no dice nada de lo que el comprador ve: un texto puede heredar un
 * color que nadie declaró en la paleta, un botón puede quedar más pequeño que el
 * mínimo al envolverse, un estado `:disabled` puede bajar el contraste por
 * debajo del umbral, y un fondo `transparent` hereda de un ancestro que sí
 * cambia el resultado.
 *
 * Así que esto recorre los elementos REALES, lee sus ESTILOS COMPUTADOS y sus
 * cajas medidas, y los pasa por el mismo módulo probado que validó la paleta.
 *
 * NO SUSTITUYE A UNA AUDITORÍA CON LECTOR DE PANTALLA. Lo que una máquina puede
 * decidir se decide aquí; lo que exige a una persona escuchando la página sigue
 * pendiente, y así está declarado en STATUS.md.
 *
 *   node scripts/check-a11y.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

if (!chromium) {
  console.log('');
  console.log('N/E  accesibilidad en navegador: Playwright no disponible');
  console.log('');
  console.log('NO EJECUTADA. Esto no cuenta como superada.');
  process.exit(0);
}

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

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const PAGES = [
  ['ficha de producto', `http://127.0.0.1:${port}/scripts/fixtures/product-harness.html`],
  ['carrito', `http://127.0.0.1:${port}/scripts/fixtures/cart-harness.html`],
  ['carrito vacío', `http://127.0.0.1:${port}/scripts/fixtures/cart-empty-harness.html`],
  // La portada es la única página con superficie INVERSA: los pares de color se
  // validaron a nivel de token, pero medir tokens no es medir lo que se ve.
  ['portada y colección', `http://127.0.0.1:${port}/scripts/fixtures/home-harness.html`],
  // La colección con filtros es la única página con CONTROLES DE FORMULARIO
  // fuera de la ficha y el carrito: casillas, `select` y botón. Es justo donde
  // el borde del control y el área de pulsado se incumplen sin que se note.
  ['colección con filtros', `http://127.0.0.1:${port}/scripts/fixtures/collection-harness.html`],
  // La página de contraseña es la PRIMERA que verá nadie antes del lanzamiento,
  // y su único control es un campo de contraseña que no auditaba nada.
  ['contraseña', `http://127.0.0.1:${port}/scripts/fixtures/password-harness.html`],
  // Y el blog, cuya paginación acaba de nacer y cuyos enlaces de artículo no se
  // habían medido nunca.
  ['blog', `http://127.0.0.1:${port}/scripts/fixtures/blog-harness.html`],
];

const browser = await chromium.launch({ executablePath: process.env.NE_CHROMIUM ?? '/opt/pw-browsers/chromium' });

/**
 * Abre una página con el módulo de contraste disponible en ella.
 *
 * El módulo es el MISMO que valida la paleta y tiene pruebas: se importa por el
 * import map del banco, no se reimplementa el cálculo de luminancia aquí. Un
 * segundo cálculo de contraste sin pruebas sería exactamente el defecto que este
 * proyecto evita.
 *
 * @param {string} url
 */
async function open(url) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    globalThis.Shopify = { analytics: { publish() {} } };
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  // El módulo se importa POR SU URL, no por el especificador del import map.
  //
  // Así la auditoría no depende de que la página tenga un import map, y el
  // mismo script podrá apuntarse a una página real de la tienda el día que la
  // red lo permita. `a11y-contrast` no importa nada, así que la URL directa
  // basta.
  await page.evaluate(async () => {
    globalThis.__neA11y = await import('/theme/assets/ne-a11y-contrast.js');
  });
  return page;
}

/**
 * Recorre los elementos con texto propio y mide su contraste real.
 *
 * El fondo se resuelve subiendo por los ancestros hasta encontrar uno opaco,
 * porque `background-color: transparent` —el valor por defecto— no significa
 * blanco: significa «lo que haya detrás».
 */
const CONTRAST_PROBE = () => {
  const { checkContrast } = globalThis.__neA11y;
  const out = [];

  /**
   * Producto de las opacidades de la cadena de ancestros.
   *
   * Lo que el comprador ve es el color COMPUESTO contra el fondo por esa
   * opacidad. Leer solo `color` da un pase falso exactamente donde el contraste
   * se ha roto.
   *
   * @param {Element} el
   */
  function cumulativeOpacity(el) {
    let total = 1;
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const o = Number.parseFloat(getComputedStyle(node).opacity);
      if (Number.isFinite(o)) total *= o;
    }
    return total;
  }

  /**
   * Compone un color sobre otro con una opacidad dada.
   * @param {string} fg
   * @param {string} bg
   * @param {number} alpha
   */
  function composite(fg, bg, alpha) {
    const read = (c) => {
      const m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (!m) return null;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat);
      return parts.length >= 3 ? parts : null;
    };
    const f = read(fg);
    const b = read(bg);
    if (!f || !b || alpha >= 0.999) return fg;
    const mix = (i) => Math.round(f[i] * alpha + b[i] * (1 - alpha));
    return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
  }

  /** @param {Element} el */
  function effectiveBackground(el) {
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = /^rgba?\(([^)]+)\)$/.exec(bg);
      if (!m) continue;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      const alpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
      if (alpha > 0.95) return bg;
    }
    return getComputedStyle(document.body).backgroundColor;
  }

  /** ¿El elemento tiene texto propio, no solo de sus hijos? */
  function ownText(el) {
    return Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
  }

  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // El texto oculto para lectores de pantalla no se pinta: no tiene contraste
    // que cumplir.
    if (el.closest('.ne-visually-hidden')) continue;
    const textContent = ownText(el);
    if (textContent === '') continue;

    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    const background = effectiveBackground(el);
    const alpha = cumulativeOpacity(el);
    // Si la opacidad lo deja invisible, no es un fallo de contraste: es que no
    // se pinta.
    if (alpha < 0.05) continue;
    const foreground = composite(style.color, background, alpha);
    const result = checkContrast({
      foreground,
      background,
      fontSizePx: size,
      bold: Number.isFinite(weight) && weight >= 700,
    });

    if (!result.passes) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.toString?.().slice(0, 60) ?? '',
        text: textContent.slice(0, 40),
        color: alpha < 0.999 ? `${style.color} con opacidad ${alpha.toFixed(2)}` : style.color,
        background,
        fontSizePx: size,
        ratio: result.ratio,
        required: result.required,
        rule: result.rule,
      });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// 1 · Contraste de texto, medido sobre lo renderizado.
// ---------------------------------------------------------------------------
await check('contraste de texto en la página renderizada', async () => {
  const problems = [];
  for (const [label, url] of PAGES) {
    const page = await open(url);
    const failures = await page.evaluate(CONTRAST_PROBE);
    for (const f of failures) {
      problems.push(
        `${label}: <${f.tag} class="${f.cls}"> «${f.text}» ${f.color} sobre ${f.background} = ${f.ratio?.toFixed(2)}:1, exige ${f.required}:1 (${f.rule})`,
      );
    }
    await page.close();
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 2 · Contraste de los bordes de los controles: el mínimo no textual es 3:1.
// ---------------------------------------------------------------------------
await check('contraste de bordes de controles', async () => {
  const problems = [];
  for (const [label, url] of PAGES) {
    const page = await open(url);
    const failures = await page.evaluate(() => {
      const { checkContrast } = globalThis.__neA11y;
      const out = [];
      const selectors = 'input, select, textarea, button, .ne-picker__chip-face';
      for (const el of document.querySelectorAll(selectors)) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || el.closest('.ne-visually-hidden')) continue;
        if (style.borderTopStyle === 'none' || Number.parseFloat(style.borderTopWidth) === 0) continue;

        let bg = 'rgb(255,255,255)';
        for (let node = el.parentElement; node; node = node.parentElement) {
          const c = getComputedStyle(node).backgroundColor;
          const m = /^rgba?\(([^)]+)\)$/.exec(c);
          if (!m) continue;
          const parts = m[1].split(/[\s,/]+/).filter(Boolean);
          if ((parts.length > 3 ? Number.parseFloat(parts[3]) : 1) > 0.95) {
            bg = c;
            break;
          }
        }
        const result = checkContrast({
          foreground: style.borderTopColor,
          background: bg,
          nonText: true,
        });
        if (!result.passes) {
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className?.toString?.().slice(0, 50) ?? '',
            border: style.borderTopColor,
            background: bg,
            ratio: result.ratio,
            required: result.required,
          });
        }
      }
      return out;
    });
    for (const f of failures) {
      problems.push(
        `${label}: borde de <${f.tag} class="${f.cls}"> ${f.border} sobre ${f.background} = ${f.ratio?.toFixed(2)}:1, exige ${f.required}:1`,
      );
    }
    await page.close();
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 3 · Objetivos de pulsado, MEDIDOS. 24×24 es el mínimo; 44 es el objetivo.
// ---------------------------------------------------------------------------
await check('objetivos de pulsado medidos', async () => {
  const problems = [];
  const notes = [];
  for (const [label, url] of PAGES) {
    const page = await open(url);
    const measured = await page.evaluate(() => {
      const { checkTouchTarget } = globalThis.__neA11y;
      const out = [];
      for (const el of document.querySelectorAll('a[href], button, input, select, summary, label[for]')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.closest('.ne-visually-hidden')) continue;

        // Un duplicado decorativo no es un objetivo que haya que medir.
        //
        // `aria-hidden="true"` con `tabindex="-1"` saca al elemento del árbol de
        // accesibilidad Y del orden de tabulación: es un atajo para el puntero
        // que repite un enlace visible contiguo —la foto de la línea del carrito
        // junto al título del producto, que lleva al mismo sitio—. Es el caso
        // «objetivo equivalente» del criterio de tamaño de objetivo: el objetivo
        // que cuenta es el enlace de texto, y ese sí se mide.
        if (el.getAttribute('aria-hidden') === 'true' && el.getAttribute('tabindex') === '-1') continue;

        // Una etiqueta junto a un campo VISIBLE no es el objetivo: el objetivo
        // es el campo, y medir las dos inventa un fallo. La etiqueta sí es el
        // objetivo cuando su control está oculto a la vista, que es cómo
        // funcionan los chips del selector.
        if (el.tagName === 'LABEL') {
          const control = el.control;
          if (!control) continue;
          const cs = getComputedStyle(control);
          const visible =
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            !control.classList.contains('ne-visually-hidden');
          if (visible) continue;
        }

        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        const result = checkTouchTarget({ width: box.width, height: box.height });
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className?.toString?.().slice(0, 50) ?? '',
          text: (el.textContent ?? '').trim().slice(0, 30),
          w: Math.round(box.width),
          h: Math.round(box.height),
          passes: result.passes,
        });
      }
      return out;
    });

    for (const m of measured) {
      if (!m.passes) {
        problems.push(`${label}: <${m.tag} class="${m.cls}"> «${m.text}» mide ${m.w}×${m.h}, mínimo 24×24`);
      } else if (m.w < 44 || m.h < 44) {
        notes.push(`${label}: <${m.tag}> «${m.text}» mide ${m.w}×${m.h}: cumple el mínimo, por debajo del objetivo de 44`);
      }
    }
    await page.close();
  }
  return { problems, notes };
});

// ---------------------------------------------------------------------------
// 4 · El foco se ve, y el orden de tabulación sigue al DOM.
// ---------------------------------------------------------------------------
await check('foco visible y en orden de DOM', async () => {
  const problems = [];
  for (const [label, url] of PAGES) {
    const page = await open(url);

    // Orden de tabulación frente a orden de documento.
    const order = await page.evaluate(async () => {
      const focusables = Array.from(
        document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });
      focusables.forEach((el, i) => {
        el.setAttribute('data-ne-doc-order', String(i));
      });
      return focusables.length;
    });

    const visited = [];
    const seenOrders = new Set();
    for (let i = 0; i < Math.min(order + 2, 40); i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          docOrder: el.getAttribute('data-ne-doc-order'),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 30),
          outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });
      if (!info) continue;
      // Tras el último elemento, Tab vuelve al primero. Eso es el
      // comportamiento normal del navegador, no un orden roto: al reencontrar
      // algo ya visitado se corta el recorrido.
      if (info.docOrder !== null && seenOrders.has(info.docOrder)) break;
      if (info.docOrder !== null) seenOrders.add(info.docOrder);
      visited.push(info);
    }

    // Orden: los índices de documento visitados tienen que ir subiendo.
    const seen = visited.map((v) => (v.docOrder === null ? null : Number(v.docOrder))).filter((n) => n !== null);
    for (let i = 1; i < seen.length; i += 1) {
      if (seen[i] < seen[i - 1]) {
        problems.push(
          `${label}: el orden de tabulación se sale del orden del DOM (${seen[i - 1]} -> ${seen[i]}): ` +
            `tras «${visited[i - 1].text}» el foco salta a «${visited[i].text}»`,
        );
        break;
      }
    }

    // Foco visible: contorno real, no solo `outline: none`.
    for (const v of visited) {
      const hasOutline = v.outlineStyle !== 'none' && v.outlineWidth > 0;
      const hasShadow = v.boxShadow !== 'none' && v.boxShadow !== '';
      if (!hasOutline && !hasShadow) {
        problems.push(`${label}: <${v.tag}> «${v.text}» recibe el foco sin indicador visible`);
      }
    }

    await page.close();
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 5 · Estructura: un solo h1, sin saltos de nivel, imágenes con alt, etiquetas
//     con control, y región principal.
// ---------------------------------------------------------------------------
await check('estructura del documento', async () => {
  const problems = [];
  for (const [label, url] of PAGES) {
    const page = await open(url);
    const found = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      niveles: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
        Number(h.tagName.slice(1)),
      ),
      sinAlt: Array.from(document.querySelectorAll('img'))
        .filter((img) => img.getAttribute('alt') === null)
        .map((img) => img.getAttribute('src')),
      etiquetasHuerfanas: Array.from(document.querySelectorAll('label[for]'))
        .filter((l) => !l.control)
        .map((l) => l.getAttribute('for')),
      lang: document.documentElement.getAttribute('lang'),
      camposSinNombre: Array.from(
        document.querySelectorAll('input:not([type=hidden]), select, textarea'),
      )
        .filter((el) => {
          if (el.labels && el.labels.length > 0) return false;
          if (el.getAttribute('aria-label')) return false;
          if (el.getAttribute('aria-labelledby')) return false;
          if (el.closest('label')) return false;
          return true;
        })
        .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(sin id)'}`),
    }));

    if (found.h1 !== 1) problems.push(`${label}: debe haber exactamente un <h1>; hay ${found.h1}`);
    for (let i = 1; i < found.niveles.length; i += 1) {
      if (found.niveles[i] - found.niveles[i - 1] > 1) {
        problems.push(
          `${label}: salto de nivel de encabezado h${found.niveles[i - 1]} -> h${found.niveles[i]}`,
        );
      }
    }
    for (const src of found.sinAlt) problems.push(`${label}: <img src="${src}"> sin atributo alt`);
    for (const f of found.etiquetasHuerfanas) {
      problems.push(`${label}: <label for="${f}"> no apunta a ningún control`);
    }
    for (const c of found.camposSinNombre) problems.push(`${label}: ${c} no tiene nombre accesible`);
    if (!found.lang) problems.push(`${label}: <html> sin atributo lang`);

    await page.close();
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
  for (const n of r.notes) console.log(`       nota: ${n}`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} comprobaciones de accesibilidad pasan`);
if (failed.length > 0) process.exitCode = 1;
