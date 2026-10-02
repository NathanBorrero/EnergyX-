/* GENERADO por scripts/sync-theme-assets.mjs desde src/lib/responsive-image.js.
   NO EDITAR AQUÍ: el cambio se perdería en la siguiente sincronización y la
   comprobación `assets del theme sincronizados` fallaría. Edita el módulo
   original, que es el que tiene pruebas. */
/**
 * Plan responsive de una imagen: qué anchos pedir, qué `sizes` declarar y cómo
 * cargarla.
 *
 * QUÉ NO HACE, Y POR QUÉ
 * ----------------------
 * **No construye URLs del CDN de Shopify.** La documentación es explícita:
 * *"Use Liquid filter chains instead of manual URL construction. Use `image_url`
 * and `image_tag` instead of manual CDN URLs."* En un theme la plataforma lo hace
 * mejor; en headless lo hace el componente `Image` de Hydrogen.
 *
 * Tampoco fija `format` ni `quality`:
 *   · `format` solo admite `pjpg` y `jpg`, y Shopify **ya detecta** si el cliente
 *     soporta WebP o AVIF y elige el óptimo. Forzarlo empeora el resultado.
 *   · `quality` acepta 10–90, y la documentación dice omitirlo salvo que se haya
 *     **medido** un archivo más pequeño con un valor concreto, porque la selección
 *     automática suele ganar.
 *
 * Esas tres cosas pertenecen a la plataforma. Lo que no pertenece a la plataforma
 * —y es donde se gana o se pierde el LCP— es **decidir qué anchos pedir y qué
 * `sizes` declarar**, porque eso depende del diseño, no del CDN.
 *
 * Por eso este módulo produce un plan, no marcado. El plan alimenta igual a
 * `image_tag: widths:, sizes:` en Liquid que a un `srcset` propio en headless.
 *
 * REGLAS APLICADAS, TODAS `VERIFIED` DE LA GUÍA DE RENDIMIENTO DE SHOPIFY
 * ----------------------------------------------------------------------
 *  · `sizes` mobile-first, para que el móvil no descargue la imagen de escritorio.
 *  · La imagen LCP **nunca** se carga en diferido.
 *  · La imagen LCP lleva `fetchpriority="high"`.
 *  · `preload` con moderación: 1 o 2 recursos que el navegador descubra tarde.
 *  · No pedir más ancho del que la fuente tiene: ampliar gasta bytes sin mejorar.
 *
 * Sin dependencias. Pura.
 */

/** Papel de la imagen en la página. Determina cómo se carga. */
export const IMAGE_ROLE = Object.freeze({
  /** El elemento LCP. Como máximo uno por página. */
  LCP: 'lcp',
  /** Visible sin hacer scroll, pero no es el LCP. */
  ABOVE_FOLD: 'above_fold',
  /** Por debajo del pliegue. */
  BELOW_FOLD: 'below_fold',
});

/**
 * Escalera de anchos por defecto, en píxeles CSS.
 *
 * Elegida para cubrir móvil, tablet y escritorio con y sin pantalla de densidad
 * doble, sin generar tantas variantes que el navegador pierda tiempo decidiendo.
 * Es un punto de partida razonable, no un dato medido: cuando haya páginas reales
 * se ajusta con datos.
 */
const DEFAULT_LADDER = Object.freeze([320, 480, 640, 768, 960, 1280, 1536, 1920, 2560]);

/**
 * @typedef {object} LayoutBreakpoint
 * @property {number} [upTo]  Ancho de viewport máximo, en px, al que aplica. Omitir en la última entrada.
 * @property {string} width   Ancho mostrado, en sintaxis CSS. Ej. '100vw', 'calc(50vw - 2rem)', '640px'.
 */

