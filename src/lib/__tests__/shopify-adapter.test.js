import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fromShopifyProduct, fromSizeChartMetaobjects } from '../shopify-adapter.js';
import { validateProduct, placeholderProduct, MAX_PRODUCT_OPTIONS } from '../product-contract.js';
import { createVariantMatrix, VALUE_STATUS } from '../variant-matrix.js';
import { buildProductGroupJsonLd } from '../product-jsonld.js';
import { recommendSize, reconcileWithStock } from '../size-advisor.js';

/**
 * Forma REAL devuelta por el Admin API de Shopify.
 *
 * Copiada de la respuesta de la tienda de pruebas (Magisik) al crear el producto
 * de validación de matriz de variantes. Los valores son los de aquella prueba
 * técnica, con precio 0.00 y colores placeholder. No es catálogo de N&E.
 *
 * Importa que sea la forma real y no una inventada: el adaptador es el único
 * sitio que conoce esa forma, así que probarlo contra una ficción no prueba nada.
 */
const RESPUESTA_ADMIN_REAL = {
  id: 'gid://shopify/Product/15393359757565',
  title: 'PRUEBA TECNICA NE - matriz de variantes footwear (borrar)',
  handle: 'prueba-tecnica-ne-matriz-de-variantes-footwear-borrar',
  status: 'DRAFT',
  productType: 'Footwear',
  vendor: 'PRUEBA TECNICA',
  descriptionHtml: '<p>Prueba tecnica.</p>',
  featuredMedia: null,
  priceRangeV2: { minVariantPrice: { amount: '0.0', currencyCode: 'COP' } },
  options: [
    { id: 'gid://shopify/ProductOption/1', name: 'Color', position: 1, optionValues: [{ name: 'Placeholder A' }, { name: 'Placeholder B' }] },
    { id: 'gid://shopify/ProductOption/2', name: 'Talla', position: 2, optionValues: [{ name: '39' }, { name: '40' }] },
  ],
  variants: {
    edges: [
      { node: { id: 'gid://shopify/ProductVariant/1', title: 'Placeholder A / 39', sku: null, price: '0.00', availableForSale: false, selectedOptions: [{ name: 'Color', value: 'Placeholder A' }, { name: 'Talla', value: '39' }] } },
      { node: { id: 'gid://shopify/ProductVariant/2', title: 'Placeholder A / 40', sku: null, price: '0.00', availableForSale: false, selectedOptions: [{ name: 'Color', value: 'Placeholder A' }, { name: 'Talla', value: '40' }] } },
      { node: { id: 'gid://shopify/ProductVariant/3', title: 'Placeholder B / 39', sku: 'TEST-B-39', price: '0.00', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Placeholder B' }, { name: 'Talla', value: '39' }] } },
    ],
  },
};

/** Forma de la Storefront API: `nodes` y precio como MoneyV2. `DOCUMENTED`. */
const RESPUESTA_STOREFRONT = {
  id: 'gid://shopify/Product/1',
  title: 'Modelo de prueba',
  handle: 'modelo-de-prueba',
  vendor: 'Marca de prueba',
  description: 'Texto plano.',
  descriptionHtml: '<p>Texto plano.</p>',
  options: [
    { name: 'Color', optionValues: [{ name: 'Negro' }] },
    { name: 'Talla', optionValues: [{ name: '42' }, { name: '43' }] },
  ],
  images: { nodes: [{ url: 'https://cdn.test/1.jpg', altText: 'uno' }] },
  variants: {
    nodes: [
      { id: 'gid://shopify/ProductVariant/10', title: 'Negro / 42', sku: 'NE-42', availableForSale: true, price: { amount: '100000.00', currencyCode: 'COP' }, selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }], image: { url: 'https://cdn.test/v42.jpg' } },
      { id: 'gid://shopify/ProductVariant/11', title: 'Negro / 43', sku: 'NE-43', availableForSale: false, price: { amount: '100000.00', currencyCode: 'COP' }, selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '43' }] },
    ],
  },
};

describe('fromShopifyProduct — Admin API, forma real', () => {
  test('convierte la respuesta real sin perder nada esencial', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL, { urlBase: 'https://tienda.test' });
    assert.equal(p.title, RESPUESTA_ADMIN_REAL.title);
    assert.equal(p.handle, RESPUESTA_ADMIN_REAL.handle);
    assert.equal(p.brand, 'PRUEBA TECNICA');
    assert.equal(p.url, 'https://tienda.test/products/prueba-tecnica-ne-matriz-de-variantes-footwear-borrar');
    assert.equal(p.variants.length, 3);
    assert.deepEqual(p.options.map((o) => o.name), ['Color', 'Talla']);
  });

  test('desenvuelve `edges { node }` del Admin API', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    assert.equal(p.variants[0].id, 'gid://shopify/ProductVariant/1');
  });

  test('el precio del Admin API llega como cadena y se preserva', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    assert.equal(p.variants[0].price, '0.00');
  });

  test('toma la moneda del rango de precios cuando la variante no la trae', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    assert.equal(p.currency, 'COP');
  });

  test('un sku null no se emite como "null"', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    assert.equal('sku' in p.variants[0], false);
    assert.equal(p.variants[2].sku, 'TEST-B-39');
  });

  test('preserva availableForSale tal cual, incluido false', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    assert.equal(p.variants[0].availableForSale, false);
    assert.equal(p.variants[2].availableForSale, true);
  });
});

