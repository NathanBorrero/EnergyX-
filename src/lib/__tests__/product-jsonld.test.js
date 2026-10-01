import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProductGroupJsonLd,
  serializeJsonLd,
  VARIES_BY,
  AVAILABILITY,
} from '../product-jsonld.js';

/**
 * ⚠️ DATOS DE PRUEBA, NO DE NATHAN & ESTEBAN.
 * Nombres, precios y SKU existen solo para ejercitar la función.
 */
const ENTRADA_MINIMA = { title: 'Modelo de prueba' };

const ENTRADA_COMPLETA = {
  title: 'Modelo de prueba',
  description: 'Descripción de prueba.',
  url: 'https://example.test/products/modelo-de-prueba',
  images: [{ url: 'https://example.test/a.jpg' }, { url: 'https://example.test/b.jpg' }],
  brand: 'Marca de prueba',
  productGroupID: 'TEST-PARENT-1',
  currency: 'COP',
  variants: [
    {
      selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }],
      sku: 'TEST-NE-42',
      price: '100000.00',
      availableForSale: true,
    },
    {
      selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '43' }],
      sku: 'TEST-NE-43',
      price: '100000.00',
      availableForSale: false,
    },
  ],
};

describe('buildProductGroupJsonLd — forma básica', () => {
  test('emite ProductGroup con el contexto correcto', () => {
    const n = buildProductGroupJsonLd(ENTRADA_MINIMA);
    assert.equal(n['@context'], 'https://schema.org');
    assert.equal(n['@type'], 'ProductGroup');
    assert.equal(n.name, 'Modelo de prueba');
  });

  test('sin nombre no hay nada que declarar, devuelve null', () => {
    for (const bad of [null, undefined, {}, { title: '' }, { title: '   ' }]) {
      assert.equal(buildProductGroupJsonLd(bad), null);
    }
  });

  test('recorta espacios del nombre', () => {
    assert.equal(buildProductGroupJsonLd({ title: '  Modelo  ' }).name, 'Modelo');
  });
});

describe('buildProductGroupJsonLd — NO FABRICAR es la regla', () => {
  test('con solo el nombre, no aparece ninguna otra propiedad', () => {
    const n = buildProductGroupJsonLd(ENTRADA_MINIMA);
    assert.deepEqual(Object.keys(n).sort(), ['@context', '@type', 'name']);
  });

  test('sin marca no se emite brand, ni se deduce de nada', () => {
    const n = buildProductGroupJsonLd({ ...ENTRADA_COMPLETA, brand: undefined });
    assert.equal('brand' in n, false);
  });

  test('sin precio no se emite offers', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], availableForSale: true }],
    });
    assert.equal('offers' in n.hasVariant[0], false);
  });

  test('sin moneda no se emite offers, aunque haya precio', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '100000.00', availableForSale: true }],
    });
    assert.equal('offers' in n.hasVariant[0], false);
  });

  test('sin availableForSale no se declara disponibilidad', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '100000.00' }],
    });
    assert.equal('availability' in n.hasVariant[0].offers, false);
  });

  test('sin SKU ni GTIN no se emiten', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '1.00', availableForSale: true }],
    });
    assert.equal('sku' in n.hasVariant[0], false);
    assert.equal('gtin' in n.hasVariant[0], false);
  });

  test('nunca emite review ni aggregateRating por su cuenta', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.equal('review' in n, false);
    assert.equal('aggregateRating' in n, false);
  });

  test('una lista de imágenes vacía no emite image', () => {
    assert.equal('image' in buildProductGroupJsonLd({ title: 'X', images: [] }), false);
    assert.equal('image' in buildProductGroupJsonLd({ title: 'X', images: [{ url: '' }, { url: '  ' }] }), false);
  });

  test('un precio no numérico se descarta en lugar de emitirse', () => {
    for (const price of ['gratis', 'COP 100', '1,00', {}, [], true, NaN, -5]) {
      const n = buildProductGroupJsonLd({
        title: 'X',
        currency: 'COP',
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price, availableForSale: true }],
      });
      const v = n.hasVariant?.[0];
      assert.equal(v?.offers, undefined, `no debió emitir offers con ${String(price)}`);
    }
  });

  test('acepta precio numérico y precio en cadena', () => {
    for (const price of [100000, '100000', '100000.50', 0]) {
      const n = buildProductGroupJsonLd({
        title: 'X',
        currency: 'COP',
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price, availableForSale: true }],
      });
      assert.ok(n.hasVariant[0].offers, `debió emitir offers con ${String(price)}`);
    }
  });
});

