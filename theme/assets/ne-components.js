/**
 * NATHAN & ESTEBAN — componentes del theme.
 *
 * QUÉ ES ESTE ARCHIVO
 *
 * El único JavaScript escrito a mano del theme. Todo lo demás en `theme/assets`
 * son copias generadas de los módulos de `src/lib`, que son los que tienen
 * pruebas. Este archivo no decide nada: conecta el DOM con esos módulos.
 *
 * La regla que lo gobierna: AQUÍ NO SE DUPLICA LÓGICA. Si hace falta saber si
 * una combinación existe, se pregunta a `variant-matrix`. Si hace falta una
 * talla, se pregunta a `size-advisor`. Si hace falta qué se escribe en la línea
 * del carrito, se pregunta a `cart-line`. Reimplementar cualquiera de esas cosas
 * aquí sería código sin pruebas tomando decisiones de negocio.
 *
 * TODO ES MEJORA PROGRESIVA
 *
 * La tienda se compra sin este archivo. El formulario de producto es un `<form>`
 * real que postea a la ruta de carrito de Shopify con un `<select name="id">`
 * funcional. Si este script no llega, falla o lanza, lo que queda es ese
 * formulario. Por eso cada componente se monta dentro de un `try` y solo marca
 * `data-ne-enhanced` cuando ya ha tomado el mando de verdad: ese atributo es lo
 * que oculta el control de reserva, así que si el montaje falla a medias el
 * control de reserva sigue visible.
 *
 * SIN DEPENDENCIAS. Módulos ES nativos, resueltos por el import map de
 * `theme.liquid`. Sin bundler, sin framework, sin paso de compilación.
 */

import { createVariantMatrix, VALUE_STATUS } from 'ne/variant-matrix';
import { recommendSize, reconcileWithStock, CONFIDENCE } from 'ne/size-advisor';
import { sizeFitAttributes } from 'ne/cart-line';
import { createSizeSelectionTracker } from 'ne/size-selected-event';
import { foldKey } from 'ne/semantics';

/**
 * `cod-guard` NO se importa aquí arriba a propósito.
 *
 * Solo lo usa el carrito, y un import estático lo metería en el grafo de la
 * ficha de producto: 4,3 KB comprimidos que la ficha descargaría sin usarlos.
 * Lo detectó el presupuesto de bytes al pasar de 16 554 a 20 851 contra un
 * límite de 20 000, y la respuesta correcta a un presupuesto excedido es quitar
 * peso, no subir el número.
 *
 * Se carga con `import()` dentro del componente, así que solo baja en las
 * páginas donde ese componente existe.
 */

// ---------------------------------------------------------------------------
// Cimientos
// ---------------------------------------------------------------------------

/**
 * Lee un bloque `<script type="application/json">` sin lanzar nunca.
 *
 * Un JSON malformado —un título de producto con un carácter raro que se escapó
 * mal— no puede tumbar la ficha. Devuelve `null` y el componente decide si
 * puede seguir sin ese dato.
 *
 * @param {Element|Document} root
 * @param {string} selector
 * @returns {any}
 */
function readJson(root, selector) {
  try {
    const node = root.querySelector(selector);
    if (!node || !node.textContent) return null;
    return JSON.parse(node.textContent);
  } catch (error) {
    report('json', selector, error);
    return null;
  }
}

/** Textos y rutas, de los archivos de idioma de Shopify. */
const STRINGS = readJson(document, '#ne-strings') ?? {};
const ROUTES = readJson(document, '#ne-routes') ?? {};

/**
 * Ajustes del theme que el script necesita.
 *
 * Existe porque tres ajustes estaban declarados en el esquema y ningún archivo
 * los leía: aparecían en el editor, el comerciante los podía cambiar, y no
 * pasaba nada. Un control que miente es peor que una función que falta.
 */
const CONFIG = readJson(document, '#ne-config') ?? {};

/**
 * Texto localizado con interpolación.
 *
 * Los textos llegan ya traducidos por el filtro `t` de Liquid, con los huecos
 * marcados como `[[nombre]]`. Aquí solo se rellenan. No hay plurales en este
 * lado: lo que depende de plural lo renderiza Shopify (ver `refreshCart`).
 *
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
function text(key, vars) {
  let out = typeof STRINGS[key] === 'string' ? STRINGS[key] : '';
  if (vars) {
    for (const name of Object.keys(vars)) {
      out = out.split(`[[${name}]]`).join(String(vars[name]));
    }
  }
  return out;
}

/**
 * Registra un fallo sin romper la página y sin ensuciar la consola del
 * comprador en producción.
 *
 * No se envía a ningún sitio: no hay servicio de telemetría verificado en este
 * proyecto, y fabricar uno sería inventar una integración (§191). Queda
 * disponible en `window.__ne_errors` para depurar desde el editor del theme.
 *
 * @param {string} scope
 * @param {string} detail
 * @param {unknown} error
 */
function report(scope, detail, error) {
  const entry = { scope, detail, message: error instanceof Error ? error.message : String(error) };
  const bag = (globalThis.__ne_errors = globalThis.__ne_errors ?? []);
  bag.push(entry);
  if (bag.length > 50) bag.shift();
}

/**
 * Registra un elemento personalizado de forma idempotente y aislada.
 *
 * Si la clase lanza al definirse, o el nombre ya está tomado porque el editor
 * del theme recargó el script, no se propaga: los demás componentes se
 * registran igual.
 *
 * @param {string} name
 * @param {CustomElementConstructor} ctor
 */
function define(name, ctor) {
  try {
    if (!customElements.get(name)) customElements.define(name, ctor);
  } catch (error) {
    report('define', name, error);
  }
}

