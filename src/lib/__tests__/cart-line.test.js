import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCartLine, normalizeAttributes, sizeFitAttributes, REJECTION, MAX_LINE_ATTRIBUTES } from '../cart-line.js';
import { createVariantMatrix, VALUE_STATUS } from '../variant-matrix.js';

const VARIANTS = [
  { id: 'gid://shopify/ProductVariant/1', selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }], availableForSale: true },
  { id: 'gid://shopify/ProductVariant/2', selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '43' }], availableForSale: false },
  { id: 'gid://shopify/ProductVariant/3', selectedOptions: [{ name: 'Color', value: 'Arena' }, { name: 'Talla', value: '42' }], availableForSale: true },
];
const matrix = createVariantMatrix(VARIANTS);

describe('buildCartLine — camino válido', () => {
  test('construye la forma exacta de CartLineInput', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Negro', Talla: '42' } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.line, { merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 });
  });

  test('respeta la cantidad', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Negro', Talla: '42' }, quantity: 3 });
    assert.equal(r.line.quantity, 3);
  });

  test('tolera nombres de opción en otra caja, como el resto del sistema', () => {
    const r = buildCartLine({ matrix, selection: { color: 'negro', talla: '42' } });
    assert.equal(r.ok, true);
  });

  test('no emite campos que el proyecto no usa', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Negro', Talla: '42' } });
    assert.equal('sellingPlanId' in r.line, false);
    assert.equal('parent' in r.line, false);
    assert.equal('attributes' in r.line, false); // sin atribuciones, no se emite la clave
  });
});

describe('buildCartLine — la puerta que impide carritos rotos', () => {
  test('una combinación inexistente no llega al carrito', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Arena', Talla: '43' } });
    assert.equal(r.ok, false);
    assert.equal(r.reason, REJECTION.NONEXISTENT);
    assert.equal(r.status, VALUE_STATUS.NONEXISTENT);
  });

  test('una combinación agotada no llega al carrito, y se distingue de la inexistente', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Negro', Talla: '43' } });
    assert.equal(r.ok, false);
    assert.equal(r.reason, REJECTION.OUT_OF_STOCK);
    assert.equal(r.status, VALUE_STATUS.UNAVAILABLE);
  });

  test('una selección incompleta dice qué falta, para señalar el selector correcto', () => {
    const r = buildCartLine({ matrix, selection: { Color: 'Negro' } });
    assert.equal(r.ok, false);
    assert.equal(r.reason, REJECTION.INCOMPLETE_SELECTION);
    assert.deepEqual(r.missing, ['Talla']);
  });

  test('sin ninguna selección lista todas las opciones que faltan', () => {
    const r = buildCartLine({ matrix, selection: {} });
    assert.deepEqual(r.missing, ['Color', 'Talla']);
  });

  test('`availableForSale` ausente se trata como no comprable', () => {
    const m = createVariantMatrix([
      { id: 'v', selectedOptions: [{ name: 'Talla', value: '42' }] },
    ]);
    const r = buildCartLine({ matrix: m, selection: { Talla: '42' } });
    assert.equal(r.reason, REJECTION.OUT_OF_STOCK);
  });

  test('una variante sin id no se puede añadir', () => {
    const m = createVariantMatrix([
      { id: '', selectedOptions: [{ name: 'Talla', value: '42' }], availableForSale: true },
    ]);
    assert.equal(buildCartLine({ matrix: m, selection: { Talla: '42' } }).reason, REJECTION.NO_VARIANT_ID);
  });

  test('cantidades inválidas se rechazan', () => {
    for (const quantity of [0, -1, 1.5, NaN, Infinity, '2', null]) {
      const r = buildCartLine({ matrix, selection: { Color: 'Negro', Talla: '42' }, quantity });
      assert.equal(r.ok, false, `aceptó cantidad ${String(quantity)}`);
      assert.equal(r.reason, REJECTION.INVALID_QUANTITY);
    }
  });

  test('sin matriz no lanza, devuelve un motivo', () => {
    for (const bad of [null, undefined, {}, 'texto']) {
      const r = buildCartLine({ matrix: bad, selection: {} });
      assert.equal(r.reason, REJECTION.NO_MATRIX);
    }
  });

  test('llamar sin argumentos no lanza', () => {
    assert.doesNotThrow(() => buildCartLine());
    assert.equal(buildCartLine().ok, false);
  });
});

