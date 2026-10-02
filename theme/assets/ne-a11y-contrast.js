/* GENERADO por scripts/sync-theme-assets.mjs desde src/lib/a11y-contrast.js.
   NO EDITAR AQUÍ: el cambio se perdería en la siguiente sincronización y la
   comprobación `assets del theme sincronizados` fallaría. Edita el módulo
   original, que es el que tiene pruebas. */
/**
 * Contraste y tamaño de objetivo táctil.
 *
 * POR QUÉ EXISTE AHORA, ANTES DEL SISTEMA VISUAL
 * ----------------------------------------------
 * El proyecto se fijó un umbral medible: **media de Lighthouse de accesibilidad
 * ≥ 90** en home, producto y colección, en escritorio y en móvil. Y hay una
 * colisión previsible entre ese umbral y la estética premium habitual —tipografía
 * fina, gris claro sobre blanco, texto pequeño, botones etéreos—, que **falla**
 * 4.5:1 y falla 24×24 px.
 *
 * Descubrir eso con una auditoría al final obliga a rehacer la paleta. Tenerlo
 * como función pura permite validar la paleta **antes** de pintar un solo píxel,
 * cuando llegue la dirección de arte.
 *
 * REQUISITOS, `VERIFIED` DE LOS REQUISITOS DE THEME DE SHOPIFY
 * -----------------------------------------------------------
 *  · Cuerpo de texto: contraste **4.5:1**.
 *  · Texto mayor de 18pt y elementos no textuales (bordes, iconos): **3:1**.
 *  · Objetivo táctil para punteros: mínimo **24 × 24 px CSS**.
 *
 * FÓRMULA
 * -------
 * Luminancia relativa y razón de contraste de WCAG 2.x. La conversión sRGB a
 * lineal usa el umbral **0.03928** tal como aparece en el texto de la norma;
 * circula también 0.04045, que es el valor matemáticamente consistente. La
 * diferencia solo afecta a un intervalo diminuto de valores y no cambia ninguna
 * decisión de diseño, pero se deja dicho en lugar de fingir que no existe.
 *
 * Sin dependencias. Pura.
 */

/** Umbrales de contraste exigidos. */
export const CONTRAST = Object.freeze({
  BODY_TEXT: 4.5,
  LARGE_TEXT: 3,
  NON_TEXT: 3,
});

/** Tamaño mínimo de objetivo táctil, en píxeles CSS. */
export const MIN_TOUCH_TARGET_PX = 24;

/** Tamaño a partir del cual un texto cuenta como grande. 18pt ≈ 24px CSS. */
export const LARGE_TEXT_PX = 24;
/** Un texto en negrita cuenta como grande antes: 14pt ≈ 18.66px. */
export const LARGE_BOLD_TEXT_PX = 18.66;

/**
 * Convierte un color a sus tres componentes 0–255.
 *
 * Acepta `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa` y `rgb()` / `rgba()`. Devuelve
 * `null` para cualquier otra cosa, incluidos nombres de color y `hsl()`: no se
 * adivina una tabla de nombres ni se implementa una conversión a medias.
 *
 * El canal alfa se ignora a propósito: el contraste real de un color
 * semitransparente depende de lo que haya detrás, y suponerlo blanco sería
 * inventar. Quien use alfa debe calcular antes el color compuesto.
 *
 * @param {unknown} color
 * @returns {{r: number, g: number, b: number, hadAlpha: boolean}|null}
 */
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

/**
 * Luminancia relativa de WCAG, de 0 (negro) a 1 (blanco).
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {number}
 */
export function relativeLuminance(rgb) {
  // Es un export público, así que tiene que tolerar lo que le llegue. Devuelve 0
  // —el valor del negro— ante una entrada inutilizable, en lugar de lanzar o de
  // propagar un NaN que contaminaría cualquier razón de contraste.
  if (!rgb || typeof rgb !== 'object') return 0;
  const channel = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    const c = Math.min(255, Math.max(0, value)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Razón de contraste entre dos colores, de 1 a 21.
 *
 * Devuelve `null` si alguno no se puede interpretar: un `null` obliga a quien
 * llama a decidir, mientras que un 1 o un 21 inventado se colaría como dato.
 *
 * @param {unknown} foreground
 * @param {unknown} background
 * @returns {number|null}
 */
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

/**
 * @typedef {object} ContrastVerdict
 * @property {boolean} passes
 * @property {number|null} ratio
 * @property {number} required
 * @property {string} rule        Qué regla se aplicó.
 * @property {string} [reason]    Por qué no se pudo evaluar.
 */

/**
 * Evalúa un par de colores contra el umbral que de verdad le toca.
 *
 * El umbral depende del tamaño y del peso de la fuente, no de una preferencia:
 * un texto grande o en negrita puede bajar a 3:1, el cuerpo no.
 *
 * @param {object} args
 * @param {string} args.foreground
 * @param {string} args.background
 * @param {number} [args.fontSizePx]  Tamaño en px CSS. Sin él se asume cuerpo.
 * @param {boolean} [args.bold]
 * @param {boolean} [args.nonText]    Bordes, iconos, separadores.
 * @returns {ContrastVerdict}
 */
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

/**
 * Comprueba el tamaño de un objetivo táctil.
 *
 * El área efectiva puede ser mayor que la caja visible si hay padding o un
 * pseudo-elemento que la amplía, así que se admite declararla. El mínimo aplica
 * al área efectiva, que es lo que el dedo puede acertar.
 *
 * @param {object} args
 * @param {number} [args.width]   Ancho visible, en px CSS.
 * @param {number} [args.height]
 * @param {number} [args.effectiveWidth]
 * @param {number} [args.effectiveHeight]
 * @returns {{passes: boolean, width: number|null, height: number|null, required: number, reason?: string}}
 */
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

/**
 * Audita una paleta completa: cada par declarado contra su umbral.
 *
 * Pensado para correr sobre los tokens de color en cuanto exista la dirección de
 * arte, y así descubrir el problema antes de pintar, no en la auditoría final.
 *
 * @param {Array<{name: string, foreground: string, background: string, fontSizePx?: number, bold?: boolean, nonText?: boolean}>} pairs
 * @returns {{passes: boolean, failures: Array<{name: string, ratio: number|null, required: number, rule: string}>, checked: number}}
 */
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