/**
 * @typedef {object} ImagePlan
 * @property {number[]} widths        Anchos a pedir, ascendentes y acotados a la fuente.
 * @property {string} sizes          Descriptor `sizes`, mobile-first.
 * @property {'lazy'|'eager'} loading
 * @property {'high'|'auto'} fetchpriority
 * @property {'async'|'auto'} decoding
 * @property {boolean} preload       Si conviene precargarla. Solo para LCP.
 * @property {string[]} warnings     Errores de uso detectados, en lenguaje claro.
 */

/**
 * @param {unknown} n
 * @returns {boolean}
 */
function positiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/**
 * Construye la escalera de anchos.
 *
 * Acota al ancho intrínseco de la fuente: pedir 2560 de una imagen de 1200 hace
 * que el CDN devuelva 1200 y que el navegador se crea que hay una variante mayor,
 * así que la elige y no gana nada.
 *
 * @param {object} args
 * @param {number} [args.intrinsicWidth] Ancho real del archivo original.
 * @param {number} [args.maxRenderedWidth] Ancho máximo al que se muestra, en px CSS.
 * @param {number[]} [args.ladder]
 * @param {number} [args.maxDpr] Densidad máxima a cubrir. Por defecto 2.
 * @returns {number[]}
 */
export function buildWidthLadder(rawArgs = {}) {
  // Un parámetro por defecto solo cubre `undefined`, no `null`. Pasar `null`
  // lanzaba, que es justo lo que §216 prohíbe. Detectado por las pruebas.
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const ladder = Array.isArray(args.ladder) && args.ladder.length > 0
    ? [...args.ladder].filter(positiveInt).sort((a, b) => a - b)
    : [...DEFAULT_LADDER];

  const maxDpr = positiveInt(args.maxDpr) ? args.maxDpr : 2;
  const intrinsic = positiveInt(args.intrinsicWidth) ? args.intrinsicWidth : undefined;
  const rendered = positiveInt(args.maxRenderedWidth) ? args.maxRenderedWidth : undefined;

  // Techo útil: lo que el diseño necesita a la densidad máxima, nunca más de lo
  // que el archivo tiene.
  let ceiling = Infinity;
  if (rendered !== undefined) ceiling = rendered * maxDpr;
  if (intrinsic !== undefined) ceiling = Math.min(ceiling, intrinsic);

  const widths = ladder.filter((w) => w <= ceiling);

  // Se añade el techo exacto si la escalera se queda corta, para no desperdiciar
  // resolución disponible.
  if (Number.isFinite(ceiling) && widths[widths.length - 1] !== ceiling) {
    const last = widths[widths.length - 1];
    if (last === undefined || ceiling - last > 1) widths.push(Math.floor(ceiling));
  }

  // Si nada cabe, se pide al menos el techo: una imagen diminuta es mejor que ninguna.
  if (widths.length === 0 && Number.isFinite(ceiling)) return [Math.floor(ceiling)];

  return [...new Set(widths)].sort((a, b) => a - b);
}

/**
 * Compone el descriptor `sizes` desde los breakpoints del diseño, mobile-first.
 *
 * Mobile-first importa de verdad: con un `sizes` que empieza por escritorio, el
 * móvil descarga la imagen grande y el LCP se hunde justo en el dispositivo que
 * más pesa en el speed score.
 *
 * @param {LayoutBreakpoint[]} layout
 * @returns {string}
 */
export function buildSizes(layout) {
  const entries = (Array.isArray(layout) ? layout : [])
    .filter((b) => b && typeof b.width === 'string' && b.width.trim() !== '');

  if (entries.length === 0) return '100vw';

  const withBreak = entries.filter((b) => positiveInt(b.upTo)).sort((a, b) => a.upTo - b.upTo);
  const fallback = entries.find((b) => !positiveInt(b.upTo)) ?? entries[entries.length - 1];

  const parts = withBreak.map((b) => `(max-width: ${b.upTo}px) ${b.width.trim()}`);
  parts.push(fallback.width.trim());
  return parts.join(', ');
}