/** El comprador pidió menos movimiento. Se consulta, no se asume. */
function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Normaliza una medida escrita por una persona.
 *
 * En español la coma decimal es lo normal —«26,5»— y un `parseFloat` directo
 * devolvería 26, una talla entera menos. Ese es el tipo de detalle que provoca
 * la devolución que la guía de tallas existe para evitar.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function parseMeasurement(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Nombres de opción que son una talla, en las dos lenguas del catálogo. */
const SIZE_OPTION_KEYS = new Set([foldKey('talla'), foldKey('size')]);

/**
 * @param {readonly string[]} optionNames
 * @returns {string|null}
 */
function findSizeOption(optionNames) {
  for (const name of optionNames) {
    if (SIZE_OPTION_KEYS.has(foldKey(name))) return name;
  }
  return null;
}

/** Eventos internos del theme. Prefijados para no chocar con los de Shopify. */
const EVENT = Object.freeze({
  VARIANT_CHANGE: 'ne:variant-change',
  SELECT_SIZE: 'ne:select-size',
  /**
   * «Quien tenga el estado, que lo anuncie».
   *
   * Existe porque el orden de montaje de los elementos personalizados sigue el
   * orden del DOM: el selector monta y anuncia antes de que la guía de tallas
   * esté escuchando. Pedirlo explícitamente quita esa dependencia.
   */
  REQUEST_STATE: 'ne:request-state',
  CART_UPDATED: 'ne:cart-updated',
});

// ---------------------------------------------------------------------------
// <ne-variant-picker>
// ---------------------------------------------------------------------------

/**
 * Selector de color y talla con TRES estados.
 *
 * Por qué tres y no dos, que es lo que hace casi cualquier theme:
 *
 *   · DISPONIBLE     existe y se puede comprar.
 *   · AGOTADA        existe, ahora no hay stock. Mensaje: «vuelve» o «avísame».
 *   · INEXISTENTE    esa combinación no se fabrica. Mensaje: «elige otro color».
 *
 * Confundir los dos últimos es lo que hace que una ficha de calzado se sienta
 * rota: al comprador se le ofrece la talla 44 en un color que nunca se fabricó
 * en 44, la elige, y el botón no responde.
 *
 * Verificado contra una tienda real: el campo `hasVariants` de un valor de
 * opción dice si ALGUNA variante del producto usa ese valor, no si la
 * combinación concreta existe. Un selector que se fíe de ese campo comete
 * exactamente ese error. Por eso el estado lo calcula `variant-matrix` desde las
 * variantes reales.
 *
 * Este componente no decide nada de eso: pregunta y pinta.
 */
class NeVariantPicker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('variant-picker', 'mount', error);
      // Sin `data-ne-enhanced`, el `<select>` de reserva sigue visible y el
      // producto se compra. Degradar, no romper.
    }
  }

  #mount() {
    const variants = readJson(this, 'script[data-ne-variants]');
    if (!Array.isArray(variants) || variants.length === 0) return;

    /** @type {import('ne/variant-matrix').VariantMatrix} */
    this.matrix = createVariantMatrix(variants);
    if (this.matrix.optionNames.length === 0) return;

    /** Variantes por id, para recuperar precio y referencia ya formateados. */
    this.byId = new Map(variants.map((v) => [String(v.id), v]));

    this.variantSelect = this.querySelector('[data-ne-variant-select]');
    this.message = this.querySelector('[data-ne-picker-message]');
    this.inputs = Array.from(this.querySelectorAll('[data-ne-option-input]'));
    if (this.inputs.length === 0 || !this.variantSelect) return;

    this.sizeOption = findSizeOption(this.matrix.optionNames);
    // El ajuste del theme decide si se publica el evento. `publish: null` deja
    // el rastreador funcionando y sin publicar, en lugar de no crearlo: así el
    // resto del componente no necesita comprobar si existe.
    this.tracker = createSizeSelectionTracker({
      sizeOptionName: this.sizeOption ?? undefined,
      publish: CONFIG.sizeSelectedEvent === false ? null : undefined,
    });
    this.productRoot = this.closest('[data-ne-product]') ?? document;
    this.productId = this.productRoot?.dataset?.neProductId || '';
    this.productHandle = this.productRoot?.dataset?.neProductHandle || '';

    this.selection = this.#initialSelection();

    this.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-ne-option-input')) return;
      this.#choose(input.dataset.neOptionName ?? '', input.value, 'picker');
    });

    // Petición externa de talla, la manda la guía de tallas. Así la guía no
    // necesita conocer este componente ni su marcado.
    this.productRoot.addEventListener(EVENT.SELECT_SIZE, (event) => {
      const wanted = event?.detail?.size;
      if (!this.sizeOption || typeof wanted !== 'string') return;
      this.#choose(this.sizeOption, wanted, 'size-guide');
    });

    // Contesta a quien pida el estado, montara antes o después.
    this.productRoot.addEventListener(EVENT.REQUEST_STATE, () => this.#announce('request'));

    // A partir de aquí el componente manda: se oculta el control de reserva.
    this.dataset.neEnhanced = 'true';

    this.#paint();
    this.#announce('init');
  }

  /**
   * Selección de partida.
   *
   * Orden de preferencia: lo que Liquid marcó como elegido —que respeta el
   * `?variant=` de la URL—, y si eso no resuelve nada, la primera combinación
   * comprable. Nunca se aterriza a propósito en una variante agotada.
   *
   * @returns {Record<string, string>}
   */
  #initialSelection() {
    /** @type {Record<string, string>} */
    const fromMarkup = {};
    for (const input of this.inputs) {
      if (input.checked && input.dataset.neOptionName) {
        fromMarkup[input.dataset.neOptionName] = input.value;
      }
    }
    if (this.matrix.resolve(fromMarkup)) return fromMarkup;

    const fromSelect = this.byId.get(String(this.variantSelect?.value ?? ''));
    if (fromSelect && Array.isArray(fromSelect.selectedOptions)) {
      /** @type {Record<string, string>} */
      const sel = {};
      for (const o of fromSelect.selectedOptions) sel[o.name] = o.value;
      if (this.matrix.resolve(sel)) return sel;
    }

    return this.matrix.firstAvailableSelection() ?? fromMarkup;
  }

  /**
   * Aplica una elección y reconcilia.
   *
   * Reconciliar es lo que evita el estado imposible: si el comprador tenía la 40
   * puesta y cambia a un color que no se fabrica en 40, se conserva el color
   * nuevo —lo que acaba de tocar— y se suelta la talla, en lugar de dejar la
   * página apuntando a nada. Esa regla vive en `variant-matrix`, no aquí.
   *
   * @param {string} optionName
   * @param {string} value
   * @param {string} source
   */
  #choose(optionName, value, source) {
    const canonical = this.matrix.optionNames.find((n) => foldKey(n) === foldKey(optionName));
    if (!canonical) return;

    // Se aplica siempre, incluso si la combinación resultante no existe: es
    // `reconcile` quien resuelve el conflicto, conservando lo que el comprador
    // acaba de tocar y soltando lo que lo haga imposible. Rechazar la elección
    // aquí era lo que volvía inalcanzables colores enteros.
    this.selection = this.matrix.reconcile({ ...this.selection, [canonical]: value }, canonical);
    this.#paint();
    this.#announce(source, canonical);
  }

  /** Pinta los tres estados y sincroniza el control que de verdad postea. */
  #paint() {
    for (const input of this.inputs) {
      const optionName = input.dataset.neOptionName ?? '';
      const status = this.matrix.statusFor(optionName, input.value, this.selection);
      const chip = input.closest('.ne-picker__chip');
      const selected = foldKey(this.selection[optionName] ?? '') === foldKey(input.value);

      input.checked = selected;

      // NADA SE DESHABILITA, y esto es una decisión, no un olvido.
      //
      // Todo valor que la matriz lista existe en alguna variante, así que todo
      // valor es alcanzable: elegirlo es precisamente lo que dispara la
      // reconciliación. Deshabilitar los `nonexistent` dejaba colores
      // INALCANZABLES —para llegar a Cuero había que cambiar de talla primero,
      // pero la talla elegida solo existía en Negro—. Lo encontró la prueba en
      // navegador, no la lectura del código.
      input.disabled = false;

      if (chip instanceof HTMLElement) {
        chip.dataset.neState = status;
        const note = chip.querySelector('[data-ne-chip-state]');
        if (note) note.textContent = this.#stateLabel(status, selected);
      }
    }

    for (const group of this.querySelectorAll('[data-ne-option]')) {
      const optionName = group.getAttribute('data-ne-option') ?? '';
      const chosen = group.querySelector('[data-ne-chosen]');
      if (chosen) chosen.textContent = this.selection[optionName] ?? '';
    }

    const variant = this.matrix.resolve(this.selection);
    this.#syncVariant(variant);
  }

  /**
   * Texto que lee un lector de pantalla junto al valor.
   * @param {string} status
   * @param {boolean} selected
   */
  #stateLabel(status, selected) {
    const parts = [];
    if (selected) parts.push(text('selected'));
    if (status === VALUE_STATUS.UNAVAILABLE) parts.push(text('unavailable'));
    if (status === VALUE_STATUS.NONEXISTENT) parts.push(text('nonexistent'));
    return parts.join(', ');
  }

  /**
   * Refleja la variante elegida en el resto de la ficha.
   *
   * El precio se SUSTITUYE como cadena ya formateada por Shopify. No se compone
   * moneda en el navegador: un precio compuesto en cliente acaba discrepando del
   * que cobra el checkout, y ese es el peor error posible en una tienda.
   *
   * @param {any} variant
   */
  #syncVariant(variant) {
    const button = this.productRoot.querySelector?.('[data-ne-add-to-cart]');
    const label = this.productRoot.querySelector?.('[data-ne-add-label]');
    const incomplete = this.matrix.optionNames.filter((n) => this.selection[n] === undefined);

    if (this.variantSelect) {
      if (variant) this.variantSelect.value = String(variant.id);
      this.variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (this.message) {
      if (incomplete.length > 0) {
        this.message.textContent = text('choose_option', { option: incomplete.join(' · ') });
        this.message.hidden = false;
      } else {
        this.message.hidden = true;
        this.message.textContent = '';
      }
    }

    const buyable = Boolean(variant && variant.availableForSale);
    if (button instanceof HTMLButtonElement) button.disabled = !buyable;
    if (label) {
      label.textContent = buyable
        ? text('add_to_cart')
        : variant
          ? text('sold_out')
          : text('add_to_cart');
    }

    if (variant) {
      const price = this.productRoot.querySelector?.('[data-ne-price-current]');
      if (price && typeof variant.priceFormatted === 'string') price.innerHTML = variant.priceFormatted;

      const compare = this.productRoot.querySelector?.('.ne-price__compare');
      if (compare) {
        if (typeof variant.compareAtPriceFormatted === 'string') {
          compare.innerHTML = variant.compareAtPriceFormatted;
          compare.hidden = false;
        } else {
          compare.hidden = true;
        }
      }

      const sku = this.productRoot.querySelector?.('[data-ne-sku]');
      if (sku) sku.textContent = typeof variant.sku === 'string' ? variant.sku : '';

      this.#updateUrl(variant.id);
    }

    this.currentVariant = variant ?? null;
  }

  /**
   * Mantiene `?variant=` en la URL.
   *
   * Es la convención de Shopify y lo que hace que compartir el enlace comparta
   * la variante elegida. `replaceState` y no `pushState`: cambiar de color no es
   * navegar, y llenar el historial obligaría a pulsar «atrás» una vez por cada
   * color probado.
   *
   * @param {string|number} variantId
   */
  #updateUrl(variantId) {
    try {
      const url = new URL(globalThis.location.href);
      if (url.searchParams.get('variant') === String(variantId)) return;
      url.searchParams.set('variant', String(variantId));
      globalThis.history.replaceState({}, '', url.toString());
    } catch (error) {
      report('variant-picker', 'url', error);
    }
  }

  /**
   * Avisa al resto de la página y publica el evento de analítica.
   *
   * `purchasableSizes` viaja en el detalle para que la guía de tallas pueda
   * cruzar su recomendación con el stock real sin tener que conocer este
   * componente. La lista la calcula `variant-matrix.purchasableValuesFor`, que
   * existe justamente para que no haya dos formas de calcularla.
   *
   * @param {string} source
   * @param {string} [changedOption]
   */
  #announce(source, changedOption) {
    const sizeValue = this.sizeOption ? this.selection[this.sizeOption] : undefined;
    const purchasableSizes = this.sizeOption
      ? this.matrix.purchasableValuesFor(this.sizeOption, this.#selectionWithout(this.sizeOption))
      : [];

    this.dispatchEvent(
      new CustomEvent(EVENT.VARIANT_CHANGE, {
        bubbles: true,
        detail: {
          selection: { ...this.selection },
          variant: this.currentVariant ?? null,
          sizeOption: this.sizeOption,
          size: sizeValue ?? null,
          purchasableSizes,
          source,
        },
      }),
    );

    // Analítica de selección de talla. Shopify no emite ningún evento estándar
    // de selección de variante —se verificó la lista completa—, así que este
    // evento personalizado es el único que cubre el hueco. Nunca es fuente de
    // ventas ni de stock: eso vive en los webhooks de pedido.
    if (this.sizeOption && changedOption === this.sizeOption && typeof sizeValue === 'string') {
      this.tracker.track({
        size: sizeValue,
        status: this.matrix.statusFor(this.sizeOption, sizeValue, this.#selectionWithout(this.sizeOption)),
        context: {
          productId: this.productId || undefined,
          productHandle: this.productHandle || undefined,
          variantId: this.currentVariant ? String(this.currentVariant.id) : undefined,
          source,
        },
      });
    }
  }

  /**
   * La selección sin una opción, para preguntar por el estado de sus valores sin
   * que el valor ya elegido filtre el resultado.
   * @param {string} optionName
   */
  #selectionWithout(optionName) {
    const copy = { ...this.selection };
    delete copy[optionName];
    return copy;
  }
}