describe('normalizeAttributes', () => {
  test('acepta objeto y acepta lista', () => {
    assert.deepEqual(normalizeAttributes({ a: '1' }), [{ key: 'a', value: '1' }]);
    assert.deepEqual(normalizeAttributes([{ key: 'a', value: '1' }]), [{ key: 'a', value: '1' }]);
  });

  test('convierte números y booleanos, que son datos legítimos', () => {
    assert.deepEqual(normalizeAttributes({ n: 42, b: false }), [
      { key: 'n', value: '42' },
      { key: 'b', value: 'false' },
    ]);
  });

  test('descarta lo que produciría basura en un pedido real', () => {
    const out = normalizeAttributes({ a: undefined, b: null, c: {}, d: [], e: NaN, f: '' });
    assert.deepEqual(out, []);
  });

  test('respeta el límite de 250 atribuciones de la plataforma', () => {
    const many = {};
    for (let i = 0; i < 400; i += 1) many[`k${i}`] = String(i);
    assert.equal(normalizeAttributes(many).length, MAX_LINE_ATTRIBUTES);
  });

  test('recorta cadenas desmesuradas', () => {
    const out = normalizeAttributes({ k: 'x'.repeat(5000) });
    assert.equal(out[0].value.length, 200);
  });

  test('no duplica claves', () => {
    assert.equal(normalizeAttributes([{ key: 'a', value: '1' }, { key: 'a', value: '2' }]).length, 1);
  });

  test('entrada basura devuelve lista vacía', () => {
    for (const bad of [null, undefined, 'texto', 42, true]) {
      assert.deepEqual(normalizeAttributes(bad), []);
    }
  });
});

describe('sizeFitAttributes — el dato que permite medir el RTO por talla', () => {
  test('marca si el comprador siguió la recomendación', () => {
    assert.equal(sizeFitAttributes({ chosenSize: '42', recommendedSize: '42' })._ne_size_followed, 'true');
    assert.equal(sizeFitAttributes({ chosenSize: '43', recommendedSize: '42' })._ne_size_followed, 'false');
  });

  test('sin recomendación no se afirma si la siguió', () => {
    const a = sizeFitAttributes({ chosenSize: '42' });
    assert.equal('_ne_size_followed' in a, false);
  });

  test('no inventa una medida de pie que el comprador no dio', () => {
    for (const footLengthCm of [undefined, null, 0, -1, NaN, '26.6']) {
      const a = sizeFitAttributes({ chosenSize: '42', footLengthCm });
      assert.equal('_ne_foot_length_cm' in a, false, `inventó medida con ${String(footLengthCm)}`);
    }
  });

  test('redondea la medida a un decimal', () => {
    assert.equal(sizeFitAttributes({ footLengthCm: 26.6499 })._ne_foot_length_cm, '26.6');
  });

  test('sin datos devuelve objeto vacío, no claves con undefined', () => {
    assert.deepEqual(sizeFitAttributes(), {});
    assert.deepEqual(sizeFitAttributes({}), {});
  });

  test('se integra con buildCartLine y produce una línea lista para cartLinesAdd', () => {
    const r = buildCartLine({
      matrix,
      selection: { Color: 'Negro', Talla: '42' },
      attributes: sizeFitAttributes({ chosenSize: '42', recommendedSize: '43', footLengthCm: 26.9, usedSizeGuide: true }),
    });
    assert.equal(r.ok, true);
    const byKey = Object.fromEntries(r.line.attributes.map((a) => [a.key, a.value]));
    assert.deepEqual(byKey, {
      _ne_size_chosen: '42',
      _ne_size_recommended: '43',
      _ne_size_followed: 'false',
      _ne_foot_length_cm: '26.9',
      _ne_size_guide_used: 'true',
    });
  });
});
