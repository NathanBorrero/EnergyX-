import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  checkContrast,
  checkTouchTarget,
  auditPalette,
  CONTRAST,
  MIN_TOUCH_TARGET_PX,
} from '../a11y-contrast.js';

describe('parseColor', () => {
  test('acepta las formas hexadecimales reales', () => {
    assert.deepEqual(parseColor('#000'), { r: 0, g: 0, b: 0, hadAlpha: false });
    assert.deepEqual(parseColor('#FFFFFF'), { r: 255, g: 255, b: 255, hadAlpha: false });
    assert.deepEqual(parseColor('#1a2b3c'), { r: 26, g: 43, b: 60, hadAlpha: false });
    assert.equal(parseColor('#0008').hadAlpha, true);
    assert.equal(parseColor('#11223344').hadAlpha, true);
  });

  test('acepta rgb y rgba, con y sin porcentajes', () => {
    assert.deepEqual(parseColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, hadAlpha: false });
    assert.deepEqual(parseColor('rgb(255 0 0)'), { r: 255, g: 0, b: 0, hadAlpha: false });
    assert.equal(parseColor('rgba(0,0,0,0.5)').hadAlpha, true);
    assert.deepEqual(parseColor('rgb(100%, 0%, 0%)'), { r: 255, g: 0, b: 0, hadAlpha: false });
  });

  test('rechaza lo que no sabe interpretar en lugar de adivinar', () => {
    for (const bad of ['red', 'hsl(0 100% 50%)', 'currentColor', 'transparent', '#12', '#1234567', 'rgb(1,2)', 'rgb(300,0,0)', '', null, undefined, 42, {}]) {
      assert.equal(parseColor(bad), null, `adivinó con ${String(bad)}`);
    }
  });
});

describe('relativeLuminance y contrastRatio', () => {
  test('los extremos son los conocidos', () => {
    assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
    assert.equal(Math.round(relativeLuminance({ r: 255, g: 255, b: 255 })), 1);
  });

  test('negro sobre blanco es 21:1, el máximo', () => {
    assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  });

  test('un color contra sí mismo es 1:1', () => {
    assert.equal(contrastRatio('#3a3a3a', '#3a3a3a'), 1);
  });

  test('es simétrico: el orden de los colores no cambia la razón', () => {
    assert.equal(contrastRatio('#333', '#fff'), contrastRatio('#fff', '#333'));
  });

  test('devuelve null si algún color no se interpreta, en lugar de un número inventado', () => {
    assert.equal(contrastRatio('red', '#fff'), null);
    assert.equal(contrastRatio('#fff', null), null);
  });
});

describe('checkContrast — el umbral que de verdad toca', () => {
  test('el cuerpo de texto exige 4.5:1', () => {
    const v = checkContrast({ foreground: '#767676', background: '#ffffff' });
    assert.equal(v.required, CONTRAST.BODY_TEXT);
    assert.equal(v.rule, 'body_text');
    assert.equal(v.passes, true); // 4.54:1
  });

  test('un gris un poco más claro ya falla el cuerpo', () => {
    const v = checkContrast({ foreground: '#808080', background: '#ffffff' });
    assert.equal(v.passes, false);
    assert.ok(v.ratio < CONTRAST.BODY_TEXT);
  });

  test('texto grande baja a 3:1', () => {
    const v = checkContrast({ foreground: '#949494', background: '#ffffff', fontSizePx: 32 });
    assert.equal(v.required, CONTRAST.LARGE_TEXT);
    assert.equal(v.rule, 'large_text');
    assert.equal(v.passes, true);
  });

  test('el mismo color falla si el texto es de cuerpo', () => {
    const grande = checkContrast({ foreground: '#949494', background: '#ffffff', fontSizePx: 32 });
    const cuerpo = checkContrast({ foreground: '#949494', background: '#ffffff', fontSizePx: 16 });
    assert.equal(grande.passes, true);
    assert.equal(cuerpo.passes, false);
  });

  test('la negrita adelanta el umbral de texto grande', () => {
    const normal = checkContrast({ foreground: '#949494', background: '#fff', fontSizePx: 19 });
    const negrita = checkContrast({ foreground: '#949494', background: '#fff', fontSizePx: 19, bold: true });
    assert.equal(normal.rule, 'body_text');
    assert.equal(negrita.rule, 'large_text');
  });

  test('elementos no textuales exigen 3:1 aunque sean grandes', () => {
    const v = checkContrast({ foreground: '#949494', background: '#ffffff', nonText: true, fontSizePx: 64 });
    assert.equal(v.rule, 'non_text');
    assert.equal(v.required, CONTRAST.NON_TEXT);
  });

  test('sin tamaño se asume cuerpo, que es lo exigente', () => {
    assert.equal(checkContrast({ foreground: '#949494', background: '#fff' }).rule, 'body_text');
  });

  test('un color no interpretable no pasa, y dice por qué', () => {
    const v = checkContrast({ foreground: 'papayawhip', background: '#fff' });
    assert.equal(v.passes, false);
    assert.equal(v.reason, 'color_no_interpretable');
  });

  test('nunca lanza', () => {
    for (const bad of [null, undefined, 'x', 42, {}]) {
      assert.doesNotThrow(() => checkContrast(bad));
      assert.equal(checkContrast(bad).passes, false);
    }
  });
});