define('ne-variant-picker', NeVariantPicker);

// ---------------------------------------------------------------------------
// <ne-size-guide>
// ---------------------------------------------------------------------------

/**
 * Guía de tallas con recomendador.
 *
 * POR QUÉ ES LA PIEZA MÁS RENTABLE DE LA FICHA
 *
 * En calzado la talla equivocada es la primera causa de devolución, y con pago
 * contra entrega el comprador no ha pagado nada: rechazar el paquete no le
 * cuesta, y a la marca le cuesta el envío de ida y el de vuelta. Preguntar «¿qué
 * talla usas?» es pedirle que adivine. Preguntar «¿cuánto mide tu pie?» es un
 * dato objetivo que se puede cruzar con la tabla del modelo.
 *
 * QUÉ NO HACE
 *
 * No inventa equivalencias. Si el producto no tiene metaobject de tabla de
 * tallas con medidas reales, no hay recomendador: una tabla inventada causaría
 * exactamente las devoluciones que esto evita.
 *
 * No recomienda una talla agotada. La recomendación se cruza con el stock real
 * antes de mostrarse —`reconcileWithStock`—, porque ilusionar al comprador con
 * una talla que no puede comprar es peor que no recomendar nada.
 *
 * DÓNDE ACABA EL DATO
 *
 * En las atribuciones de la línea de carrito, que PERSISTEN AL PEDIDO. Eso
 * convierte «qué talla recomendamos» y «qué talla eligió» en un dato cruzable
 * después con si el pedido se entregó o se devolvió. Un evento de analítica de
 * cliente no permite ese cruce y además es manipulable.
 */
