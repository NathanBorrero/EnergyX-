#!/usr/bin/env node
/**
 * Comprobaciones de calidad del repositorio.
 *
 * ALCANCE DELIBERADAMENTE LIMITADO
 * --------------------------------
 * Esto no es una infraestructura de CI. Es un script sin dependencias que
 * comprueba invariantes reales del proyecto y falla con un código de salida.
 *
 * Solo contiene comprobaciones que han encontrado o podrían encontrar un defecto
 * real. Nada de métricas decorativas.
 *
 * Lo que NO comprueba todavía, y por qué:
 *   · Theme Check — requiere Shopify CLI y que el stack sea Liquid. Las dos cosas
 *     están pendientes. Se añadirá cuando ambas existan, no antes.
 *   · Presupuestos de performance — exigen una página desplegada y datos reales.
 *     Inventar un umbral sería inventar información.
 *
 * Uso:  node scripts/check.mjs [--quiet]
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

/** @type {{name: string, ok: boolean, detail: string[]}[]} */
const results = [];

/**
 * @param {string} name
 * @param {() => Promise<string[]>} fn Devuelve la lista de problemas. Vacía = pasa.
 */
async function check(name, fn) {
  let detail;
  try {
    detail = await fn();
  } catch (error) {
    detail = [`la comprobación falló: ${error instanceof Error ? error.message : String(error)}`];
  }
  results.push({ name, ok: detail.length === 0, detail });
}

/**
 * Lista recursiva de archivos, omitiendo lo que no es nuestro.
 * @param {string} dir
 * @param {RegExp} [match]
 * @returns {Promise<string[]>}
 */
async function walk(dir, match = /.*/) {
  const skip = new Set(['.git', 'node_modules', 'coverage']);
  /** @type {string[]} */
  const out = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (match.test(entry.name)) out.push(full);
    }
  }
  await visit(dir);
  return out;
}

/** @param {string} p */
const rel = (p) => path.relative(ROOT, p);

// ---------------------------------------------------------------------------
// 1 · Las pruebas pasan. Es la comprobación que más vale.
// ---------------------------------------------------------------------------
await check('pruebas', async () => {
  try {
    const { stdout } = await run('node', ['--test', 'src/**/*.test.js'], { cwd: ROOT, maxBuffer: 1024 * 1024 * 20 });
    const fail = /^# fail (\d+)$/m.exec(stdout);
    const pass = /^# pass (\d+)$/m.exec(stdout);
    if (fail && Number(fail[1]) > 0) return [`${fail[1]} prueba(s) fallando`];
    if (!pass || Number(pass[1]) === 0) return ['no se ejecutó ninguna prueba'];
    if (!QUIET) console.log(`  ${pass[1]} pruebas pasando`);
    return [];
  } catch (error) {
    const out = /** @type {any} */ (error).stdout ?? '';
    const fail = /^# fail (\d+)$/m.exec(out);
    return [fail ? `${fail[1]} prueba(s) fallando` : 'el runner de pruebas salió con error'];
  }
});