describe('fromShopifyProduct — Storefront API', () => {
  test('desenvuelve `nodes`', () => {
    const p = fromShopifyProduct(RESPUESTA_STOREFRONT);
    assert.equal(p.variants.length, 2);
  });

  test('aplana MoneyV2 a precio y moneda', () => {
    const p = fromShopifyProduct(RESPUESTA_STOREFRONT);
    assert.equal(p.variants[0].price, '100000.00');
    assert.equal(p.currency, 'COP');
  });

  test('prefiere `description` en texto plano sobre `descriptionHtml`', () => {
    const p = fromShopifyProduct(RESPUESTA_STOREFRONT);
    assert.equal(p.description, 'Texto plano.');
  });

  test('recoge imágenes de producto y de variante', () => {
    const p = fromShopifyProduct(RESPUESTA_STOREFRONT);
    assert.deepEqual(p.images, [{ url: 'https://cdn.test/1.jpg', altText: 'uno' }]);
    assert.equal(p.variants[0].image.url, 'https://cdn.test/v42.jpg');
    assert.equal('image' in p.variants[1], false);
  });
});

describe('fromShopifyProduct — entrada defectuosa (§216)', () => {
  test('sin título devuelve null en lugar de un producto a medias', () => {
    for (const bad of [null, undefined, {}, { title: '' }, 'texto', 42]) {
      assert.equal(fromShopifyProduct(bad), null);
    }
  });

  test('una consulta mínima produce un producto utilizable', () => {
    const p = fromShopifyProduct({ title: 'Solo título' });
    assert.equal(p.title, 'Solo título');
    assert.equal('variants' in p, false);
    assert.equal('options' in p, false);
  });

  test('variantes y opciones basura se descartan sin romper', () => {
    const p = fromShopifyProduct({
      title: 'X',
      options: [null, { name: '' }, 'texto', { name: 'Talla', optionValues: [null, { name: '42' }] }],
      variants: { edges: [null, { node: null }, { node: { id: 'v', selectedOptions: [null, { name: 'Talla' }] } }] },
    });
    assert.deepEqual(p.options, [{ name: 'Talla', values: ['42'] }]);
    assert.deepEqual(p.variants[0].selectedOptions, []);
  });

  test('acepta `values` antiguo si no hay `optionValues`', () => {
    const p = fromShopifyProduct({ title: 'X', options: [{ name: 'Talla', values: ['41', '42'] }] });
    assert.deepEqual(p.options[0].values, ['41', '42']);
  });

  test('no explota con una conexión de forma desconocida', () => {
    assert.doesNotThrow(() => fromShopifyProduct({ title: 'X', variants: { raro: true } }));
  });
});

describe('fromSizeChartMetaobjects', () => {
  test('convierte la forma `fields` del Admin API y ordena por longitud', () => {
    const rows = fromSizeChartMetaobjects({
      edges: [
        { node: { fields: [{ key: 'label', value: '43' }, { key: 'foot_length_cm', value: '27.3' }] } },
        { node: { fields: [{ key: 'label', value: '42' }, { key: 'foot_length_cm', value: '26.6' }] } },
      ],
    });
    assert.deepEqual(rows, [
      { label: '42', footLengthCm: 26.6 },
      { label: '43', footLengthCm: 27.3 },
    ]);
  });

  test('descarta filas sin longitud utilizable en lugar de falsear un cero', () => {
    const rows = fromSizeChartMetaobjects([
      { label: '42', footLengthCm: 26.6 },
      { label: '43' },
      { label: '', footLengthCm: 27.3 },
      { label: '44', footLengthCm: 'no es un número' },
      { label: '45', footLengthCm: 0 },
      { label: '46', footLengthCm: -1 },
      null,
    ]);
    assert.deepEqual(rows, [{ label: '42', footLengthCm: 26.6 }]);
  });

  test('entrada vacía o inválida devuelve lista vacía', () => {
    for (const bad of [null, undefined, [], {}, 'texto']) {
      assert.deepEqual(fromSizeChartMetaobjects(bad), []);
    }
  });
});