class NeSizeGuide extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('size-guide', 'mount', error);
    }
  }

  #mount() {
    this.chart = readJson(this, 'script[data-ne-size-chart]');
    this.productRoot = this.closest('[data-ne-product]') ?? document;
    this.recommendOutput = this.querySelector('[data-ne-recommendation]');
    this.footInput = this.querySelector('[data-ne-foot-input]');
    this.recommendButton = this.querySelector('[data-ne-recommend]');

    /** Última recomendación válida, para poder cruzarla con la talla elegida. */
    this.recommended = null;
    this.footLengthCm = null;
    this.opened = false;
    /** Tallas comprables ahora mismo, según el selector. */
    this.purchasableSizes = [];
    /** Talla elegida en el selector. La anuncia el selector, no se adivina. */
    this.chosenSize = null;

    // La apertura de la guía es en sí un dato: distingue «eligió a ciegas» de
    // «consultó y luego eligió». Se registra en la línea, no en analítica.
    const details = this.querySelector('details');
    details?.addEventListener('toggle', () => {
      if (details.open) {
        this.opened = true;
        this.#writeAttributes();
      }
    });

    this.productRoot.addEventListener(EVENT.VARIANT_CHANGE, (event) => {
      const detail = event?.detail;
      if (!detail) return;
      this.purchasableSizes = Array.isArray(detail.purchasableSizes) ? detail.purchasableSizes : [];
      this.chosenSize = typeof detail.size === 'string' ? detail.size : null;
      this.#writeAttributes();
    });

    if (this.dataset.neRecommender !== 'on' || !Array.isArray(this.chart) || this.chart.length === 0) {
      // Sin tabla real no hay recomendador. La tabla y la nota de horma, si
      // existen, se siguen mostrando: las renderiza Liquid.
      return;
    }

    this.recommendButton?.addEventListener('click', () => this.#recommend());
    this.footInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#recommend();
      }
    });

    this.dataset.neEnhanced = 'true';

    // Pide el estado ahora que ya está escuchando. Sin esto, la lista de tallas
    // comprables se quedaba vacía y el recomendador respondía siempre que la
    // talla estaba agotada.
    this.productRoot.dispatchEvent(new CustomEvent(EVENT.REQUEST_STATE, { bubbles: true }));
  }

  #recommend() {
    const cm = parseMeasurement(this.footInput?.value ?? '');
    if (cm === null) {
      this.#say(text('invalid_measurement'));
      return;
    }

    // La aritmética la hace `size-advisor`, que es el módulo con pruebas —y con
    // una regresión concreta: el desempate entre dos tallas fallaba por el
    // redondeo binario y recomendaba la MENOR, que es justo el error que
    // provoca la devolución.
    const raw = recommendSize(cm, this.chart);
    const final = reconcileWithStock(raw, this.purchasableSizes, this.chart);

    this.footLengthCm = cm;
    this.recommended = final.label;

    this.#say(this.#messageFor(final, raw));
    this.#writeAttributes();

    // Si la talla recomendada se puede comprar, se ofrece elegirla de un toque.
    // La petición va por evento: esta clase no conoce el selector.
    if (final.label && this.purchasableSizes.some((s) => foldKey(s) === foldKey(final.label))) {
      this.#offerToApply(final.label);
    }
  }

  /**
   * Traduce el resultado a una frase.
   *
   * El módulo devuelve una `reason` estable precisamente para que la redacción
   * viva en los archivos de idioma y no en el código.
   *
   * @param {any} final
   * @param {any} raw
   * @returns {string}
   */
  #messageFor(final, raw) {
    if (final.substituted && final.label) {
      return text('recommended_substituted', { size: final.label, original: raw.label ?? '' });
    }
    if (final.reason === 'recommended_out_of_stock') return text('recommended_out_of_stock');
    if (final.confidence === CONFIDENCE.NO_DATA) return text('no_data');
    if (final.confidence === CONFIDENCE.OUT_OF_RANGE || !final.label) return text('out_of_range');
    if (final.confidence === CONFIDENCE.ROUNDED) {
      return text('recommended_rounded', { size: final.label });
    }
    return text('recommended', { size: final.label });
  }

  /** @param {string} message */
  #say(message) {
    if (!this.recommendOutput) return;
    this.recommendOutput.textContent = message;
    this.recommendOutput.hidden = message === '';
  }

  /** @param {string} size */
  #offerToApply(size) {
    let apply = this.querySelector('[data-ne-apply-size]');
    if (!apply) {
      apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'ne-button ne-button--quiet ne-sizeguide__apply';
      apply.setAttribute('data-ne-apply-size', '');
      this.recommendOutput?.insertAdjacentElement('afterend', apply);
      apply.addEventListener('click', () => {
        this.productRoot.dispatchEvent(
          new CustomEvent(EVENT.SELECT_SIZE, {
            bubbles: true,
            detail: { size: apply.dataset.neApplySize },
          }),
        );
      });
    }
    apply.dataset.neApplySize = size;
    apply.textContent = text('choose_size', { size });
    apply.hidden = false;
  }

  /**
   * Escribe las atribuciones en el formulario de compra.
   *
   * Los campos nacen `disabled` en Liquid, y un campo deshabilitado no se
   * envía: ese es el mecanismo por el que lo que no existe no viaja. Aquí se
   * habilitan solo los que `sizeFitAttributes` devuelve de verdad.
   */
  #writeAttributes() {
    const attrs = sizeFitAttributes({
      chosenSize: this.chosenSize ?? undefined,
      recommendedSize: this.recommended ?? undefined,
      footLengthCm: this.footLengthCm ?? undefined,
      usedSizeGuide: this.opened ? true : undefined,
    });

    const container = this.productRoot.querySelector?.('[data-ne-product-form]');
    const form = container instanceof HTMLFormElement ? container : container?.querySelector('form');
    if (!form) return;

    for (const field of form.querySelectorAll('[data-ne-attr]')) {
      const key = field.getAttribute('data-ne-attr') ?? '';
      const value = attrs[key];
      if (typeof value === 'string' && value !== '') {
        field.value = value;
        field.disabled = false;
      } else {
        field.value = '';
        field.disabled = true;
      }
    }

    // Una clave que el módulo produce y el formulario no tiene es un desajuste
    // de marcado, no un dato que haya que descartar en silencio.
    for (const key of Object.keys(attrs)) {
      if (!form.querySelector(`[data-ne-attr="${key}"]`)) {
        report('size-guide', `atribución sin campo en el formulario: ${key}`, new Error('marcado incompleto'));
      }
    }
  }
}

