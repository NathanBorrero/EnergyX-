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
 *   · Presupuestos de performance — exigen una página desplegada y datos reales.
 *     Inventar un umbral sería inventar información.
 *
 * Theme Check —el linter oficial de Shopify— sí se ejecuta, pero SOLO si el
 * Shopify CLI está disponible, porque es la única dependencia externa de todo el
 * proyecto y no se versiona. Cuando no está, la comprobación se declara NO
 * EJECUTADA. No se declara superada: decir que pasó algo que no se ejecutó es
 * exactamente el éxito falso que §183 prohíbe.
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
 * Comprobaciones que no se pudieron ejecutar.
 *
 * Existen aparte de `results` porque el informe tiene que poder decir «no se
 * ejecutó» en lugar de contarlas como superadas. Una comprobación que no corrió
 * no da ninguna garantía, y presentarla como verde es fabricar un éxito.
 */
/** @type {string[]} */
const notRun = [];

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
      // El MARCADOR, no la palabra. En un código comentado en español «TODO»
      // aparece a cada rato con su significado normal —«TODO ES MEJORA
      // PROGRESIVA»— y buscar la palabra suelta daba tres falsos positivos de
      // golpe. El marcador de verdad lleva dos puntos o paréntesis detrás, que
      // es la convención: `TODO:` o `TODO(alguien)`.
      if (/(^|[^A-Za-z])(TODO|FIXME|XXX|HACK)\s*[:(]/.test(line)) {
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
// 11 · Los assets del theme son los módulos probados, sin deriva.
// ---------------------------------------------------------------------------
await check('assets del theme sincronizados', async () => {
  try {
    // `--verify` ejecuta las 321 pruebas CONTRA el código servido, sin
    // comentarios. Es la garantía de que el barrido no cambia comportamiento.
    await run('node', ['scripts/sync-theme-assets.mjs', '--check', '--verify'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 20,
    });
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    return out.split('\n').filter((l) => l.startsWith('FALLA')).map((l) => l.replace(/^FALLA\s+/, ''));
  }
});

// ---------------------------------------------------------------------------
// 12 · El contrato entre el marcado y el script. Aquí es donde falla un theme
//      de verdad: la mejora no ocurre y nadie se entera.
// ---------------------------------------------------------------------------
await check('contratos del theme', async () => {
  try {
    const { stdout } = await run('node', ['scripts/check-theme.mjs'], { cwd: ROOT });
    if (!QUIET) {
      const line = /(\d+)\/(\d+) comprobaciones del theme pasan/.exec(stdout);
      if (line) console.log(`  ${line[0]}`);
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    return out
      .split('\n')
      .filter((l) => l.startsWith('FALLA'))
      .map((l) => l.replace(/^FALLA\s+/, ''));
  }
});

// ---------------------------------------------------------------------------
// 13 · Theme Check de Shopify, si el CLI está disponible.
//
//      Encuentra lo que ninguna comprobación propia encontraría: sintaxis
//      Liquid, claves de traducción, ámbito de CSS. Encontró de verdad un error
//      de sintaxis en la etiqueta `form` del formulario de compra, que habría
//      dejado la ficha de producto sin forma de comprar.
// ---------------------------------------------------------------------------
await check('theme check de Shopify', async () => {
  const candidates = [
    process.env.NE_SHOPIFY_CLI,
    'shopify',
  ].filter(Boolean);

  for (const bin of candidates) {
    try {
      const { stdout } = await run(bin, ['theme', 'check', '--path', 'theme', '--output', 'json'], {
        cwd: ROOT,
        maxBuffer: 1024 * 1024 * 20,
      });
      const data = JSON.parse(stdout.slice(stdout.indexOf('[')));
      const offenses = data.flatMap((f) =>
        (f.offenses ?? []).map((o) => `${rel(f.path)}: [${o.check}] ${o.message}`),
      );
      // La salida JSON de Theme Check solo lista archivos CON infracciones, así
      // que `data.length` no es el número de archivos inspeccionados. No se
      // informa un recuento que no significa lo que parece.
      if (!QUIET && offenses.length === 0) console.log('  sin infracciones');
      return offenses;
    } catch (error) {
      const out = /** @type {any} */ (error).stdout ?? '';
      if (out.includes('[')) {
        try {
          const data = JSON.parse(out.slice(out.indexOf('[')));
          return data.flatMap((f) =>
            (f.offenses ?? []).map((o) => `${rel(f.path)}: [${o.check}] ${o.message}`),
          );
        } catch {
          /* cae al siguiente candidato */
        }
      }
    }
  }

  // NO EJECUTADA, que no es lo mismo que superada.
  if (!QUIET) {
    console.log('  NO EJECUTADA: Shopify CLI no disponible (define NE_SHOPIFY_CLI con su ruta)');
  }
  notRun.push('theme check de Shopify');
  return [];
});

// ---------------------------------------------------------------------------
// 14 · Los componentes, EN UN NAVEGADOR DE VERDAD.
//
//      Es la comprobación que más defectos ha encontrado de todas, y los que
//      encontró eran invisibles por definición:
//
//        · `this.slot` pisa una propiedad del DOM, así que la galería 3D no
//          montaba nunca y el try/catch del componente se tragaba el error.
//        · `data-ne-3d-mode` se lee como `dataset['ne-3dMode']`, así que el
//          ajuste de 3D del theme se ignoraba por completo, «off» incluido.
//        · `<input type="number">` convierte «25,9» en 259 y lo valida, así que
//          el recomendador de tallas habría dicho «fuera de rango» a quien
//          escribiera bien su medida.
//        · La guía de tallas montaba después del selector y se perdía el
//          anuncio inicial, así que respondía siempre «tu talla está agotada».
//        · Un valor de opción inexistente se deshabilitaba, y eso dejaba
//          colores enteros INALCANZABLES.
//
//      Ninguno se ve leyendo el código, y ninguno rompe la página de forma
//      visible. Requiere Playwright, que no se versiona: sin él, NO EJECUTADA.
// ---------------------------------------------------------------------------
await check('componentes en navegador', async () => {
  try {
    const { stdout } = await run('node', ['scripts/check-components.mjs'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 600_000,
    });
    if (stdout.includes('NO EJECUTADA')) {
      if (!QUIET) console.log('  NO EJECUTADA: Playwright no disponible (define NE_PLAYWRIGHT con su ruta)');
      notRun.push('componentes en navegador');
      return [];
    }
    if (!QUIET) {
      const line = /(\d+)\/(\d+) comprobaciones de componentes pasan/.exec(stdout);
      if (line) console.log(`  ${line[0]}`);
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    const fails = out
      .split('\n')
      .filter((l) => l.startsWith('FALLA'))
      .map((l) => l.replace(/^FALLA\s+/, ''));
    return fails.length > 0 ? fails : ['el runner de componentes salió con error'];
  }
});

// ---------------------------------------------------------------------------
// 15 · Accesibilidad MEDIDA sobre la página renderizada.
//
//      No es lo mismo que validar la paleta. Los tokens ya se validaron antes
//      de escribir CSS, y eso no dice nada de lo que el comprador ve: un color
//      heredado que nadie declaró, un control que encoge al envolverse, una
//      `opacity` que rebaja el contraste de todo lo de dentro sin aparecer en
//      ningún color computado.
//
//      Encontró dos violaciones reales: el borde de los chips agotado e
//      inexistente a 1.34:1 contra un mínimo de 3:1, y una `opacity: 0.65` que
//      ninguna medición de color podía detectar.
//
//      Usa el MISMO módulo probado que validó la paleta, importado en la
//      página: no hay un segundo cálculo de contraste sin pruebas.
// ---------------------------------------------------------------------------
await check('accesibilidad en navegador', async () => {
  try {
    const { stdout } = await run('node', ['scripts/check-a11y.mjs'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 600_000,
    });
    if (stdout.includes('NO EJECUTADA')) {
      if (!QUIET) console.log('  NO EJECUTADA: Playwright no disponible (define NE_PLAYWRIGHT con su ruta)');
      notRun.push('accesibilidad en navegador');
      return [];
    }
    if (!QUIET) {
      const line = /(\d+)\/(\d+) comprobaciones de accesibilidad pasan/.exec(stdout);
      if (line) console.log(`  ${line[0]}`);
      // Las notas no fallan, pero se ven: un objetivo que cumple el mínimo y no
      // llega al objetivo de 44 es información, no un defecto.
      const notes = stdout.split('\n').filter((l) => l.includes('nota:')).length;
      if (notes > 0) console.log(`  ${notes} nota(s) informativa(s)`);
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    const fails = out.split('\n').filter((l) => l.startsWith('FALLA')).map((l) => l.replace(/^FALLA\s+/, ''));
    const detail = out.split('\n').filter((l) => /^\s{7}[^n]/.test(l)).slice(0, 8).map((l) => l.trim());
    return fails.length > 0 ? [...fails, ...detail] : ['el runner de accesibilidad salió con error'];
  }
});

// ---------------------------------------------------------------------------
// 16 · Presupuestos de rendimiento, MEDIDOS. No es Lighthouse.
//
//      Una puntuación exige una página desplegada, un dispositivo y una red, y
//      ninguna de las tres existe todavía; inventar un umbral sería inventar
//      información. Lo que sí se mide: los bytes que el theme sirve de verdad
//      comprimidos, cuántos módulos descarga la página —el import map declara
//      doce y solo deben bajar los que se importan—, el desplazamiento de
//      maquetación con el mismo observador que usa el navegador, que ninguna
//      imagen entre sin dimensiones y que ningún script bloquee el parser.
//
//      Los presupuestos son DE REGRESIÓN: están justo por encima de lo medido
//      hoy. No afirman que el theme sea rápido; avisan si alguien duplica el
//      peso sin darse cuenta.
//
//      Encontró un desplazamiento real de 0.0132, reproducible, causado por
//      ocultar los chips hasta que montaba el módulo.
// ---------------------------------------------------------------------------
await check('presupuestos de rendimiento', async () => {
  try {
    const { stdout } = await run('node', ['scripts/check-perf.mjs'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 600_000,
    });
    if (!QUIET) {
      for (const line of stdout.split('\n')) {
        // Solo las líneas de MEDICIÓN, no los encabezados de cada comprobación.
        if (/^\s{7}/.test(line) && /comprimidos|descargados|desplazamiento acumulado/.test(line)) {
          console.log(`  ${line.trim()}`);
        }
      }
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    const fails = out.split('\n').filter((l) => l.startsWith('FALLA')).map((l) => l.replace(/^FALLA\s+/, ''));
    const detail = out.split('\n').filter((l) => /^\s{7}(el|la|los|theme)/.test(l)).slice(0, 6).map((l) => l.trim());
    return fails.length > 0 ? [...fails, ...detail] : ['el runner de rendimiento salió con error'];
  }
});

// ---------------------------------------------------------------------------
// 17 · Seguridad del theme.
//
//      La superficie real es corta, porque Shopify es dueño de la
//      autenticación, del pago y de los datos personales. Lo que este theme sí
//      puede hacer mal: emitir texto de otro sin escapar —y LIQUID NO ESCAPA
//      POR DEFECTO—, romper un bloque JSON, traer código de un tercero, abrir
//      una ventana sin aislar, o filtrar un secreto en un archivo público.
//
//      Encontró un XSS reflejado real: el término de búsqueda, que viene de un
//      parámetro de URL, se interpolaba sin escapar en una cadena traducida.
// ---------------------------------------------------------------------------
await check('seguridad del theme', async () => {
  try {
    const { stdout } = await run('node', ['scripts/check-security.mjs'], { cwd: ROOT, maxBuffer: 1024 * 1024 * 10 });
    if (!QUIET) {
      const line = /(\d+)\/(\d+) comprobaciones de seguridad pasan/.exec(stdout);
      if (line) console.log(`  ${line[0]}`);
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    const fails = out.split('\n').filter((l) => l.startsWith('FALLA')).map((l) => l.replace(/^FALLA\s+/, ''));
    const detail = out.split('\n').filter((l) => /^\s{7}theme/.test(l)).slice(0, 6).map((l) => l.trim());
    return fails.length > 0 ? [...fails, ...detail] : ['el runner de seguridad salió con error'];
  }
});

// ---------------------------------------------------------------------------
// 18 · Lo que hay en Shopify es lo que hay aquí.
//
//      Esta comprobación existe porque fallé exactamente en esto: optimicé
//      `layout/theme.liquid`, lo medí, lo di por bueno y la tienda se quedó una
//      revisión atrás. El repositorio decía una cosa y Shopify servía otra, y
//      nada lo señalaba.
//
//      No puede consultar la Admin API —este script no tiene credenciales, ni
//      debe tenerlas—, así que compara contra un RETRATO versionado del theme.
//      Y eso, lejos de debilitarla, es lo que la hace auto-mantenida: el
//      retrato lleva el md5 de cada archivo, así que TOCAR un archivo del theme
//      sin volver a subirlo rompe la comprobación. No se puede olvidar.
//
//      Lo que afirma al pasar es exacto y no más: cada archivo del theme es
//      idéntico al que Shopify tenía en la fecha del retrato. No afirma nada
//      sobre lo que Shopify sirve AHORA, porque desde aquí no se puede ver.
// ---------------------------------------------------------------------------
await check('el theme coincide con Shopify', async () => {
  const snapshot = path.join(ROOT, 'shopify', 'theme-remote-manifest.json');
  try {
    await stat(snapshot);
  } catch {
    if (!QUIET) console.log('  NO EJECUTADA: falta shopify/theme-remote-manifest.json');
    notRun.push('el theme coincide con Shopify');
    return [];
  }
  try {
    const { stdout } = await run('node', ['scripts/theme-diff.mjs', snapshot], { cwd: ROOT, maxBuffer: 1024 * 1024 * 10 });
    if (!QUIET) {
      for (const line of stdout.split('\n')) {
        if (/^(retrato|IGUALES)/.test(line)) console.log(`  ${line.trim()}`);
      }
    }
    return [];
  } catch (error) {
    const out = `${/** @type {any} */ (error).stdout ?? ''}${/** @type {any} */ (error).stderr ?? ''}`;
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    const problems = lines.filter((l) => /^(SUBIR|SIN COMPARAR|SOBRAN|\S+\.(liquid|json|css|js) —|\S+\.(liquid|json|css|js) \()/.test(l));
    return problems.length > 0 ? problems.slice(0, 12) : ['la comparación con Shopify salió con error'];
  }
});

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);

console.log('');
for (const r of results) {
  const label = notRun.includes(r.name) ? 'N/E ' : r.ok ? 'OK  ' : 'FALLA';
  console.log(`${label} ${r.name}`);
  for (const d of r.detail) console.log(`       ${d}`);
}
console.log('');
const ran = results.length - notRun.length;
console.log(`${ran - failed.length}/${ran} comprobaciones pasan`);
if (notRun.length > 0) {
  console.log(`${notRun.length} NO EJECUTADA(S): ${notRun.join(', ')}`);
}

if (failed.length > 0) process.exitCode = 1;
