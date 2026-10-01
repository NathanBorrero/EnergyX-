import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSizeSelectionTracker,
  resolveShopifyPublish,
  SIZE_SELECTED_EVENT,
} from '../size-selected-event.js';
import { createVariantMatrix, VALUE_STATUS } from '../variant-matrix.js';

/** Capturador de publicaciones, en lugar de un navegador. */
function spy({ throws = false } = {}) {
  const calls = [];
  const fn = (name, data) => {
    calls.push({ name, data });
    if (throws) throw new Error('fallo de publicación simulado');
  };
  return { fn, calls };
}

const VARIANTS = [
  { id: 'v1', selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }], availableForSale: true },
  { id: 'v2', selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '43' }], availableForSale: false },
  { id: 'v3', selectedOptions: [{ name: 'Color', value: 'Arena' }, { name: 'Talla', value: '42' }], availableForSale: true },
];

describe('nombre y mecanismo', () => {
  test('el nombre lleva el prefijo obligatorio', () => {
    assert.equal(SIZE_SELECTED_EVENT, 'ne:size_selected');
    assert.ok(SIZE_SELECTED_EVENT.includes(':'), 'los estándar no se pueden publicar sin prefijo');
  });

  test('sin Shopify en el entorno, resolveShopifyPublish devuelve null y no lanza', () => {
    assert.equal(resolveShopifyPublish(), null);
  });
});

describe('resolución del publicador del Online Store', () => {
  afterEach(() => {
    delete /** @type {any} */ (globalThis).Shopify;
  });

  test('encuentra Shopify.analytics.publish cuando existe', () => {
    const calls = [];
    /** @type {any} */ (globalThis).Shopify = {
      analytics: { publish: (n, d) => calls.push([n, d]) },
    };
    const publish = resolveShopifyPublish();
    assert.equal(typeof publish, 'function');
    publish('x', {});
    assert.equal(calls.length, 1);
  });

  test('ignora un Shopify sin analytics.publish', () => {
    /** @type {any} */ (globalThis).Shopify = { analytics: {} };
    assert.equal(resolveShopifyPublish(), null);
    /** @type {any} */ (globalThis).Shopify = { analytics: { publish: 'no es función' } };
    assert.equal(resolveShopifyPublish(), null);
  });
});

describe('caso válido', () => {
  test('publica una talla válida con el estado real de la combinación', () => {
    const m = createVariantMatrix(VARIANTS);
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn, now: () => 1700000000000 });

    const status = m.statusFor('Talla', '42', { Color: 'Negro' });
    const out = t.track({ size: '42', status, context: { productHandle: 'modelo', variantId: 'v1' } });

    assert.equal(out.published, true);
    assert.equal(s.calls[0].name, 'ne:size_selected');
    assert.deepEqual(s.calls[0].data, {
      option_name: 'Talla',
      size: '42',
      selected_at: '2023-11-14T22:13:20.000Z',
      status: VALUE_STATUS.AVAILABLE,
      product_handle: 'modelo',
      variant_id: 'v1',
    });
  });

  test('el payload es serializable, que es un requisito del mecanismo', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', status: VALUE_STATUS.AVAILABLE });
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(s.calls[0].data)));
  });
});

describe('los tres estados llegan al evento', () => {
  const m = createVariantMatrix(VARIANTS);

  test('talla agotada se publica como unavailable, no se oculta', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '43', status: m.statusFor('Talla', '43', { Color: 'Negro' }) });
    assert.equal(s.calls[0].data.status, VALUE_STATUS.UNAVAILABLE);
  });

  test('talla inexistente para el color se publica como nonexistent', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '43', status: m.statusFor('Talla', '43', { Color: 'Arena' }) });
    assert.equal(s.calls[0].data.status, VALUE_STATUS.NONEXISTENT);
  });

  test('un estado inventado no se emite', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', status: 'inventado' });
    assert.equal('status' in s.calls[0].data, false);
  });
});

describe('talla antes de color, y cambio de color', () => {
  const m = createVariantMatrix(VARIANTS);

  test('seleccionar talla sin color elegido funciona y refleja el estado global', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '43', status: m.statusFor('Talla', '43', {}) });
    // La 43 existe en Negro aunque esté agotada: el estado global es unavailable.
    assert.equal(s.calls[0].data.status, VALUE_STATUS.UNAVAILABLE);
  });

  test('cambiar de color con la misma talla no republica: la talla no cambió', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', status: VALUE_STATUS.AVAILABLE, context: { productHandle: 'm' } });
    const second = t.track({ size: '42', status: VALUE_STATUS.AVAILABLE, context: { productHandle: 'm' } });
    assert.equal(second.published, false);
    assert.equal(second.reason, 'duplicate');
    assert.equal(s.calls.length, 1);
  });
});

