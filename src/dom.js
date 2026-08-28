/**
 * DOM-Bausteine.
 *
 * Die Oberflaeche wird ausschliesslich ueber diese Helfer erzeugt. Texte gehen
 * immer durch `textContent` beziehungsweise `Node#append` und damit als
 * Textknoten in den Baum -- Maskierung ist dadurch strukturell garantiert und
 * keine Frage von Disziplin an jeder einzelnen Einfuegestelle.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js.
 *
 * Benoetigt: format.js (`splitByQuery`).
 */

(function (ns) {
  'use strict';

  /**
   * Haengt Kinder an einen Knoten. Strings werden zu Textknoten, `null`,
   * `undefined` und `false` werden uebersprungen (erlaubt bedingte Kinder).
   *
   * @param {Node} parent
   * @param {Node|string|null|undefined|false|Array} children
   * @returns {Node} `parent`
   */
  function append(parent, children) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      parent.append(child);
    }
    return parent;
  }

  /**
   * Erzeugt ein Element.
   *
   * Sonderbehandelte Eigenschaften: `class` setzt die Klassenliste, `text`
   * setzt den Textinhalt, `dataset` setzt data-Attribute. Alles andere wird als
   * Attribut gesetzt; `true` ergibt ein leeres Attribut (z. B. `disabled`),
   * `false`, `null` und `undefined` lassen das Attribut weg.
   *
   * @param {string} tag
   * @param {object} [props]
   * @param {Node|string|null|undefined|false|Array} [children]
   * @returns {HTMLElement}
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);

    for (const [name, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (name === 'class') {
        node.className = String(value);
      } else if (name === 'text') {
        node.textContent = String(value);
      } else if (name === 'dataset') {
        for (const [key, entry] of Object.entries(value)) node.dataset[key] = String(entry);
      } else {
        node.setAttribute(name, value === true ? '' : String(value));
      }
    }

    return append(node, children);
  }

  /**
   * Entfernt alle Kinder eines Knotens.
   *
   * @param {Node} node
   * @returns {Node} `node`
   */
  function clear(node) {
    node.replaceChildren();
    return node;
  }

  /**
   * Baut `text` als Textknoten auf und umschliesst Suchtreffer mit <mark>.
   *
   * @param {unknown} text
   * @param {string} query
   * @returns {DocumentFragment}
   */
  function highlighted(text, query) {
    const fragment = document.createDocumentFragment();
    for (const part of ns.splitByQuery(text, query)) {
      fragment.append(part.match ? el('mark', { text: part.text }) : part.text);
    }
    return fragment;
  }

  ns.append = append;
  ns.el = el;
  ns.clear = clear;
  ns.highlighted = highlighted;
})((globalThis.EdifactExplorer ??= {}));
