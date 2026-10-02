import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  planResponsiveImage,
  buildWidthLadder,
  buildSizes,
  auditImageUsage,
  IMAGE_ROLE,
} from '../responsive-image.js';

describe('buildWidthLadder', () => {
  test('acota al ancho intrínseco: pedir más no mejora y gasta bytes', () => {
    const w = buildWidthLadder({ intrinsicWidth: 1200, maxRenderedWidth: 1600 });
    assert.ok(Math.max(...w) <= 1200);
  });

  test('acota a lo que el diseño necesita a la densidad máxima', () => {
    const w = buildWidthLadder({ intrinsicWidth: 4000, maxRenderedWidth: 640, maxDpr: 2 });
    assert.ok(Math.max(...w) <= 1280);
  });

  test('sin datos devuelve la escalera completa', () => {
    const w = buildWidthLadder();
    assert.ok(w.length > 5);
    assert.deepEqual(w, [...w].sort((a, b) => a - b));
  });

  test('añade el techo exacto si la escalera se queda corta', () => {
    const w = buildWidthLadder({ intrinsicWidth: 1100, maxRenderedWidth: 1100, maxDpr: 1 });
    assert.equal(Math.max(...w), 1100);
  });

  test('una fuente diminuta devuelve al menos un ancho', () => {
    const w = buildWidthLadder({ intrinsicWidth: 80, maxRenderedWidth: 80, maxDpr: 1 });
    assert.deepEqual(w, [80]);
  });

  test('sin duplicados y ascendente', () => {
    const w = buildWidthLadder({ ladder: [640, 640, 320, 960], intrinsicWidth: 2000, maxRenderedWidth: 2000 });
    assert.deepEqual(w, [...new Set(w)].sort((a, b) => a - b));
  });

  test('entrada basura no lanza', () => {
    for (const bad of [null, undefined, 'x', 42, { intrinsicWidth: -5 }, { ladder: 'no' }, { maxDpr: 0 }]) {
      assert.doesNotThrow(() => buildWidthLadder(bad));
    }
  });
});

describe('buildSizes — mobile-first', () => {
  test('ordena los breakpoints de menor a mayor y deja el fallback al final', () => {
    const sizes = buildSizes([
      { width: '33vw' },
      { upTo: 1024, width: '50vw' },
      { upTo: 640, width: '100vw' },
    ]);
    assert.equal(sizes, '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw');
  });

  test('usa max-width, no min-width, que es lo que pide la guía', () => {
    const sizes = buildSizes([{ upTo: 749, width: '100vw' }, { width: '50vw' }]);
    assert.ok(sizes.includes('max-width'));
    assert.equal(sizes.includes('min-width'), false);
  });

  test('admite expresiones calc, que es el caso real con gutters', () => {
    const sizes = buildSizes([{ upTo: 749, width: 'calc(100vw - 2rem)' }, { width: 'calc(50vw - 3rem)' }]);
    assert.equal(sizes, '(max-width: 749px) calc(100vw - 2rem), calc(50vw - 3rem)');
  });

  test('sin layout cae a 100vw', () => {
    for (const bad of [[], null, undefined, 'x', [{}], [{ width: '' }]]) {
      assert.equal(buildSizes(bad), '100vw');
    }
  });

  test('un solo breakpoint sin upTo es el fallback', () => {
    assert.equal(buildSizes([{ width: '640px' }]), '640px');
  });
});