// ---------------------------------------------------------------------------
// 2 · Sintaxis de todo el JavaScript.
// ---------------------------------------------------------------------------
await check('sintaxis', async () => {
  const files = await walk(path.join(ROOT, 'src'), /\.m?js$/);
  files.push(...(await walk(path.join(ROOT, 'scripts'), /\.m?js$/)));
  const problems = [];
  for (const file of files) {
    try {
      await run('node', ['--check', file], { cwd: ROOT });
    } catch {
      problems.push(`${rel(file)}: error de sintaxis`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 3 · Cero dependencias. Es una restricción explícita del proyecto (§205).
// ---------------------------------------------------------------------------
await check('cero dependencias', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies ?? {});
  const dev = Object.keys(pkg.devDependencies ?? {});
  const problems = [];
  if (deps.length > 0) problems.push(`dependencies: ${deps.join(', ')}`);
  if (dev.length > 0) problems.push(`devDependencies: ${dev.join(', ')}`);
  return problems;
});

// ---------------------------------------------------------------------------
// 4 · Secretos. Un token en el repositorio es irreversible: queda en el historial.
// ---------------------------------------------------------------------------
await check('sin secretos', async () => {
  const patterns = [
    // Tokens con prefijo propio de Shopify.
    { re: /\bshp(at|ca|pa|ss)_[A-Za-z0-9]{16,}/g, what: 'token de Shopify' },
    // Asignación de un secreto a un valor literal con pinta de serlo.
    { re: /\b(api[_-]?key|api[_-]?secret|access[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*['"][A-Za-z0-9_\-/+]{12,}['"]/gi, what: 'credencial literal' },
    { re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, what: 'clave privada' },
    { re: /\bAKIA[0-9A-Z]{16}\b/g, what: 'clave de AWS' },
  ];
  const files = await walk(ROOT, /\.(js|mjs|json|md|graphql|liquid|html|css|ya?ml|env|txt)$/);
  const problems = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const { re, what } of patterns) {
      re.lastIndex = 0;
      if (re.test(text)) problems.push(`${rel(file)}: posible ${what}`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 5 · Restos de depuración y marcadores pendientes en src (§183).
// ---------------------------------------------------------------------------
await check('sin restos de depuración', async () => {
  const files = await walk(path.join(ROOT, 'src'), /\.m?js$/);
  const problems = [];
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (/\bdebugger\b/.test(line)) problems.push(`${rel(file)}:${i + 1}: debugger`);
      // console.log en código de librería. Las pruebas pueden usarlo.
      if (!file.includes('__tests__') && /\bconsole\.(log|debug)\s*\(/.test(line)) {
        problems.push(`${rel(file)}:${i + 1}: console.log en código de librería`);
      }
      if (/(^|[^A-Za-z])(TODO|FIXME|XXX)([^A-Za-z]|$)/.test(line)) {
        problems.push(`${rel(file)}:${i + 1}: marcador pendiente`);
      }
    });
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 6 · Los imports locales resuelven.
// Encontró un defecto real: un import que nunca se insertó y rompió 10 pruebas.
// ---------------------------------------------------------------------------
await check('imports locales resuelven', async () => {
  const files = await walk(path.join(ROOT, 'src'), /\.m?js$/);
  const problems = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      try {
        await stat(target);
      } catch {
        problems.push(`${rel(file)}: no resuelve "${m[1]}"`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 7 · Sin ciclos de importación entre módulos de librería.
// Un ciclo produce exports undefined en tiempo de ejecución, de forma silenciosa.
// ---------------------------------------------------------------------------
await check('sin ciclos de importación', async () => {
  const files = (await walk(path.join(ROOT, 'src', 'lib'), /\.m?js$/)).filter(
    (f) => !f.includes('__tests__'),
  );
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const deps = [];
    for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      deps.push(path.resolve(path.dirname(file), m[1]));
    }
    graph.set(path.resolve(file), deps);
  }
  const problems = [];
  const state = new Map();
  /** @param {string} node @param {string[]} stack */
  function visit(node, stack) {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(node)), node].map(rel).join(' → ');
      problems.push(`ciclo: ${cycle}`);
      return;
    }
    state.set(node, 'visiting');
    for (const dep of graph.get(node) ?? []) visit(dep, [...stack, node]);
    state.set(node, 'done');
  }
  for (const file of graph.keys()) visit(file, []);
  return [...new Set(problems)];
});

// ---------------------------------------------------------------------------
// 8 · Todo export público de src/lib se usa o se prueba.
// Código muerto es deuda silenciosa (§183).
// ---------------------------------------------------------------------------
await check('sin exports muertos', async () => {
  const libFiles = (await walk(path.join(ROOT, 'src', 'lib'), /\.m?js$/)).filter(
    (f) => !f.includes('__tests__'),
  );
  const allFiles = await walk(path.join(ROOT, 'src'), /\.m?js$/);
  const corpus = (await Promise.all(allFiles.map((f) => readFile(f, 'utf8')))).join('\n');
  const problems = [];
  for (const file of libFiles) {
    const text = await readFile(file, 'utf8');
    const names = new Set();
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1]);
    }
    for (const name of names) {
      // Se cuenta como usado si aparece fuera de su propia declaración.
      const uses = corpus.split(new RegExp(`\\b${name}\\b`)).length - 1;
      if (uses <= 1) problems.push(`${rel(file)}: "${name}" se exporta y no se usa en ninguna parte`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 9 · Los enlaces internos de la documentación resuelven.
// ---------------------------------------------------------------------------
await check('enlaces de documentación', async () => {
  const docs = await walk(ROOT, /\.md$/);
  const problems = [];
  for (const file of docs) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/\]\((\.{0,2}\/?[A-Za-z0-9._\-/]+\.(?:md|graphql|js|mjs))\)/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      try {
        await stat(target);
      } catch {
        problems.push(`${rel(file)}: enlace roto "${m[1]}"`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------------------
// 10 · Estado del repositorio: informativo, no falla por tener cambios.
// ---------------------------------------------------------------------------
await check('estado del repositorio', async () => {
  try {
    const { stdout: status } = await run('git', ['status', '--porcelain'], { cwd: ROOT });
    const pending = status.trim().split('\n').filter(Boolean);
    if (!QUIET) {
      console.log(
        pending.length === 0
          ? '  árbol limpio'
          : `  ${pending.length} archivo(s) sin commitear (informativo)`,
      );
    }
    // Un archivo .env commiteado sí es un fallo.
    const { stdout: tracked } = await run('git', ['ls-files'], { cwd: ROOT });
    const leaked = tracked.split('\n').filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.example'));
    return leaked.map((f) => `${f} está versionado y no debería`);
  } catch {
    return [];
  }
});

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);

console.log('');
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.name}`);
  for (const d of r.detail) console.log(`       ${d}`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} comprobaciones pasan`);

if (failed.length > 0) process.exitCode = 1;