describe('checkTouchTarget', () => {
  test('24×24 px CSS es el mínimo y lo cumple exactamente', () => {
    assert.equal(checkTouchTarget({ width: 24, height: 24 }).passes, true);
    assert.equal(MIN_TOUCH_TARGET_PX, 24);
  });

  test('un selector de talla de 20px falla, que es el caso real', () => {
    const v = checkTouchTarget({ width: 20, height: 20 });
    assert.equal(v.passes, false);
  });

  test('el área efectiva manda sobre la caja visible', () => {
    // Un chip de 16px con padding que lo lleva a 32 sí cumple.
    const v = checkTouchTarget({ width: 16, height: 16, effectiveWidth: 32, effectiveHeight: 32 });
    assert.equal(v.passes, true);
  });

  test('una dimensión insuficiente basta para fallar', () => {
    assert.equal(checkTouchTarget({ width: 48, height: 20 }).passes, false);
    assert.equal(checkTouchTarget({ width: 20, height: 48 }).passes, false);
  });

  test('sin dimensiones no se afirma que cumple', () => {
    const v = checkTouchTarget({});
    assert.equal(v.passes, false);
    assert.equal(v.reason, 'dimensiones_incompletas');
  });

  test('nunca lanza', () => {
    for (const bad of [null, undefined, 'x', 42]) {
      assert.doesNotThrow(() => checkTouchTarget(bad));
    }
  });
});

describe('auditPalette — valida la paleta antes de pintar', () => {
  test('una paleta correcta pasa', () => {
    const r = auditPalette([
      { name: 'cuerpo', foreground: '#1a1a1a', background: '#ffffff' },
      { name: 'titular', foreground: '#555555', background: '#ffffff', fontSizePx: 40 },
      { name: 'borde', foreground: '#8c8c8c', background: '#ffffff', nonText: true },
    ]);
    assert.equal(r.passes, true);
    assert.equal(r.checked, 3);
    assert.deepEqual(r.failures, []);
  });

  test('detecta exactamente el par que falla y contra qué umbral', () => {
    const r = auditPalette([
      { name: 'cuerpo', foreground: '#1a1a1a', background: '#ffffff' },
      { name: 'texto secundario', foreground: '#aaaaaa', background: '#ffffff' },
    ]);
    assert.equal(r.passes, false);
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].name, 'texto secundario');
    assert.equal(r.failures[0].required, CONTRAST.BODY_TEXT);
  });

  test('la estética premium típica de gris claro sobre blanco falla, que es el aviso que importa', () => {
    // Tipografía fina y gris claro: lo que más se ve en marcas "premium".
    const r = auditPalette([
      { name: 'cuerpo gris claro', foreground: '#b0b0b0', background: '#ffffff' },
      { name: 'placeholder', foreground: '#cccccc', background: '#ffffff' },
    ]);
    assert.equal(r.passes, false);
    assert.equal(r.failures.length, 2);
  });

  test('un par sin nombre se reporta de forma identificable', () => {
    const r = auditPalette([{ foreground: '#eee', background: '#fff' }]);
    assert.equal(r.failures[0].name, '(sin nombre)');
  });

  test('entrada basura no lanza y no cuenta nada', () => {
    for (const bad of [null, undefined, 'x', 42, [null, 'x', 7]]) {
      assert.doesNotThrow(() => auditPalette(bad));
    }
    assert.equal(auditPalette([null, 'x']).checked, 0);
  });
});

describe('invariantes de los umbrales', () => {
  test('los números son los verificados de los requisitos de theme', () => {
    assert.equal(CONTRAST.BODY_TEXT, 4.5);
    assert.equal(CONTRAST.LARGE_TEXT, 3);
    assert.equal(CONTRAST.NON_TEXT, 3);
    assert.equal(MIN_TOUCH_TARGET_PX, 24);
  });
});
