/**
 * Publica los módulos de `src/lib/` como assets del theme.
 *
 * POR QUÉ EXISTE
 *
 * La lógica que decide qué talla se recomienda, qué combinaciones existen y qué
 * se escribe en la línea de carrito está en `src/lib/`, con pruebas. El theme
 * necesita exactamente ese código, sin reescribirlo: una segunda implementación
 * en el navegador sería código sin pruebas tomando las mismas decisiones, y
 * tarde o temprano divergiría de la probada. Eso es precisamente el fallo que
 * §182 obliga a evitar.
 *
 * Shopify sirve los assets de un theme en plano, sin carpetas y con un
 * parámetro de versión en la URL. Por eso dos cosas:
 *
 *   1. Cada módulo se copia a `theme/assets/ne-<nombre>.js`.
 *   2. Los imports relativos se reescriben a especificadores desnudos
 *      (`ne/variant-matrix`), que el import map de `theme.liquid` resuelve a la
 *      URL real del CDN. Sin esto, un `import './variant-matrix.js'` perdería el
 *      parámetro de versión y el navegador podría servir una copia caducada de
 *      un módulo junto a otra reciente.
 *
 * NO HAY PASO DE COMPILACIÓN. No hay bundler, ni minificador, ni dependencias.
 * Es una copia con una reescritura de cadenas, verificable leyéndola.
 *
 * MODOS
 *   node scripts/sync-theme-assets.mjs            escribe los assets
 *   node scripts/sync-theme-assets.mjs --check     no escribe; falla si algo
 *                                                  está desincronizado
 *   node scripts/sync-theme-assets.mjs --verify    además ejecuta las 321
 *                                                  pruebas CONTRA el código
 *                                                  servido, sin comentarios
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LIB = path.join(ROOT, 'src', 'lib');
/**
 * El fuente de los componentes del theme.
 *
 * Vive fuera de `theme/` por la misma razón que los módulos: lo que se sirve al
 * navegador va sin comentarios, y lo que se edita y se lee va con ellos. Tener
 * el fuente dentro de `theme/assets` obligaba a elegir una de las dos cosas.
 */
const THEME_SRC = path.join(ROOT, 'src', 'theme');
const CSS_SRC = path.join(THEME_SRC, 'css');
const ASSETS = path.join(ROOT, 'theme', 'assets');
const LAYOUT = path.join(ROOT, 'theme', 'layout', 'theme.liquid');

const CHECK_ONLY = process.argv.includes('--check');
/** `--verify` ejecuta las pruebas contra el código ya barrido. */
const VERIFY = process.argv.includes('--verify');

/** Assets JS generados desde `src/theme` en lugar de `src/lib`. */
const THEME_MODULES = ['ne-components.js'];

/**
 * CSS: qué fuentes se concatenan en cada archivo servido.
 *
 * DOS DECISIONES, LAS DOS MEDIDAS.
 *
 * Se CONCATENA lo que se carga siempre. `tokens`, `base` y `shell` van en toda
 * página, así que servirlos por separado costaba tres peticiones donde una
 * basta, sin ahorrar un byte a nadie. `product` y `cart` NO se concatenan ahí:
 * son 10 y 4 KB que la portada no usa, y meterlos sería volver al problema que
 * el troceado resolvió.
 *
 * Se BARREN los comentarios: eran el 39% del CSS, y el navegador del comprador
 * los descarga y los parsea para nada. El fuente comentado vive en
 * `src/theme/css`, que es donde se edita.
 */
const CSS_BUNDLES = Object.freeze({
  'ne-core.css': ['tokens.css', 'base.css', 'shell.css'],
  'ne-product.css': ['product.css'],
  'ne-cart.css': ['cart.css'],
  'ne-collection.css': ['collection.css'],
  'ne-home.css': ['home.css'],
});

/**
 * Nombre de módulo -> especificador desnudo del import map.
 *
 * Es explícito a propósito. Derivarlo del nombre del archivo haría que renombrar
 * un módulo rompiera el theme en silencio; aquí el desajuste se nota porque la
 * comprobación del import map falla.
 */
