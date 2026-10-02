/**
 * ¿Lo que hay en Shopify es lo que hay en el repositorio?
 *
 * La pregunta parece trivial y no lo es, por tres motivos MEDIDOS:
 *
 *  1. Shopify REESCRIBE las plantillas JSON al recibirlas: les pone una
 *     cabecera de «auto-generated» y añade un `"settings": {}` vacío a cada
 *     sección y a cada bloque.
 *  2. Y su `checksumMd5` NO es el md5 de lo que devuelve. Se intentó predecirlo
 *     —con cabecera, sin cabecera, con los `settings` añadidos— y **ninguna de
 *     las doce plantillas coincide**. Así que para una plantilla JSON el
 *     checksum no decide nada: hace falta su CUERPO.
 *  3. `themeFilesDelete` está bloqueado por política. Un archivo que sobra en
 *     remoto no se puede borrar desde aquí, así que hay que SABER que está y
 *     decirlo, no ignorarlo.
 *
 * De ahí los dos modos. `--snapshot` consume el volcado crudo de la Admin API
 * —con los cuerpos de las plantillas— y escribe un retrato pequeño: md5 para
 * todo lo que Shopify sirve tal cual, y md5 de la FORMA CANÓNICA para las
 * plantillas. Ese retrato es el que se versiona. La comparación posterior ya no
 * necesita cuerpos.
 *
 * Uso:
 *   node scripts/theme-diff.mjs                        → manifiesto local
 *   node scripts/theme-diff.mjs --snapshot crudo.json  → retrato versionable
 *   node scripts/theme-diff.mjs retrato.json           → comparación
 *
 * El volcado crudo sale de la consulta `theme { files { filename checksumMd5
 * body { ... on OnlineStoreThemeFileBodyText { content } } } }`.
 *
 * Un retrato es una FOTO con fecha, no la tienda en vivo. La comparación dice
 * de cuándo es; que coincida no demuestra que Shopify esté así AHORA, solo que
 * estaba así cuando se tomó.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const THEME = join(ROOT, 'theme');

/** Un archivo cuyo contenido Shopify reescribe al guardarlo. */
function isRewrittenByShopify(filename) {
  return filename.startsWith('templates/') && filename.endsWith('.json');
}

const md5 = (value) => createHash('md5').update(value).digest('hex');

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Quita la cabecera de «auto-generated» que Shopify antepone a las plantillas.
 * No se usa una expresión codiciosa: se exige que el comentario esté AL
 * PRINCIPIO y se corta en su PRIMER cierre, para no comerse nada del JSON si
 * alguna cadena contuviera la secuencia de cierre.
 */
function stripShopifyBanner(text) {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (!trimmed.startsWith('/*')) return trimmed;
  const end = trimmed.indexOf('*/');
  if (end === -1) return trimmed;
  return trimmed.slice(end + 2).trimStart();
}

/**
 * Quita los `settings: {}` VACÍOS que Shopify añade. Solo los vacíos: un
 * `settings` con valores es contenido y tiene que seguir contando.
 */
function dropEmptySettings(value) {
  if (Array.isArray(value)) return value.map(dropEmptySettings);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    const isEmptyObject =
      inner !== null && typeof inner === 'object' && !Array.isArray(inner) && Object.keys(inner).length === 0;
    if (key === 'settings' && isEmptyObject) continue;
    out[key] = dropEmptySettings(inner);
  }
  return out;
}

/**
 * Serialización estable. Las CLAVES se ordenan, porque el orden de claves de un
 * objeto JSON no es información. Las LISTAS no se ordenan, porque sí lo son:
 * `block_order` es el orden en que el comprador ve los bloques de la ficha.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}

/** La huella con la que se comparan dos plantillas, venga de donde venga. */
function templateFingerprint(text) {
  return md5(canonical(dropEmptySettings(JSON.parse(stripShopifyBanner(text)))));
}

