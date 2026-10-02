/**
 * Emisor del evento `ne:size_selected`.
 *
 * MECANISMO VERIFICADO
 * --------------------
 * `Shopify.analytics.publish(name, data)` está disponible en el Online Store,
 * dentro de `theme.liquid` o de un theme app extension. Los nombres propios deben
 * ir con prefijo porque los eventos estándar no se pueden publicar. Un pixel se
 * suscribe con `analytics.subscribe('ne:size_selected', cb)` y recibe el payload
 * en `customData`.
 *
 * QUÉ REPRESENTA ESTE EVENTO
 * --------------------------
 * Que el navegador **dijo** que alguien eligió una talla. Nada más.
 *
 * QUÉ **NO** REPRESENTA, y no puede usarse para medirlo:
 * ventas · ingresos · stock · pedidos · entregas · devoluciones · RTO.
 *
 * La razón no es cautela: Shopify documenta que los eventos personalizados los
 * puede publicar cualquiera, **incluido un visitante desde la consola del
 * navegador**. El dato es entrada no confiable. Sirve para entender
 * comportamiento agregado, no para sostener una cifra.
 *
 * CONSENTIMIENTO
 * --------------
 * Este módulo **no decide** sobre consentimiento, y es correcto que no lo haga:
 * publicar no es recoger. Quien respeta el consentimiento es el web pixel que se
 * suscribe, porque la Customer Privacy API retiene sus callbacks hasta que el
 * consentimiento existe y entonces reproduce los eventos previos.
 *
 * Poner aquí una comprobación propia de consentimiento sería duplicar una
 * garantía que la plataforma ya da, y una segunda implementación divergiría.
 *
 * SIN DEPENDENCIAS. Sin DOM. `publish` se inyecta, así que es probable sin navegador.
 */

import { foldKey } from './shopify-semantics.js';
import { VALUE_STATUS } from './variant-matrix.js';

/** Nombre del evento. El prefijo es obligatorio: los estándar no se pueden publicar. */
export const SIZE_SELECTED_EVENT = 'ne:size_selected';

/** Longitud máxima de cualquier cadena del payload, para no emitir basura. */
const MAX_FIELD_LENGTH = 120;

/**
 * Recorta y sanea una cadena del payload.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function field(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? trimmed.slice(0, MAX_FIELD_LENGTH) : trimmed;
}

/**
 * Resuelve la función de publicación real del Online Store, si existe.
 *
 * Devuelve `null` cuando no hay ninguna: en un theme sin la librería cargada, en
 * SSR, en un test, o en un storefront headless. Nunca lanza (§216).
 *
 * @returns {((name: string, data: Record<string, unknown>) => unknown)|null}
 */
export function resolveShopifyPublish() {
  const g = /** @type {any} */ (globalThis);
  const fn = g?.Shopify?.analytics?.publish;
  return typeof fn === 'function' ? fn.bind(g.Shopify.analytics) : null;
}

/**
 * @typedef {object} SizeSelectionContext
 * @property {string} [productId]
 * @property {string} [productHandle]
 * @property {string} [variantId]      Solo si la selección resuelve una variante.
 * @property {string} [sizeOptionName] Nombre de la opción de talla. Por defecto 'Talla'.
 * @property {string} [source]         Qué parte de la interfaz lo originó.
 */

/**
 * @typedef {object} TrackerOptions
 * @property {((name: string, data: Record<string, unknown>) => unknown)|null} [publish]
 *   Inyectable. Si se omite, se resuelve del Online Store.
 * @property {() => number} [now] Inyectable para pruebas deterministas.
 * @property {string} [sizeOptionName] Por defecto 'Talla'.
 */

/**
 * Crea un rastreador de selección de talla.
 *
 * Es un objeto con estado mínimo y deliberado: recuerda la última talla publicada
 * para no repetir el mismo evento. Ese estado es local al rastreador, no global.
 *
 * Por qué hace falta deduplicar: un selector de talla dispara su callback en cada
 * interacción, y un cambio de color puede reconciliar la selección y volver a
 * fijar la misma talla. Sin deduplicar, el embudo contaría varias selecciones
 * donde hubo una.
 *
 * @param {TrackerOptions} [options]
 */