describe('planResponsiveImage — reglas de carga verificadas', () => {
  const layout = [{ upTo: 749, width: '100vw' }, { width: '50vw' }];

  test('la imagen LCP nunca va en diferido y lleva prioridad alta', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.LCP, layout, intrinsicWidth: 2000, maxRenderedWidth: 960 });
    assert.equal(p.loading, 'eager');
    assert.equal(p.fetchpriority, 'high');
    assert.equal(p.preload, true);
  });

  test('arriba del pliegue no va en diferido, pero no roba prioridad a la LCP', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.ABOVE_FOLD, layout, intrinsicWidth: 2000 });
    assert.equal(p.loading, 'eager');
    assert.equal(p.fetchpriority, 'auto');
    assert.equal(p.preload, false);
  });

  test('bajo el pliegue sí va en diferido', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.BELOW_FOLD, layout, intrinsicWidth: 2000 });
    assert.equal(p.loading, 'lazy');
    assert.equal(p.decoding, 'async');
  });

  test('por defecto es bajo el pliegue: lo conservador es no robar prioridad', () => {
    assert.equal(planResponsiveImage({ layout }).loading, 'lazy');
  });

  test('un papel desconocido avisa y degrada a bajo el pliegue', () => {
    const p = planResponsiveImage({ role: 'hero_gigante', layout });
    assert.equal(p.loading, 'lazy');
    assert.ok(p.warnings.some((w) => w.includes('papel desconocido')));
  });

  test('avisa de lo que impide optimizar, en lugar de callarlo', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.LCP, maxRenderedWidth: 960 });
    assert.ok(p.warnings.some((w) => w.includes('sin breakpoints')));
    assert.ok(p.warnings.some((w) => w.includes('sin ancho intrínseco')));
    assert.ok(p.warnings.some((w) => w.includes('100vw')));
  });

  test('un plan completo no genera avisos', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.LCP, layout, intrinsicWidth: 2400, maxRenderedWidth: 960 });
    assert.deepEqual(p.warnings, []);
  });

  test('no emite format ni quality: eso es de la plataforma', () => {
    const p = planResponsiveImage({ role: IMAGE_ROLE.LCP, layout, intrinsicWidth: 2400 });
    assert.equal('format' in p, false);
    assert.equal('quality' in p, false);
  });

  test('nunca lanza', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      assert.doesNotThrow(() => planResponsiveImage(bad));
    }
  });
});

describe('auditImageUsage — detecta las infracciones reales', () => {
  test('LCP en diferido es la infracción más cara', () => {
    const p = auditImageUsage({ role: IMAGE_ROLE.LCP, loading: 'lazy', fetchpriority: 'high' });
    assert.ok(p.some((x) => x.includes('diferido')));
  });

  test('LCP sin fetchpriority alta', () => {
    const p = auditImageUsage({ role: IMAGE_ROLE.LCP, loading: 'eager', fetchpriority: 'auto' });
    assert.ok(p.some((x) => x.includes('fetchpriority')));
  });

  test('LCP como background-image de CSS', () => {
    const p = auditImageUsage({ role: IMAGE_ROLE.LCP, loading: 'eager', fetchpriority: 'high', isBackgroundImage: true });
    assert.ok(p.some((x) => x.includes('background-image')));
  });

  test('imagen bajo el pliegue cargada de forma anticipada', () => {
    const p = auditImageUsage({ role: IMAGE_ROLE.BELOW_FOLD, loading: 'eager' });
    assert.ok(p.some((x) => x.includes('bajo el pliegue')));
  });

  test('`sizes` con min-width en lugar de mobile-first', () => {
    const p = auditImageUsage({ role: IMAGE_ROLE.ABOVE_FOLD, sizes: '(min-width: 750px) 50vw, 100vw' });
    assert.ok(p.some((x) => x.includes('min-width')));
  });

  test('un uso correcto no reporta nada', () => {
    assert.deepEqual(
      auditImageUsage({ role: IMAGE_ROLE.LCP, loading: 'eager', fetchpriority: 'high', sizes: '(max-width: 749px) 100vw, 50vw', isBackgroundImage: false }),
      [],
    );
  });

  test('el plan que genera el módulo pasa su propia auditoría', () => {
    for (const role of Object.values(IMAGE_ROLE)) {
      const plan = planResponsiveImage({ role, layout: [{ upTo: 749, width: '100vw' }, { width: '50vw' }], intrinsicWidth: 2400, maxRenderedWidth: 960 });
      assert.deepEqual(auditImageUsage({ role, ...plan }), [], `el plan de ${role} falla su auditoría`);
    }
  });

  test('entrada basura no lanza', () => {
    for (const bad of [null, undefined, 'x', 42]) {
      assert.doesNotThrow(() => auditImageUsage(bad));
    }
  });
});