const SPECIFIER = Object.freeze({
  'shopify-semantics.js': 'ne/semantics',
  'variant-matrix.js': 'ne/variant-matrix',
  'size-advisor.js': 'ne/size-advisor',
  'cart-line.js': 'ne/cart-line',
  'size-selected-event.js': 'ne/size-selected-event',
  'cod-guard.js': 'ne/cod-guard',
  'responsive-image.js': 'ne/responsive-image',
  'a11y-contrast.js': 'ne/a11y-contrast',
  'product-contract.js': 'ne/product-contract',
  'shopify-adapter.js': 'ne/shopify-adapter',
  'product-jsonld.js': 'ne/product-jsonld',
  'analytics-taxonomy.js': 'ne/analytics-taxonomy',
});

/** @param {string} moduleFile */
function assetNameFor(moduleFile) {
  return `ne-${moduleFile}`;
}

/**
 * Quita del código SERVIDO los comentarios que solo sirven a quien lee el
 * repositorio.
 *
 * POR QUÉ, Y POR QUÉ NO ES UNA PÉRDIDA
 *
 * Estos módulos van comentados a conciencia, y esos comentarios explican
 * decisiones que cuestan dinero si alguien las deshace. Pero el navegador del
 * comprador los descarga y los PARSEA en cada visita, y para él valen cero: son
 * unos 45 KB sin comprimir de la ficha de producto.
 *
 * El fuente legible no se toca: vive en `src/lib`, que es donde se edita y donde
 * están las pruebas. Esto afecta solo a la copia que se sirve.
 *
 * POR QUÉ UN BARRIDO POR LÍNEAS BASTA, Y ES SEGURO
 *
 * Un tokenizador completo tendría que distinguir una expresión regular de una
 * división, que es la parte del lenguaje donde es fácil equivocarse. No hace
 * falta: se comprobó que NINGÚN módulo tiene un literal de plantilla que abarque
 * varias líneas, y ni una cadena ni una expresión regular pueden hacerlo. Por
 * tanto, una línea cuyo primer carácter no blanco es `//`, o que cae dentro de
 * un bloque abierto al principio de una línea, es inequívocamente un comentario.
 *
 * Lo que NO se toca, a propósito: los comentarios al final de una línea con
 * código. Quitarlos sí exigiría saber si ese `//` está dentro de una cadena, y
 * son una minoría del volumen. Lo barato y seguro primero.
 *
 * Y la garantía no es este razonamiento: es que las 321 pruebas se ejecutan
 * contra el código YA BARRIDO (ver `--verify`). Si el barrido cambiara el
 * comportamiento, fallarían.
 *
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  const out = [];
  let inBlock = false;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();

    if (inBlock) {
      const close = line.indexOf('*/');
      if (close === -1) continue; // línea entera dentro del bloque
      inBlock = false;
      const rest = line.slice(close + 2).trim();
      if (rest !== '') out.push(line.slice(close + 2));
      continue;
    }

    // Bloque que ABRE al principio de la línea. Uno que abre a media línea se
    // deja intacto: distinguirlo exigiría saber si está dentro de una cadena.
    if (trimmed.startsWith('/*')) {
      const close = line.indexOf('*/', line.indexOf('/*') + 2);
      if (close === -1) {
        inBlock = true;
        continue;
      }
      const rest = line.slice(close + 2).trim();
      if (rest !== '') out.push(line.slice(close + 2));
      continue;
    }

    if (trimmed.startsWith('//')) continue;

    out.push(line);
  }

  // Las líneas en blanco que dejaron los comentarios se colapsan: dos seguidas
  // como máximo, para que el archivo servido siga siendo legible si alguien lo
  // abre en el navegador.
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}

/**
 * Quita los comentarios de una hoja de estilo.
 *
 * Un regex basta, y está comprobado: se barrieron las cinco hojas buscando una
 * secuencia `/*` o `*​/` dentro de una cadena CSS —lo único que haría ambiguo el
 * barrido— y no hay ninguna. Si algún día alguien escribe `content: "/*"`, la
 * comprobación `sin comentarios dentro de cadenas CSS` lo detiene antes.
 *
 * @param {string} source
 * @returns {string}
 */
function stripCssComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/^\n+/, '');
}

/**
 * Reescribe los imports relativos de un módulo a especificadores del import map.
 *
 * Solo toca las formas que este repositorio usa de verdad —`from './x.js'` y
 * `from "./x.js"`—, y falla si encuentra un import relativo que no sabe
 * traducir, en lugar de dejarlo pasar y romper en el navegador.
 *
 * @param {string} source
 * @param {string} moduleFile
 * @returns {{ code: string, problems: string[] }}
 */
function rewriteImports(source, moduleFile) {
  const problems = [];
  const code = source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (match, head, quote, target) => {
      const base = path.posix.basename(target);
      const spec = SPECIFIER[base];
      if (!spec) {
        problems.push(
          `${moduleFile}: import relativo sin especificador conocido: ${target}`,
        );
        return match;
      }
      return `${head}${quote}${spec}${quote}`;
    },
  );
  return { code, problems };
}

/**
 * El banner también viaja al navegador, así que es de una línea.
 *
 * Lo que explica se dice entero en `src/lib/README.md` y en el propio
 * `sync-theme-assets.mjs`; aquí solo hace falta que quien abra el archivo en el
 * navegador sepa que no es el original.
 */
const BANNER = (moduleFile) =>
  `/* generado desde src/lib/${moduleFile} — no editar, ver scripts/sync-theme-assets.mjs */\n`;

/** @returns {Promise<string[]>} nombres de módulo de src/lib */
async function libModules() {
  const entries = await readdir(LIB, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name)
    .sort();
}

const problems = [];
const modules = await libModules();

// ---------------------------------------------------------------------------
// 1. Cada módulo de src/lib tiene especificador, y cada especificador existe.
// ---------------------------------------------------------------------------
for (const moduleFile of modules) {
  if (!SPECIFIER[moduleFile]) {
    problems.push(
      `src/lib/${moduleFile} no tiene especificador en SPECIFIER: añádelo aquí y al import map de theme.liquid`,
    );
  }
}
for (const moduleFile of Object.keys(SPECIFIER)) {
  if (!modules.includes(moduleFile)) {
    problems.push(`SPECIFIER declara ${moduleFile}, que ya no existe en src/lib`);
  }
}