/**
 * Produce el plan completo de una imagen.
 *
 * @param {object} args
 * @param {string} [args.role] Uno de IMAGE_ROLE. Por defecto BELOW_FOLD.
 * @param {LayoutBreakpoint[]} [args.layout]
 * @param {number} [args.intrinsicWidth]
 * @param {number} [args.maxRenderedWidth]
 * @param {number[]} [args.ladder]
 * @param {number} [args.maxDpr]
 * @returns {ImagePlan}
 */
export function planResponsiveImage(rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  /** @type {string[]} */
  const warnings = [];

  const role = Object.values(IMAGE_ROLE).includes(args.role) ? args.role : IMAGE_ROLE.BELOW_FOLD;
  if (args.role !== undefined && role !== args.role) {
    warnings.push(`papel desconocido "${String(args.role)}": se trata como below_fold`);
  }

  const isLcp = role === IMAGE_ROLE.LCP;
  const widths = buildWidthLadder(args);
  const sizes = buildSizes(args.layout);

  if (!Array.isArray(args.layout) || args.layout.length === 0) {
    warnings.push('sin breakpoints de diseño: `sizes` cae a 100vw, que sobreestima en escritorio');
  }
  if (!positiveInt(args.intrinsicWidth)) {
    warnings.push('sin ancho intrínseco: no se puede evitar pedir más resolución de la que existe');
  }
  if (isLcp && sizes === '100vw' && positiveInt(args.maxRenderedWidth)) {
    warnings.push('la imagen LCP declara 100vw pero tiene un ancho máximo conocido: concreta `sizes`');
  }

  return {
    widths,
    sizes,
    // La imagen LCP nunca se carga en diferido. Las de arriba del pliegue tampoco,
    // porque el ahorro es nulo y el riesgo de retrasar el paint es real.
    loading: role === IMAGE_ROLE.BELOW_FOLD ? 'lazy' : 'eager',
    fetchpriority: isLcp ? 'high' : 'auto',
    // `decoding="async"` evita bloquear el hilo principal; en la LCP se deja en
    // auto para que el navegador decida sin retrasar el paint.
    decoding: isLcp ? 'auto' : 'async',
    // `preload` solo para la LCP, y la guía insiste en usarlo con moderación.
    preload: isLcp,
    warnings,
  };
}

/**
 * Comprueba un plan ya aplicado contra las reglas verificadas.
 *
 * Existe para poder auditar marcado real —o la salida de otro componente— en el
 * pipeline de comprobaciones, en lugar de confiar en que quien lo escribió
 * recordara las reglas.
 *
 * @param {object} applied
 * @param {string} [applied.role]
 * @param {string} [applied.loading]
 * @param {string} [applied.fetchpriority]
 * @param {string} [applied.sizes]
 * @param {boolean} [applied.isBackgroundImage]
 * @returns {string[]} Infracciones. Vacío = correcto.
 */
export function auditImageUsage(rawApplied = {}) {
  const applied = rawApplied && typeof rawApplied === 'object' ? rawApplied : {};
  const problems = [];
  const isLcp = applied.role === IMAGE_ROLE.LCP;

  if (isLcp && applied.loading === 'lazy') {
    problems.push('la imagen LCP está en diferido: nunca debe estarlo');
  }
  if (isLcp && applied.fetchpriority !== 'high') {
    problems.push('la imagen LCP no declara fetchpriority="high"');
  }
  if (isLcp && applied.isBackgroundImage === true) {
    problems.push('el contenido LCP usa background-image de CSS: el navegador lo descubre tarde');
  }
  if (applied.role === IMAGE_ROLE.BELOW_FOLD && applied.loading === 'eager') {
    problems.push('una imagen bajo el pliegue se carga de forma anticipada sin motivo');
  }
  if (typeof applied.sizes === 'string' && /^\s*\d+vw\s*$/.test(applied.sizes) === false
      && applied.sizes.includes('min-width:')) {
    problems.push('`sizes` usa min-width: la guía pide mobile-first con max-width');
  }
  return problems;
}
