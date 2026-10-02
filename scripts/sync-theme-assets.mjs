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
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LIB = path.join(ROOT, 'src', 'lib');
const ASSETS = path.join(ROOT, 'theme', 'assets');
const LAYOUT = path.join(ROOT, 'theme', 'layout', 'theme.liquid');

const CHECK_ONLY = process.argv.includes('--check');

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

const BANNER = (moduleFile) =>
  `/* GENERADO por scripts/sync-theme-assets.mjs desde src/lib/${moduleFile}.
   NO EDITAR AQUÍ: el cambio se perdería en la siguiente sincronización y la
   comprobación \`assets del theme sincronizados\` fallaría. Edita el módulo
   original, que es el que tiene pruebas. */\n`;

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
  const { code, problems: rewriteProblems } = rewriteImports(source, moduleFile);
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
// 4. Ningún asset `ne-*.js` generado huérfano. Los escritos a mano se declaran.
// ---------------------------------------------------------------------------
/** Assets JS que se escriben a mano y no salen de src/lib. */
const HANDWRITTEN = new Set(['ne-components.js']);

const assetEntries = await readdir(ASSETS, { withFileTypes: true });
const expectedAssets = new Set(
  Object.keys(SPECIFIER).map((m) => assetNameFor(m)),
);
for (const entry of assetEntries) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  if (expectedAssets.has(entry.name) || HANDWRITTEN.has(entry.name)) continue;
  problems.push(
    `theme/assets/${entry.name} no corresponde a ningún módulo de src/lib ni está declarado como escrito a mano`,
  );
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