// ---------------------------------------------------------------------------
// 2. El import map de theme.liquid declara exactamente esos especificadores,
//    apuntando al asset correcto.
// ---------------------------------------------------------------------------
const layout = await readFile(LAYOUT, 'utf8');
for (const [moduleFile, spec] of Object.entries(SPECIFIER)) {
  const asset = assetNameFor(moduleFile);
  // La línea del import map es `"ne/x": {{ 'ne-x.js' | asset_url | json }}`.
  const line = new RegExp(
    `"${spec.replace('/', '\\/')}"\\s*:\\s*\\{\\{\\s*'${asset.replace('.', '\\.')}'\\s*\\|\\s*asset_url\\s*\\|\\s*json\\s*\\}\\}`,
  );
  if (!line.test(layout)) {
    problems.push(
      `theme.liquid: el import map no resuelve "${spec}" a '${asset}' con asset_url | json`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Generar (o comparar) cada asset.
// ---------------------------------------------------------------------------
let written = 0;
let stale = 0;

for (const moduleFile of modules) {
  if (!SPECIFIER[moduleFile]) continue;

  const source = await readFile(path.join(LIB, moduleFile), 'utf8');
  const { code, problems: rewriteProblems } = rewriteImports(stripComments(source), moduleFile);
  problems.push(...rewriteProblems);

  const expected = BANNER(moduleFile) + code;
  const target = path.join(ASSETS, assetNameFor(moduleFile));

  let actual = null;
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    actual = null;
  }

  if (actual === expected) continue;

  if (CHECK_ONLY) {
    stale += 1;
    problems.push(
      actual === null
        ? `falta theme/assets/${assetNameFor(moduleFile)}: ejecuta node scripts/sync-theme-assets.mjs`
        : `theme/assets/${assetNameFor(moduleFile)} no coincide con src/lib/${moduleFile}: ejecuta node scripts/sync-theme-assets.mjs`,
    );
  } else {
    await writeFile(target, expected, 'utf8');
    written += 1;
  }
}

// ---------------------------------------------------------------------------
// 3bis. Los componentes del theme: mismo barrido, distinto origen.
//
//   No llevan imports relativos —ya usan los especificadores del import map—,
//   así que solo se les quitan los comentarios.
// ---------------------------------------------------------------------------
for (const moduleFile of THEME_MODULES) {
  const src = path.join(THEME_SRC, moduleFile);
  let source;
  try {
    source = await readFile(src, 'utf8');
  } catch {
    problems.push(`falta src/theme/${moduleFile}, que es el fuente de theme/assets/${moduleFile}`);
    continue;
  }

  const expected = `/* generado desde src/theme/${moduleFile} — no editar, ver scripts/sync-theme-assets.mjs */\n` + stripComments(source);
  const target = path.join(ASSETS, moduleFile);

  let actual = null;
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    actual = null;
  }
  if (actual === expected) continue;

  if (CHECK_ONLY) {
    problems.push(
      actual === null
        ? `falta theme/assets/${moduleFile}: ejecuta node scripts/sync-theme-assets.mjs`
        : `theme/assets/${moduleFile} no coincide con src/theme/${moduleFile}: ejecuta node scripts/sync-theme-assets.mjs`,
    );
  } else {
    await writeFile(target, expected, 'utf8');
    written += 1;
  }
}

// ---------------------------------------------------------------------------
// 3ter. CSS: concatenar lo que siempre va junto, y barrer los comentarios.
// ---------------------------------------------------------------------------
for (const [bundle, sources] of Object.entries(CSS_BUNDLES)) {
  const pieces = [];
  let failed = false;
  for (const name of sources) {
    try {
      pieces.push(stripCssComments(await readFile(path.join(CSS_SRC, name), 'utf8')));
    } catch {
      problems.push(`falta src/theme/css/${name}, que forma parte de ${bundle}`);
      failed = true;
    }
  }
  if (failed) continue;

  const expected =
    `/* generado desde src/theme/css/{${sources.join(',')}} — no editar, ver scripts/sync-theme-assets.mjs */\n` +
    pieces.join('\n');
  const target = path.join(ASSETS, bundle);

  let actual = null;
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    actual = null;
  }
  if (actual === expected) continue;

  if (CHECK_ONLY) {
    problems.push(
      actual === null
        ? `falta theme/assets/${bundle}: ejecuta node scripts/sync-theme-assets.mjs`
        : `theme/assets/${bundle} no coincide con sus fuentes: ejecuta node scripts/sync-theme-assets.mjs`,
    );
  } else {
    await writeFile(target, expected, 'utf8');
    written += 1;
  }
}