define('ne-size-guide', NeSizeGuide);

// ---------------------------------------------------------------------------
// <ne-product-gallery>
// ---------------------------------------------------------------------------

/**
 * Galería con 3D PROGRESIVO Y OPCIONAL.
 *
 * El principio, que es una decisión de dirección de arte y no una limitación
 * técnica: LA FOTOGRAFÍA ES LA EXPERIENCIA COMPLETA. El 3D añade, no sostiene.
 * Si no hay modelo, si el navegador no tiene WebGL, si el dispositivo es débil,
 * si el comprador pidió menos movimiento o si el modelo falla al cargar, lo que
 * queda no es un hueco ni un mensaje de error: es la ficha entera funcionando.
 *
 * Lo que NO hay aquí: ninguna demo de 3D fabricada para aparentar avance. Si el
 * producto no trae un modelo real subido a Shopify, no se muestra ningún control
 * de 3D. El sistema está listo para aceptar un `.glb` real; no finge tenerlo.
 *
 * El visor es el nativo de Shopify: el filtro `model_viewer_tag` emite un
 * `<model-viewer>` y la librería la carga Shopify de forma diferida, así que no
 * compite con el primer paint ni añade una dependencia a este theme.
 *
 * LAS CAPACIDADES SE DETECTAN, NO SE SUPONEN. Cada puerta de abajo comprueba
 * algo real en el navegador que está delante.
 */
