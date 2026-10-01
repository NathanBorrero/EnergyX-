# Lógica de storefront — Nathan & Esteban

Código que **sobrevive a las decisiones pendientes**.

## Por qué existe esto antes de elegir el stack

La arquitectura (theme Liquid · Hydrogen · sitio propio) sigue sin decidirse: depende de la
dirección de arte y del concepto de 3D, que son del propietario. Ver
[`../docs/REQUIREMENTS.md`](../docs/REQUIREMENTS.md) §2.1.

Pero hay lógica que **no depende de ninguna de las dos cosas** y que es exactamente donde se gana o
se pierde la conversión en calzado. Esa se puede construir y probar ya:

| Módulo | Qué resuelve | Por qué no espera |
| --- | --- | --- |
| [`lib/variant-matrix.js`](lib/variant-matrix.js) | Qué combinaciones Color × Talla existen y cuáles se pueden comprar | Previene un fallo verificado en Shopify. Puro, sin DOM |
| [`lib/size-advisor.js`](lib/size-advisor.js) | Recomendar talla desde la medida real del pie en cm | Es la palanca de margen más barata contra el RTO. Aritmética pura |

Ambos son ESM sin dependencias y sin tocar el DOM. Funcionan igual dentro de un theme Liquid, en
React, en Vue o en vanilla. **Ninguna línea se tira cuando se elija el stack.**

## Restricciones autoimpuestas

- **Cero dependencias** (§205). Verificado: `dependencies` y `devDependencies` vacíos.
- **Funciones puras.** Sin estado global, sin DOM, sin `fetch`. Así son probables sin navegador.
- **Degradar, no explotar** (§216). Entrada `null`, malformada o incompleta devuelve un resultado
  utilizable, nunca una excepción. Hay pruebas para cada caso.
- **Ningún dato de negocio dentro del código.** Ni tallas, ni medidas, ni materiales, ni precios.
  Todo entra como argumento (§191).

## Pruebas

Runner nativo de Node, sin framework.

```bash
npm test          # 50 pruebas
npm run test:watch
```

Cobertura de los casos que importan: matriz incompleta, agotado frente a inexistente, selección
parcial, reconciliación al cambiar de color, producto de una sola opción, el máximo de 3 opciones de
Shopify, entrada defectuosa, fuera de rango, tabla sucia y desordenada, y la regresión de coma
flotante.

## Lo que ya encontraron las pruebas

**Un bug de coma flotante, real, no teórico.** Las longitudes en cm se escriben con un decimal, pero
`25.9 - 25.2` da `0.6999999999999957` mientras `26.6 - 25.9` da `0.7000000000000028`. Dos distancias
que debían empatar no empataban, así que la regla de desempate nunca se aplicaba y se recomendaba la
talla menor — justo el error que provoca devoluciones. Corregido con tolerancia, y con prueba de
regresión para que no vuelva (§196).

## Los tres estados, y por qué no son dos

`variant-matrix.js` distingue:

| Estado | Significado | Qué debe hacer la interfaz |
| --- | --- | --- |
| `available` | Existe y se puede comprar | Seleccionable |
| `unavailable` | Existe pero está agotada | Visible, marcada, con opción de aviso |
| `nonexistent` | No existe en el catálogo | Visible pero inerte, o ausente — nunca como si estuviera agotada |

Casi todos los selectores de talla mezclan los dos últimos. En footwear, donde la matriz talla ×
color casi nunca está completa, esa confusión es la razón por la que tantas páginas de producto se
sienten rotas: ofrecen una talla, el comprador la elige, y no pasa nada.

## Lo que esto NO es

No es un sistema de inventario, ni una capa sobre Shopify, ni un framework. Shopify sigue siendo la
fuente de verdad de precio, stock, carrito y checkout. Esto solo decide **qué se le muestra al
comprador y cómo**, que es nuestro trabajo.