async function localManifest() {
  const manifest = new Map();
  for (const full of (await listFiles(THEME)).sort()) {
    const name = relative(THEME, full).split(sep).join('/');
    const bytes = await readFile(full);
    manifest.set(name, { md5: md5(bytes), size: bytes.length, text: bytes.toString('utf8') });
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// Modo 1 · el manifiesto local, sin más
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0) {
  const local = await localManifest();
  for (const [name, info] of local) console.log(`${info.md5}  ${String(info.size).padStart(6)}  ${name}`);
  console.log(`\n${local.size} archivos locales`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Modo 2 · convertir el volcado crudo de la API en un retrato versionable
// ---------------------------------------------------------------------------

if (args[0] === '--snapshot') {
  const rawPath = args[1];
  if (!rawPath) {
    console.error('falta la ruta del volcado crudo');
    process.exit(2);
  }
  const raw = JSON.parse(await readFile(rawPath, 'utf8'));
  const nodes = Array.isArray(raw) ? raw : (raw.files ?? raw.nodes ?? []);
  const files = {};
  const missingBody = [];

  for (const node of nodes) {
    const name = node.filename;
    const body = typeof node.body === 'string' ? node.body : node.body?.content ?? null;
    if (!isRewrittenByShopify(name)) {
      files[name] = { md5: node.checksumMd5 };
      continue;
    }
    if (body === null) {
      missingBody.push(name);
      continue;
    }
    files[name] = { canonicalMd5: templateFingerprint(body) };
  }

  if (missingBody.length) {
    console.error('Estas plantillas vinieron sin cuerpo, y sin cuerpo no se pueden retratar:');
    for (const name of missingBody) console.error(`  ${name}`);
    console.error('Pide `body { ... on OnlineStoreThemeFileBodyText { content } }` para ellas.');
    process.exit(2);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        theme: raw.theme ?? null,
        themeId: raw.themeId ?? null,
        takenAt: raw.takenAt ?? new Date().toISOString(),
        note: 'Retrato del theme en Shopify. `md5` es el checksum tal cual; `canonicalMd5` es la huella de la plantilla JSON tras deshacer el reformateo de Shopify, porque su checksum no se puede reproducir en local.',
        files,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Modo 3 · comparar el repositorio contra un retrato
// ---------------------------------------------------------------------------

const snapshot = JSON.parse(await readFile(args[0], 'utf8'));
const remote = snapshot.files ?? {};
const local = await localManifest();

const upsert = [];
const unverified = [];
const residue = [];
let identical = 0;

for (const [name, info] of local) {
  const there = remote[name];
  if (!there) {
    upsert.push({ name, why: 'no está en Shopify' });
    continue;
  }

  if (!isRewrittenByShopify(name)) {
    if (there.md5 === info.md5) identical += 1;
    else {
      upsert.push({
        name,
        why: `md5 distinto (local ${info.md5.slice(0, 8)} · remoto ${String(there.md5 ?? '?').slice(0, 8)})`,
      });
    }
    continue;
  }

  if (typeof there.canonicalMd5 !== 'string') {
    unverified.push(`${name} (el retrato no trae su huella canónica)`);
    continue;
  }
  try {
    if (templateFingerprint(info.text) === there.canonicalMd5) identical += 1;
    else upsert.push({ name, why: 'contenido distinto tras deshacer el reformateo de Shopify' });
  } catch (error) {
    unverified.push(`${name} (no se pudo interpretar: ${error.message})`);
  }
}

for (const name of Object.keys(remote)) {
  if (!local.has(name)) residue.push(name);
}

console.log('');
if (snapshot.theme || snapshot.takenAt) {
  console.log(`retrato de ${snapshot.theme ?? 'theme sin nombre'} tomado el ${snapshot.takenAt ?? 'sin fecha'}`);
}
console.log(`IGUALES      ${identical} de ${local.size}`);

if (upsert.length) {
  console.log('');
  console.log(`SUBIR        ${upsert.length}`);
  for (const item of upsert) console.log(`  ${item.name} — ${item.why}`);
}

if (unverified.length) {
  console.log('');
  console.log(`SIN COMPARAR ${unverified.length}`);
  for (const name of unverified) console.log(`  ${name}`);
}

if (residue.length) {
  console.log('');
  console.log(`SOBRAN EN SHOPIFY ${residue.length} (themeFilesDelete está bloqueado: se borran desde el admin)`);
  for (const name of residue) console.log(`  ${name}`);
}

console.log('');
if (upsert.length === 0 && unverified.length === 0 && residue.length === 0) {
  console.log('OK   el retrato de Shopify y el repositorio coinciden');
  process.exit(0);
}
if (upsert.length === 0 && residue.length === 0) {
  console.log('PARCIAL   nada que subir, pero hay plantillas sin comparar. No cuenta como verificado.');
  process.exit(1);
}
console.log('DIFERENTE   hay trabajo pendiente');
process.exit(1);