class NeProductGallery extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('gallery', 'mount', error);
    }
  }

  #mount() {
    this.trigger = this.querySelector('[data-ne-model-trigger]');
    this.arTrigger = this.querySelector('[data-ne-ar-trigger]');
    this.modelSlot = this.querySelector('[data-ne-model-slot]');
    this.fallback = this.querySelector('[data-ne-model-fallback]');
    this.modelError = this.querySelector('[data-ne-model-error]');

    // Sin modelo real no hay nada que ofrecer. Liquid ya no habría pintado los
    // controles, pero se comprueba igual: el componente no asume su marcado.
    if (!this.modelSlot || !this.trigger) return;

    // `data-ne-model-mode`, sin dígito tras guion: `data-ne-3d-mode` se leería
    // como `dataset['ne-3dMode']` y `dataset.ne3dMode` sería undefined, con lo
    // que el ajuste del theme se ignoraría en silencio. Verificado en Chromium.
    const mode = this.dataset.neModelMode ?? 'on_demand';
    if (mode === 'off' || !this.#canRender3d()) {
      this.trigger.hidden = true;
      this.arTrigger?.setAttribute('hidden', '');
      return;
    }

    this.viewer = this.modelSlot.querySelector('model-viewer');
    this.isOpen = false;

    this.trigger.addEventListener('click', () => this.#toggle());
    this.trigger.hidden = false;
    this.dataset.neEnhanced = 'true';

    // `eager` solo se honra cuando nada aconseja lo contrario. En un móvil
    // modesto o con menos movimiento pedido, se degrada a bajo demanda en
    // silencio: es lo que hace que la ficha siga siendo rápida donde más
    // importa.
    if (mode === 'eager' && !prefersReducedMotion() && !this.#deviceIsModest()) {
      this.#toggle();
    }
  }

  /**
   * ¿Puede este navegador dibujar el modelo?
   *
   * Dos condiciones duras: que exista WebGL —sin él `<model-viewer>` no pinta
   * nada— y que el ahorro de datos no esté activo, porque un modelo 3D es el
   * recurso más pesado de la página y respetar esa preferencia es lo correcto.
   */
  #canRender3d() {
    try {
      if (globalThis.navigator?.connection?.saveData === true) return false;
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  /**
   * Dispositivo modesto: pocos núcleos, poca memoria o red lenta.
   *
   * Las tres señales son opcionales en el estándar y no están en todos los
   * navegadores. Cuando no hay dato no se penaliza al dispositivo: solo se
   * degrada ante una señal explícita.
   */
  #deviceIsModest() {
    const nav = globalThis.navigator ?? {};
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
    const effective = nav.connection?.effectiveType;
    if (typeof effective === 'string' && /^(slow-2g|2g|3g)$/.test(effective)) return true;
    return false;
  }

  #toggle() {
    this.isOpen = !this.isOpen;
    this.modelSlot.hidden = !this.isOpen;
    if (this.fallback) this.fallback.hidden = this.isOpen;
    this.trigger.setAttribute('aria-expanded', String(this.isOpen));
    this.trigger.textContent = this.isOpen ? text('hide_3d') : text('view_3d');

    if (this.isOpen) this.#reveal();
  }

  /**
   * Pide al visor que cargue y vigila que lo consiga.
   *
   * El visor se emite con `reveal: 'interaction'`, así que no descarga el modelo
   * hasta que se le pide: `dismissPoster()` es esa petición.
   *
   * El temporizador existe porque un fallo de red en medio de la descarga de un
   * `.glb` puede no emitir ningún evento. Sin él, el comprador se quedaría
   * mirando un contenedor vacío. Al vencer, se vuelve a la fotografía y se dice
   * lo que pasó, en lugar de dejar un hueco silencioso.
   */
  #reveal() {
    const viewer = this.viewer;
    if (!viewer) {
      this.#fail();
      return;
    }

    this.trigger.dataset.neLoading = 'true';
    this.trigger.textContent = text('view_3d_loading');
    const settle = (ok) => {
      clearTimeout(timer);
      delete this.trigger.dataset.neLoading;
      this.trigger.textContent = text('hide_3d');
      if (!ok) this.#fail();
      else this.#offerAr(viewer);
    };

    const timer = setTimeout(() => settle(false), 12000);
    viewer.addEventListener('load', () => settle(true), { once: true });
    viewer.addEventListener('error', () => settle(false), { once: true });

    try {
      viewer.dismissPoster?.();
    } catch (error) {
      report('gallery', 'dismissPoster', error);
    }
  }

  /**
   * Realidad aumentada, solo si el visor dice que puede.
   *
   * `canActivateAR` es una propiedad del propio `<model-viewer>`: es él quien
   * sabe si el dispositivo y el formato lo permiten. No se deduce del user agent
   * ni se muestra el botón «por si acaso», porque un botón de AR que no hace
   * nada es peor que no tenerlo.
   *
   * @param {any} viewer
   */
  #offerAr(viewer) {
    if (!this.arTrigger) return;
    if (viewer.canActivateAR !== true) return;
    this.arTrigger.hidden = false;
    this.arTrigger.addEventListener(
      'click',
      () => {
        try {
          viewer.activateAR?.();
        } catch (error) {
          report('gallery', 'activateAR', error);
        }
      },
      { once: false },
    );
  }

  /** Vuelve a la fotografía y lo dice. */
  #fail() {
    this.isOpen = false;
    this.modelSlot.hidden = true;
    if (this.fallback) this.fallback.hidden = false;
    if (this.modelError) this.modelError.hidden = false;
    this.trigger.hidden = true;
    this.arTrigger?.setAttribute('hidden', '');
  }
}

define('ne-product-gallery', NeProductGallery);

// ---------------------------------------------------------------------------
// <ne-cart>
// ---------------------------------------------------------------------------

/**
 * Carrito: cambiar cantidad y quitar líneas sin recargar.
 *
 * NO ES EL MECANISMO. El mecanismo es el `<form>` que postea a la ruta de
 * carrito con sus `updates[]`, y el enlace nativo de quitar. Los dos funcionan
 * con este archivo ausente. Esto evita la recarga, que en un carrito con
 * fotografías se nota.
 *
 * TODO LO COMERCIAL LO CALCULA SHOPIFY. No se suma ningún total aquí: se pide a
 * la API de carrito que repinte las secciones y se sustituye el HTML que
 * devuelve. Un subtotal calculado en el navegador acaba discrepando del que
 * cobra el checkout —impuestos, descuentos automáticos, envío— y ese es el peor
 * error posible en una tienda.
 *
 * La línea se identifica por su `key`, no por su posición. `key` es estable
 * aunque las líneas se reordenen; un índice no.
 */