export function createSizeSelectionTracker(rawOptions = {}) {
  // Un parámetro por defecto solo cubre `undefined`, no `null`. Normalizado
  // explícitamente: §216 exige degradar, no lanzar.
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const sizeOptionName = field(options.sizeOptionName) ?? 'Talla';
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const publish =
    options.publish === undefined ? resolveShopifyPublish() : options.publish;

  /** Última talla publicada, plegada. null = ninguna todavía. */
  let lastSize = null;
  /** Último producto, para que cambiar de producto no se tome por repetición. */
  let lastProduct = null;
  let published = 0;
  let suppressed = 0;

  /**
   * Publica la selección de talla si de verdad cambió.
   *
   * @param {object} args
   * @param {string} args.size  Valor de talla elegido, tal como se muestra.
   * @param {string} [args.status]  Estado de la combinación, de `variant-matrix`.
   * @param {SizeSelectionContext} [args.context]
   * @returns {{published: boolean, reason: string, payload?: Record<string, unknown>}}
   */
  function track({ size, status, context = {} } = /** @type {any} */ ({})) {
    const value = field(size);
    if (value === undefined) {
      return { published: false, reason: 'size_missing' };
    }

    const productKey = field(context.productId) ?? field(context.productHandle) ?? '';
    const sizeKey = foldKey(value);

    if (sizeKey === lastSize && productKey === lastProduct) {
      suppressed += 1;
      return { published: false, reason: 'duplicate' };
    }

    if (typeof publish !== 'function') {
      // Se actualiza el estado igualmente: el rastreador no debe reintentar
      // indefinidamente la misma selección cuando no hay a quién publicar.
      lastSize = sizeKey;
      lastProduct = productKey;
      return { published: false, reason: 'no_publisher' };
    }

    /**
     * Payload: solo lo necesario, todo serializable, sin PII, sin precio.
     *
     * El precio se omite a propósito. Incluirlo invitaría a sumar ingresos desde
     * un evento de cliente, que es exactamente la métrica mentirosa que el
     * proyecto intenta evitar: el ingreso real vive en `orders/paid`.
     */
    /** @type {Record<string, unknown>} */
    const payload = {
      option_name: sizeOptionName,
      size: value,
      selected_at: new Date(now()).toISOString(),
    };

    // El estado real de la combinación es lo más valioso del evento: distingue
    // "eligió su talla" de "intentó una talla agotada" y de "intentó una que no
    // existe en ese color". Eso informa sobre devoluciones y sobre catálogo.
    const validStatus = Object.values(VALUE_STATUS).includes(status) ? status : undefined;
    if (validStatus !== undefined) payload.status = validStatus;

    for (const [key, source] of [
      ['product_id', context.productId],
      ['product_handle', context.productHandle],
      ['variant_id', context.variantId],
      ['source', context.source],
    ]) {
      const clean = field(source);
      if (clean !== undefined) payload[key] = clean;
    }

    let delivered = false;
    try {
      publish(SIZE_SELECTED_EVENT, payload);
      delivered = true;
    } catch {
      // Un fallo al publicar analítica nunca puede romper la compra (§215).
      delivered = false;
    }

    lastSize = sizeKey;
    lastProduct = productKey;
    if (delivered) published += 1;

    return delivered
      ? { published: true, reason: 'published', payload }
      : { published: false, reason: 'publish_failed', payload };
  }

  /** Olvida la última selección. Se llama al cambiar de página de producto. */
  function reset() {
    lastSize = null;
    lastProduct = null;
  }

  /** Contadores, para comprobar en pruebas y en depuración. */
  function stats() {
    return { published, suppressed };
  }

  return { track, reset, stats, eventName: SIZE_SELECTED_EVENT };
}