describe('buildProductGroupJsonLd — variantes y variesBy', () => {
  test('mapea Talla a size y Color a color', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.equal(n.hasVariant[0].color, 'Negro');
    assert.equal(n.hasVariant[0].size, '42');
  });

  test('declara variesBy solo con los ejes que realmente varían', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.deepEqual([...n.variesBy].sort(), [VARIES_BY.COLOR, VARIES_BY.SIZE].sort());
  });

  test('un producto de una sola opción declara un solo eje', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '1.00', availableForSale: true }],
    });
    assert.deepEqual(n.variesBy, [VARIES_BY.SIZE]);
  });

  test('tolera el nombre de opción sin acento y en otra caja', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'COLOR', value: 'Negro' }, { name: 'talla', value: '42' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(n.hasVariant[0].color, 'Negro');
    assert.equal(n.hasVariant[0].size, '42');
  });

  test('una opción no reconocida no se emite ni ensucia variesBy', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [
        { selectedOptions: [{ name: 'Talla', value: '42' }, { name: 'Inventada', value: 'Valor' }], price: '1.00', availableForSale: true },
      ],
    });
    assert.deepEqual(n.variesBy, [VARIES_BY.SIZE]);
    assert.equal('Inventada' in n.hasVariant[0], false);
  });

  test('admite un mapa de opciones propio', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      optionMap: { acabado: { variesBy: VARIES_BY.PATTERN, property: 'pattern' } },
      variants: [{ selectedOptions: [{ name: 'Acabado', value: 'Liso' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(n.hasVariant[0].pattern, 'Liso');
    assert.deepEqual(n.variesBy, [VARIES_BY.PATTERN]);
  });

  test('compone el nombre de variante a partir de datos existentes', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.equal(n.hasVariant[0].name, 'Modelo de prueba — Negro / 42');
  });
});

describe('buildProductGroupJsonLd — disponibilidad', () => {
  test('traduce availableForSale a los valores de schema.org', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.equal(n.hasVariant[0].offers.availability, AVAILABILITY.IN_STOCK);
    assert.equal(n.hasVariant[1].offers.availability, AVAILABILITY.OUT_OF_STOCK);
  });

  test('una variante agotada sigue apareciendo, no se oculta', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.equal(n.hasVariant.length, 2);
  });
});

describe('buildProductGroupJsonLd — entrada defectuosa (§216)', () => {
  test('variantes basura se ignoran sin romper', () => {
    const n = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [null, undefined, 'texto', 42, {}, { options: null }],
    });
    assert.equal(n.hasVariant, undefined);
    assert.equal(n.variesBy, undefined);
  });

  test('variants que no es lista no rompe', () => {
    for (const variants of [null, undefined, 'no', 7, {}]) {
      assert.ok(buildProductGroupJsonLd({ title: 'X', variants }));
    }
  });

  test('una variante sin seña distintiva no se incluye', () => {
    const n = buildProductGroupJsonLd({ title: 'X', currency: 'COP', variants: [{ selectedOptions: [] }] });
    assert.equal(n.hasVariant, undefined);
  });

  test('nunca lanza, para cualquier entrada', () => {
    const entradas = [null, undefined, 0, '', [], {}, { title: 1 }, { title: 'X', images: 'no' }];
    for (const e of entradas) {
      assert.doesNotThrow(() => buildProductGroupJsonLd(e));
    }
  });
});

describe('serializeJsonLd — seguridad', () => {
  test('escapa "<" para que un dato no pueda cerrar la etiqueta script', () => {
    const n = buildProductGroupJsonLd({
      title: 'Modelo </script><script>alert(1)</script>',
    });
    const out = serializeJsonLd(n);
    assert.equal(out.includes('</script>'), false);
    assert.equal(out.includes('\\u003c'), true);
  });

  test('sigue siendo JSON válido tras escapar', () => {
    const n = buildProductGroupJsonLd({ title: 'Modelo <con> símbolos' });
    const parsed = JSON.parse(serializeJsonLd(n));
    assert.equal(parsed.name, 'Modelo <con> símbolos');
  });

  test('null se serializa como cadena vacía, no como "null"', () => {
    assert.equal(serializeJsonLd(null), '');
    assert.equal(serializeJsonLd(undefined), '');
  });
});

describe('integración — salida completa inspeccionable', () => {
  test('la salida con datos completos tiene exactamente la forma esperada', () => {
    const n = buildProductGroupJsonLd(ENTRADA_COMPLETA);
    assert.deepEqual(n, {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      name: 'Modelo de prueba',
      description: 'Descripción de prueba.',
      url: 'https://example.test/products/modelo-de-prueba',
      image: ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
      productGroupID: 'TEST-PARENT-1',
      brand: { '@type': 'Brand', name: 'Marca de prueba' },
      variesBy: [VARIES_BY.COLOR, VARIES_BY.SIZE],
      hasVariant: [
        {
          '@type': 'Product',
          name: 'Modelo de prueba — Negro / 42',
          color: 'Negro',
          size: '42',
          sku: 'TEST-NE-42',
          offers: {
            '@type': 'Offer',
            price: '100000.00',
            priceCurrency: 'COP',
            availability: AVAILABILITY.IN_STOCK,
            url: 'https://example.test/products/modelo-de-prueba',
          },
        },
        {
          '@type': 'Product',
          name: 'Modelo de prueba — Negro / 43',
          color: 'Negro',
          size: '43',
          sku: 'TEST-NE-43',
          offers: {
            '@type': 'Offer',
            price: '100000.00',
            priceCurrency: 'COP',
            availability: AVAILABILITY.OUT_OF_STOCK,
            url: 'https://example.test/products/modelo-de-prueba',
          },
        },
      ],
    });
  });
});