class NeCart extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('cart', 'mount', error);
      // Sin mejora, el formulario nativo sigue siendo el carrito.
    }
  }

  #mount() {
    if (!ROUTES.cart_change) return; // Sin ruta de Shopify no se inventa una.

    this.status = this.querySelector('[data-ne-cart-status]');
    this.failure = this.querySelector('[data-ne-cart-error]');
    this.busy = false;

    // Delegación: una sola escucha para todas las líneas, así no hay que
    // reenganchar nada cuando el HTML de la sección se sustituye.
    this.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-ne-line-qty')) return;
      const key = input.closest('[data-ne-line-key]')?.dataset?.neLineKey;
      const quantity = Number.parseInt(input.value, 10);
      if (!key || !Number.isFinite(quantity) || quantity < 0) return;
      event.preventDefault();
      this.#change(key, quantity);
    });

    this.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('[data-ne-line-remove]') : null;
      if (!link) return;
      const key = link.closest('[data-ne-line-key]')?.dataset?.neLineKey;
      if (!key) return;
      // Quitar es poner la cantidad a cero: la misma operación de la API, sin
      // recargar. Si algo falla, el `href` nativo sigue ahí para reintentarlo.
      event.preventDefault();
      this.#change(key, 0);
    });

    this.dataset.neEnhanced = 'true';
  }

  /**
   * @param {string} key   Identificador estable de la línea.
   * @param {number} quantity 0 quita la línea.
   */
  async #change(key, quantity) {
    if (this.busy) return;
    this.busy = true;
    this.dataset.neBusy = 'true';
    if (this.status) this.status.textContent = text('cart_updating');
    if (this.failure) this.failure.hidden = true;

    // Se repintan las dos secciones que el cambio afecta: el carrito y la
    // cabecera, que lleva el contador. Los ids los declara el marcado; no se
    // adivinan, porque una sección dentro de un grupo no se llama como su
    // archivo.
    const sections = [
      this.dataset.neSectionId,
      document.querySelector('[data-ne-header]')?.dataset?.neSectionId,
    ].filter(Boolean);

    try {
      const response = await fetch(ROUTES.cart_change, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: key,
          quantity,
          sections,
          sections_url: globalThis.location.pathname,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (payload && typeof payload.description === 'string' && payload.description) ||
          (payload && typeof payload.message === 'string' && payload.message) ||
          text('error_cart_update');
        throw new Error(message);
      }

      if (this.status) this.status.textContent = text('cart_updated');
      document.dispatchEvent(new CustomEvent(EVENT.CART_UPDATED, { detail: { payload } }));

      // Sustituir las secciones destruye y recrea este elemento, así que esto
      // va al final: después ya no hay `this` que mantener.
      applyRenderedSections(payload?.sections);
    } catch (caught) {
      report('cart', 'change', caught);
      if (this.failure) {
        const offline = caught instanceof TypeError || globalThis.navigator?.onLine === false;
        this.failure.textContent = offline
          ? text('error_network')
          : caught instanceof Error && caught.message
            ? caught.message
            : text('error_cart_update');
        this.failure.hidden = false;
      }
      if (this.status) this.status.textContent = '';
    } finally {
      this.busy = false;
      delete this.dataset.neBusy;
    }
  }
}

define('ne-cart', NeCart);

// ---------------------------------------------------------------------------
// <ne-cod-coverage>
// ---------------------------------------------------------------------------

/**
 * Cobertura de pago contra entrega, preguntada en el carrito.
 *
 * EN EL CHECKOUT SERÍA EL SITIO NATURAL, Y NO SE PUEDE: las extensiones de UI de
 * checkout en información, envío y pago son solo de Shopify Plus. El carrito es
 * el último punto del storefront antes de salir hacia el checkout de Shopify.
 *
 * Por qué importa: con contra entrega el comprador no paga nada por adelantado,
 * así que rechazar el paquete no le cuesta y el flete de ida y vuelta lo paga la
 * marca. Saber antes de pedir si hay cobertura evita el pedido que iba a volver.
 *
 * La comparación la hace `cod-guard`, que tiene pruebas y además arregló tres
 * defectos reales de normalización: «Bogotá D.C.», «bogota dc» y la ñ que una
 * descomposición Unicode se comía. Aquí no se normaliza nada a mano.
 *
 * NO INVENTA COBERTURA. Con la lista vacía el módulo devuelve `unknown` y esto
 * no dice nada: afirmar que no entregamos en una ciudad sin saberlo sería un
 * dato inventado.
 */
class NeCodCoverage extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    this.dataset.neMounted = 'true';
    this.#mount().catch((error) => report('cod', 'mount', error));
  }

  async #mount() {
    this.placeInput = this.querySelector('[data-ne-cod-input]');
    this.result = this.querySelector('[data-ne-cod-result]');
    const button = this.querySelector('[data-ne-cod-check]');
    if (!this.placeInput || !this.result || !button) return;

    // El módulo se trae solo aquí: en las páginas sin este componente no baja.
    this.cod = await import('ne/cod-guard');

    this.coverage = Array.isArray(CONFIG.codCoverage) ? CONFIG.codCoverage : [];

    button.addEventListener('click', () => this.#check());
    this.placeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#check();
      }
    });

    this.dataset.neEnhanced = 'true';
  }

  #check() {
    if (!this.cod) return; // El módulo aún no ha llegado.
    const { checkCodCoverage, FIELD_STATUS } = this.cod;
    const place = (this.placeInput.value ?? '').trim();
    const outcome = checkCodCoverage(place, this.coverage);

    let message = '';
    if (outcome.status === FIELD_STATUS.OK) {
      message = text('cod_covered', { place });
    } else if (outcome.status === FIELD_STATUS.NOT_COVERED) {
      message = text('cod_not_covered', { place });
    } else if (outcome.status === FIELD_STATUS.MISSING) {
      message = text('cod_missing');
    }
    // `unknown` —sin lista utilizable— no dice nada. Es la única respuesta
    // honesta cuando no hay dato.

    this.result.textContent = message;
    this.result.hidden = message === '';
  }
}