describe('deduplicación', () => {
  test('cambios rápidos a la misma talla producen un solo evento', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    for (let i = 0; i < 10; i += 1) t.track({ size: '42', status: VALUE_STATUS.AVAILABLE });
    assert.equal(s.calls.length, 1);
    assert.deepEqual(t.stats(), { published: 1, suppressed: 9 });
  });

  test('alternar entre dos tallas sí publica cada cambio real', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42' });
    t.track({ size: '43' });
    t.track({ size: '42' });
    assert.equal(s.calls.length, 3);
  });

  test('la deduplicación ignora espacios y caja', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42' });
    t.track({ size: ' 42 ' });
    assert.equal(s.calls.length, 1);
  });

  test('la misma talla en otro producto no es duplicado', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', context: { productHandle: 'uno' } });
    t.track({ size: '42', context: { productHandle: 'dos' } });
    assert.equal(s.calls.length, 2);
  });

  test('reset permite volver a publicar la misma talla', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42' });
    t.reset();
    t.track({ size: '42' });
    assert.equal(s.calls.length, 2);
  });
});

describe('datos incompletos y manipulados (§216, §208)', () => {
  test('sin talla no publica nada', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    for (const size of [undefined, null, '', '   ', 42, {}, []]) {
      const out = t.track({ size });
      assert.equal(out.published, false);
      assert.equal(out.reason, 'size_missing');
    }
    assert.equal(s.calls.length, 0);
  });

  test('llamar sin argumentos no lanza', () => {
    const t = createSizeSelectionTracker({ publish: spy().fn });
    assert.doesNotThrow(() => t.track());
    assert.doesNotThrow(() => t.track({}));
  });

  test('un contexto con campos no-cadena se descarta en silencio', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', context: { productId: 42, variantId: {}, source: null } });
    const data = s.calls[0].data;
    assert.equal('product_id' in data, false);
    assert.equal('variant_id' in data, false);
    assert.equal('source' in data, false);
  });

  test('una cadena desmesurada se recorta en lugar de emitirse entera', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: 'x'.repeat(5000) });
    assert.equal(s.calls[0].data.size.length, 120);
  });

  test('el payload nunca incluye precio, ni cantidad, ni nada de negocio', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({
      size: '42',
      status: VALUE_STATUS.AVAILABLE,
      // Aunque quien llame intente colar estos campos, no están en el contrato.
      context: { productHandle: 'm' },
    });
    const keys = Object.keys(s.calls[0].data);
    for (const forbidden of ['price', 'revenue', 'total', 'quantity', 'email', 'phone', 'customer']) {
      assert.equal(keys.includes(forbidden), false, `${forbidden} no debe viajar`);
    }
  });

  test('claves peligrosas en el contexto no contaminan el payload', () => {
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    t.track({ size: '42', context: JSON.parse('{"__proto__":{"x":1},"constructor":"y"}') });
    assert.equal({}.x, undefined);
    assert.equal(Object.getPrototypeOf(s.calls[0].data), Object.prototype);
  });
});

describe('fallo al publicar nunca rompe la compra (§215)', () => {
  test('si publish lanza, track lo reporta y no propaga', () => {
    const s = spy({ throws: true });
    const t = createSizeSelectionTracker({ publish: s.fn });
    let out;
    assert.doesNotThrow(() => { out = t.track({ size: '42' }); });
    assert.equal(out.published, false);
    assert.equal(out.reason, 'publish_failed');
    assert.deepEqual(t.stats(), { published: 0, suppressed: 0 });
  });

  test('sin publicador no lanza y no reintenta la misma selección', () => {
    const t = createSizeSelectionTracker({ publish: null });
    assert.equal(t.track({ size: '42' }).reason, 'no_publisher');
    assert.equal(t.track({ size: '42' }).reason, 'duplicate');
  });
});

describe('producto sin variantes', () => {
  test('sin variantes no hay estado que informar, y el evento sigue siendo válido', () => {
    const m = createVariantMatrix([]);
    const s = spy();
    const t = createSizeSelectionTracker({ publish: s.fn });
    // Una interfaz no debería ofrecer talla aquí, pero si lo hace no se rompe.
    t.track({ size: '42', status: m.statusFor('Talla', '42') });
    assert.equal(s.calls[0].data.status, VALUE_STATUS.NONEXISTENT);
  });
});

describe('dos rastreadores no comparten estado', () => {
  test('el estado es local, no global', () => {
    const a = spy();
    const b = spy();
    const t1 = createSizeSelectionTracker({ publish: a.fn });
    const t2 = createSizeSelectionTracker({ publish: b.fn });
    t1.track({ size: '42' });
    t2.track({ size: '42' });
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 1);
  });
});