describe('validateProduct', () => {
  test('la respuesta real de Shopify produce un producto válido', () => {
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    const r = validateProduct(p);
    assert.equal(r.valid, true, r.errors.join(' | '));
  });

  test('detecta que un valor declarado no lo usa ninguna variante', () => {
    // La respuesta real declara la talla 40 en Color A, pero no en B.
    const p = fromShopifyProduct(RESPUESTA_ADMIN_REAL);
    p.options[0].values.push('Placeholder Z');
    const r = validateProduct(p);
    assert.ok(r.warnings.some((w) => w.includes('Placeholder Z')));
  });

  test('detecta exceso de opciones con el límite real de Shopify', () => {
    const r = validateProduct({
      title: 'X',
      options: [{ name: 'A', values: ['1'] }, { name: 'B', values: ['1'] }, { name: 'C', values: ['1'] }, { name: 'D', values: ['1'] }],
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes(String(MAX_PRODUCT_OPTIONS))));
  });

  test('detecta variantes que no cubren todas las opciones', () => {
    const r = validateProduct({
      title: 'X',
      options: [{ name: 'Color', values: ['Negro'] }, { name: 'Talla', values: ['42'] }],
      variants: [{ id: 'v', selectedOptions: [{ name: 'Color', value: 'Negro' }] }],
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('no cubren todas las opciones')));
  });

  test('avisa de variantes sin precio y sin disponibilidad, sin invalidarlas', () => {
    const r = validateProduct({
      title: 'X',
      options: [{ name: 'Talla', values: ['42'] }],
      variants: [{ id: 'v', selectedOptions: [{ name: 'Talla', value: '42' }] }],
    });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes('sin precio')));
    assert.ok(r.warnings.some((w) => w.includes('availableForSale')));
  });

  test('avisa de moneda malformada', () => {
    const r = validateProduct({ title: 'X', currency: 'PESOS' });
    assert.ok(r.warnings.some((w) => w.includes('ISO 4217')));
  });

  test('nunca lanza', () => {
    for (const bad of [null, undefined, 'texto', 0, []]) {
      assert.doesNotThrow(() => validateProduct(bad));
    }
    assert.equal(validateProduct(null).valid, false);
  });

  test('el placeholder es válido en forma y se identifica como tal', () => {
    const p = placeholderProduct();
    const r = validateProduct(p);
    assert.equal(r.valid, true);
    assert.match(p.title, /PLACEHOLDER/);
  });
});

describe('FASE 1 — un solo modelo de datos atraviesa los cinco módulos', () => {
  test('respuesta real de Shopify → matriz, JSON-LD y talla, sin traducir dos veces', () => {
    // 1. Una sola conversión, en un solo sitio.
    const product = fromShopifyProduct(RESPUESTA_STOREFRONT, { urlBase: 'https://tienda.test' });
    assert.equal(validateProduct(product).valid, true);

    // 2. variant-matrix consume el contrato directamente.
    const matrix = createVariantMatrix(product.variants);
    assert.equal(matrix.statusFor('Talla', '42', { Color: 'Negro' }), VALUE_STATUS.AVAILABLE);
    assert.equal(matrix.statusFor('Talla', '43', { Color: 'Negro' }), VALUE_STATUS.UNAVAILABLE);

    // 3. product-jsonld consume EL MISMO objeto. Antes necesitaba otra forma.
    const jsonld = buildProductGroupJsonLd(product);
    assert.equal(jsonld.name, 'Modelo de prueba');
    assert.equal(jsonld.brand.name, 'Marca de prueba');
    assert.equal(jsonld.hasVariant[0].size, '42');
    assert.equal(jsonld.hasVariant[0].offers.priceCurrency, 'COP');
    assert.equal(jsonld.hasVariant[1].offers.availability, 'https://schema.org/OutOfStock');

    // 4. size-advisor se cruza con la matriz por el helper, no a mano.
    const chart = [
      { label: '42', footLengthCm: 26.6 },
      { label: '43', footLengthCm: 27.3 },
    ];
    const buyables = matrix.purchasableValuesFor('Talla', { Color: 'Negro' });
    assert.deepEqual(buyables, ['42']);

    const rec = recommendSize(27.3, chart); // su talla sería la 43, agotada
    const final = reconcileWithStock(rec, buyables, chart);
    assert.equal(final.label, '42');
    assert.equal(final.substituted, true);
  });

  test('un producto sin variantes recorre la cadena sin romperse', () => {
    const product = fromShopifyProduct({ title: 'Solo título' });
    assert.equal(validateProduct(product).valid, true);
    const matrix = createVariantMatrix(product.variants);
    assert.equal(matrix.variantCount, 0);
    const jsonld = buildProductGroupJsonLd(product);
    assert.equal(jsonld.name, 'Solo título');
    assert.equal('hasVariant' in jsonld, false);
    assert.deepEqual(matrix.purchasableValuesFor('Talla'), []);
  });
});
