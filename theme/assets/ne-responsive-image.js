/* generado desde src/lib/responsive-image.js — no editar, ver scripts/sync-theme-assets.mjs */
export const IMAGE_ROLE = Object.freeze({
  LCP: 'lcp',
  ABOVE_FOLD: 'above_fold',
  BELOW_FOLD: 'below_fold',
});

const DEFAULT_LADDER = Object.freeze([320, 480, 640, 768, 960, 1280, 1536, 1920, 2560]);

function positiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export function buildWidthLadder(rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const ladder = Array.isArray(args.ladder) && args.ladder.length > 0
    ? [...args.ladder].filter(positiveInt).sort((a, b) => a - b)
    : [...DEFAULT_LADDER];

  const maxDpr = positiveInt(args.maxDpr) ? args.maxDpr : 2;
  const intrinsic = positiveInt(args.intrinsicWidth) ? args.intrinsicWidth : undefined;
  const rendered = positiveInt(args.maxRenderedWidth) ? args.maxRenderedWidth : undefined;

  let ceiling = Infinity;
  if (rendered !== undefined) ceiling = rendered * maxDpr;
  if (intrinsic !== undefined) ceiling = Math.min(ceiling, intrinsic);

  const widths = ladder.filter((w) => w <= ceiling);

  if (Number.isFinite(ceiling) && widths[widths.length - 1] !== ceiling) {
    const last = widths[widths.length - 1];
    if (last === undefined || ceiling - last > 1) widths.push(Math.floor(ceiling));
  }

  if (widths.length === 0 && Number.isFinite(ceiling)) return [Math.floor(ceiling)];

  return [...new Set(widths)].sort((a, b) => a - b);
}

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

export function planResponsiveImage(rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
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
    loading: role === IMAGE_ROLE.BELOW_FOLD ? 'lazy' : 'eager',
    fetchpriority: isLcp ? 'high' : 'auto',
    decoding: isLcp ? 'auto' : 'async',
    preload: isLcp,
    warnings,
  };
}

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