define('ne-cod-coverage', NeCodCoverage);

// ---------------------------------------------------------------------------
// Formulario de compra
// ---------------------------------------------------------------------------

/**
 * Añadir al carrito sin recargar.
 *
 * NO ES EL MECANISMO, ES LA RESPUESTA. El mecanismo es el `<form>` que postea a
 * la ruta de carrito de Shopify y que funciona con este archivo ausente. Esto
 * solo evita el salto de página, que en una ficha con fotografía grande se nota
 * mucho.
 *
 * El recuento del carrito lo RENDERIZA SHOPIFY. La API de carrito acepta un
 * parámetro `sections` y devuelve las secciones ya renderizadas: así el plural
 * de «1 artículo / 2 artículos» lo resuelve el filtro `t` de Liquid con las
 * reglas del idioma, en lugar de que este archivo intente pluralizar en varios
 * idiomas, que es un error esperando a ocurrir.
 *
 * Si algo falla, se deja que el formulario se envíe de forma normal. Perder el
 * salto de página es un precio aceptable; perder la venta no.
 */
function enhanceBuyForms(root = document) {
  for (const container of root.querySelectorAll('[data-ne-product-form]')) {
    // El gancho está en el contenedor porque la etiqueta `form` de Liquid no
    // acepta atributos con guiones. El que postea es el `<form>` de dentro.
    const form = container instanceof HTMLFormElement ? container : container.querySelector('form');
    if (!form) continue;
    if (form.dataset.neEnhanced === 'true') continue;
    if (!ROUTES.cart_add) continue; // Sin ruta de Shopify no se inventa una.
    form.dataset.neEnhanced = 'true';

    form.addEventListener('submit', async (event) => {
      const button = form.querySelector('[data-ne-add-to-cart]');
      const label = form.querySelector('[data-ne-add-label]');
      const error = form.querySelector('[data-ne-buy-error]');
      const status = form.querySelector('[data-ne-buy-status]');

      // El `id` de variante tiene que existir antes de interceptar. Si no está,
      // se deja pasar el envío nativo para que Shopify dé su propio error en
      // lugar de que este archivo invente uno.
      const data = new FormData(form);
      if (!data.get('id')) return;

      event.preventDefault();

      const previous = label?.textContent ?? '';
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
        button.dataset.neLoading = 'true';
      }
      if (label) label.textContent = text('adding');
      if (error) error.hidden = true;

      // Secciones a repintar: la cabecera, que es donde vive el contador. El id
      // lo declara la propia sección en el marcado; no se adivina, porque una
      // sección dentro de un grupo no se llama como su archivo.
      const headerId = document.querySelector('[data-ne-header]')?.dataset?.neSectionId;
      if (headerId) {
        data.set('sections', headerId);
        data.set('sections_url', globalThis.location.pathname);
      }

      try {
        const response = await fetch(ROUTES.cart_add, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: data,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          // Shopify explica el motivo —sin stock, cantidad no disponible— y su
          // mensaje es más útil y más cierto que uno genérico.
          const message =
            (payload && typeof payload.description === 'string' && payload.description) ||
            (payload && typeof payload.message === 'string' && payload.message) ||
            text('error_add_to_cart');
          throw new Error(message);
        }

        applyRenderedSections(payload?.sections);
        if (label) label.textContent = text('added');
        if (status) status.textContent = text('added');
        document.dispatchEvent(new CustomEvent(EVENT.CART_UPDATED, { detail: { payload } }));

        setTimeout(() => {
          if (label) label.textContent = previous || text('add_to_cart');
        }, 2000);
      } catch (caught) {
        report('buy', 'add', caught);
        if (error) {
          // `fetch` lanza TypeError cuando no hubo respuesta: eso es la red, no
          // la tienda, y el mensaje útil es otro. Un error con mensaje viene de
          // Shopify y se muestra tal cual, porque explica el motivo real.
          const offline = caught instanceof TypeError || globalThis.navigator?.onLine === false;
          error.textContent = offline
            ? text('error_network')
            : caught instanceof Error && caught.message
              ? caught.message
              : text('error_generic');
          error.hidden = false;
        }
        if (label) label.textContent = previous || text('add_to_cart');
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          delete button.dataset.neLoading;
        }
      }
    });
  }
}

/**
 * Sustituye las secciones que devuelve la API de carrito.
 *
 * La respuesta trae el HTML completo de la sección; se extrae su contenido y se
 * reemplaza el de la sección viva en la página. El `id` del nodo de sección es
 * `shopify-section-<id>`, que es como Shopify envuelve toda sección.
 *
 * @param {Record<string, string>|undefined|null} sections
 */
function applyRenderedSections(sections) {
  if (!sections || typeof sections !== 'object') return;
  for (const [id, html] of Object.entries(sections)) {
    if (typeof html !== 'string') continue;
    const target = document.getElementById(`shopify-section-${id}`);
    if (!target) continue;
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const incoming = parsed.getElementById(`shopify-section-${id}`) ?? parsed.body.firstElementChild;
      if (incoming) target.innerHTML = incoming.innerHTML;
    } catch (error) {
      report('sections', id, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Los elementos personalizados se montan solos cuando el parser los encuentra.
 * Lo que no es un elemento personalizado —el formulario de compra— se conecta
 * aquí, y se vuelve a conectar cuando el editor del theme reemplaza una sección,
 * porque ese reemplazo monta marcado nuevo sin recargar la página.
 */
enhanceBuyForms();

document.addEventListener('shopify:section:load', (event) => {
  const target = event?.target;
  if (target instanceof Element) enhanceBuyForms(target);
});
