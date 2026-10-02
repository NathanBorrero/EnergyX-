/* generado desde src/lib/a11y-contrast.js — no editar, ver scripts/sync-theme-assets.mjs */
export const CONTRAST = Object.freeze({
  BODY_TEXT: 4.5,
  LARGE_TEXT: 3,
  NON_TEXT: 3,
});

export const MIN_TOUCH_TARGET_PX = 24;

export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 18.66;

export function parseColor(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim().toLowerCase();
  if (value === '') return null;

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = [...digits.slice(0, 3)].map((c) => parseInt(c + c, 16));
      return { r, g, b, hadAlpha: digits.length === 4 };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        hadAlpha: digits.length === 8,
      };
    }
    return null;
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((part) => {
      if (part.endsWith('%')) {
        const pct = Number.parseFloat(part);
        return Number.isFinite(pct) ? Math.round((pct / 100) * 255) : NaN;
      }
      const n = Number.parseFloat(part);
      return Number.isFinite(n) ? Math.round(n) : NaN;
    });
    if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
    return { r: channels[0], g: channels[1], b: channels[2], hadAlpha: parts.length > 3 };
  }

  return null;
}

export function relativeLuminance(rgb) {
  if (!rgb || typeof rgb !== 'object') return 0;
  const channel = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    const c = Math.min(255, Math.max(0, value)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(foreground, background) {
  const a = parseColor(foreground);
  const b = parseColor(background);
  if (a === null || b === null) return null;

  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function checkContrast(args) {
  const a = args && typeof args === 'object' ? args : {};
  const ratio = contrastRatio(a.foreground, a.background);

  const size = typeof a.fontSizePx === 'number' && Number.isFinite(a.fontSizePx) ? a.fontSizePx : undefined;
  const isLarge =
    a.nonText !== true &&
    size !== undefined &&
    (size >= LARGE_TEXT_PX || (a.bold === true && size >= LARGE_BOLD_TEXT_PX));

  const required = a.nonText === true
    ? CONTRAST.NON_TEXT
    : isLarge
      ? CONTRAST.LARGE_TEXT
      : CONTRAST.BODY_TEXT;

  const rule = a.nonText === true ? 'non_text' : isLarge ? 'large_text' : 'body_text';

  if (ratio === null) {
    return { passes: false, ratio: null, required, rule, reason: 'color_no_interpretable' };
  }
  return { passes: ratio >= required, ratio, required, rule };
}

export function checkTouchTarget(args) {
  const a = args && typeof args === 'object' ? args : {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

  const width = num(a.effectiveWidth) ?? num(a.width);
  const height = num(a.effectiveHeight) ?? num(a.height);

  if (width === undefined || height === undefined) {
    return { passes: false, width: width ?? null, height: height ?? null, required: MIN_TOUCH_TARGET_PX, reason: 'dimensiones_incompletas' };
  }
  return {
    passes: width >= MIN_TOUCH_TARGET_PX && height >= MIN_TOUCH_TARGET_PX,
    width,
    height,
    required: MIN_TOUCH_TARGET_PX,
  };
}

export function auditPalette(pairs) {
  const list = Array.isArray(pairs) ? pairs : [];
  const failures = [];
  let checked = 0;

  for (const pair of list) {
    if (!pair || typeof pair !== 'object') continue;
    checked += 1;
    const verdict = checkContrast(pair);
    if (!verdict.passes) {
      failures.push({
        name: typeof pair.name === 'string' && pair.name.trim() !== '' ? pair.name.trim() : '(sin nombre)',
        ratio: verdict.ratio,
        required: verdict.required,
        rule: verdict.rule,
      });
    }
  }

  return { passes: failures.length === 0, failures, checked };
}