// Ninguna secuencia de comentario dentro de una cadena CSS, que es lo único que
// haría ambiguo el barrido de arriba.
for (const name of Object.values(CSS_BUNDLES).flat()) {
  let source;
  try {
    source = await readFile(path.join(CSS_SRC, name), 'utf8');
  } catch {
    continue;
  }
  for (const m of source.matchAll(/(['"])(?:\\.|(?!\1).)*\1/g)) {
    if (m[0].includes('/*') || m[0].includes('*/')) {
      problems.push(
        `src/theme/css/${name}: la cadena ${m[0].slice(0, 30)} contiene una secuencia de comentario y haría ambiguo el barrido`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Ningún asset `ne-*.js` generado huérfano. Los generados se declaran.
// ---------------------------------------------------------------------------

const assetEntries = await readdir(ASSETS, { withFileTypes: true });
const expectedAssets = new Set(
  Object.keys(SPECIFIER).map((m) => assetNameFor(m)),
);
for (const entry of assetEntries) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  if (expectedAssets.has(entry.name) || THEME_MODULES.includes(entry.name)) continue;
  problems.push(
    `theme/assets/${entry.name} no corresponde a ningún módulo de src/lib ni está declarado como escrito a mano`,
  );
}

// ---------------------------------------------------------------------------
// 5. VERIFICACIÓN POR COMPORTAMIENTO: las pruebas, contra el código barrido.
//
//    Es la única garantía que vale. El razonamiento de por qué un barrido por
//    líneas es seguro está escrito arriba, pero un razonamiento no es una
//    prueba: esto monta un espejo de `src/lib` con el contenido QUE SE SIRVE
//    —sin comentarios—, le copia las pruebas de verdad y las ejecuta.
//
//    Si el barrido cambiara el comportamiento de una sola función, fallarían.
// ---------------------------------------------------------------------------
if (VERIFY) {
  const mirror = path.join(os.tmpdir(), `ne-verify-${process.pid}`);
  const mirrorLib = path.join(mirror, 'lib');
  await mkdir(path.join(mirrorLib, '__tests__'), { recursive: true });

  /** Especificador del import map -> ruta relativa, para deshacer la reescritura. */
  const toRelative = new Map(
    Object.entries(SPECIFIER).map(([moduleFile, spec]) => [spec, `./${moduleFile}`]),
  );

  for (const moduleFile of Object.keys(SPECIFIER)) {
    const served = await readFile(path.join(ASSETS, assetNameFor(moduleFile)), 'utf8');
    let code = served;
    for (const [spec, rel_] of toRelative) {
      code = code.split(`'${spec}'`).join(`'${rel_}'`);
    }
    await writeFile(path.join(mirrorLib, moduleFile), code, 'utf8');
  }

  // Las pruebas van tal cual: importan `../x.js`, que en el espejo es el código
  // servido. No se adaptan, porque adaptarlas sería probar otra cosa.
  for (const entry of await readdir(path.join(LIB, '__tests__'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    await writeFile(
      path.join(mirrorLib, '__tests__', entry.name),
      await readFile(path.join(LIB, '__tests__', entry.name), 'utf8'),
      'utf8',
    );
  }

  const run = promisify(execFile);
  try {
    // El patrón, no el directorio: `node --test <dir>` trata el directorio como
    // un módulo y falla con MODULE_NOT_FOUND, que se lee como si las pruebas
    // hubieran fallado. Es la misma forma que usa `npm test`.
    const { stdout } = await run('node', ['--test', 'lib/**/*.test.js'], {
      cwd: mirror,
      maxBuffer: 1024 * 1024 * 20,
    });
    const pass = /^# pass (\d+)$/m.exec(stdout);
    const fail = /^# fail (\d+)$/m.exec(stdout);
    if (fail && Number(fail[1]) > 0) {
      problems.push(`${fail[1]} prueba(s) fallan contra el código barrido: el barrido cambió el comportamiento`);
    } else if (!pass || Number(pass[1]) === 0) {
      problems.push('no se ejecutó ninguna prueba contra el código barrido');
    } else {
      console.log(`OK  ${pass[1]} pruebas pasan contra el código SERVIDO, sin comentarios`);
    }
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const fail = /^# fail (\d+)$/m.exec(out);
    problems.push(
      fail
        ? `${fail[1]} prueba(s) fallan contra el código barrido: el barrido cambió el comportamiento`
        : 'las pruebas contra el código barrido salieron con error',
    );
  } finally {
    await rm(mirror, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------
if (problems.length > 0) {
  for (const p of problems) console.error(`FALLA  ${p}`);
  console.error('');
  console.error(`${problems.length} problema(s)`);
  process.exitCode = 1;
} else if (CHECK_ONLY) {
  console.log(`OK  ${modules.length} módulo(s) sincronizado(s) con theme/assets`);
} else {
  console.log(
    `OK  ${modules.length} módulo(s); ${written} asset(s) escrito(s), ${modules.length - written} sin cambios`,
  );
}
