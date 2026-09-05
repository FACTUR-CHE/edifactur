/**
 * DOM-Attrappe fuer die Tests.
 *
 * Stellt genau die DOM-Oberflaeche nach, die dom.js, render.js und app.js
 * benutzen, und keine mehr. Kein jsdom, keine Laufzeitabhaengigkeit, kein
 * Build-Schritt -- die Attrappe gehoert zum Testbestand.
 *
 * Sie ist mit Absicht **streng**: `append(null)` wirft, statt den Wert
 * stillschweigend zu uebergehen. Genau diese Nachsicht wuerde einen Spread
 * ueber ein DocumentFragment verdecken, und solche Fehler zeigen sich sonst
 * erst im Browser.
 */

/** Wandelt `data-copy-label` in `copyLabel`, wie es `dataset` tut. */
const camelCase = (name) => name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());

/**
 * Ein Knoten. `children` haelt Knoten und Zeichenketten in ihrer Reihenfolge,
 * `parent` traegt die Kette nach oben -- `closest` und `contains` brauchen sie.
 */
export class StubNode {
  constructor(tag, id = '') {
    this.tag = tag;
    this.id = id;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.children = [];
    this.listeners = {};
    this.parent = null;
    // Formularfelder: app.js liest und schreibt beides unbesehen.
    this.value = '';
    this.hidden = false;
    this.placeholder = '';
  }

  /**
   * Die Optionen eines Auswahlfeldes.
   *
   * app.js liest `options[0]`, um die "Alle ..."-Option ueber das Neufuellen
   * zu retten -- ein Test muss sie deshalb wie index.html anlegen.
   */
  get options() {
    return this.children.filter((child) => child instanceof StubNode && child.tag === 'option');
  }

  get tagName() {
    return this.tag.toUpperCase();
  }

  get isContentEditable() {
    return false;
  }

  append(...children) {
    for (const child of children) {
      if (child === null || child === undefined) {
        throw new TypeError(`append(${String(child)}) auf <${this.tag}>`);
      }

      if (child instanceof StubFragment) {
        // Wie im Browser: das Fragment gibt seine Kinder ab und bleibt leer.
        for (const entry of child.children) if (entry instanceof StubNode) entry.parent = this;
        this.children.push(...child.children);
        child.children = [];
        continue;
      }

      if (child instanceof StubNode) {
        child.parent = this;
        this.children.push(child);
        continue;
      }

      if (typeof child !== 'string' && typeof child !== 'number') {
        throw new TypeError(`append(${typeof child}) auf <${this.tag}>`);
      }

      this.children.push(String(child));
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) if (child instanceof StubNode) child.parent = null;
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  /** Loest ein Ereignis aus, ohne Bubbling -- die Tests zielen direkt. */
  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  select() {}

  remove() {
    const siblings = this.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  contains(node) {
    for (let entry = node; entry; entry = entry.parent) if (entry === this) return true;
    return false;
  }

  /**
   * Deckt die Selektorformen ab, die die Anwendung benutzt: `[data-x]`,
   * `[attr="wert"]` und `[data-x="wert"]`. Alles andere waere ein
   * CSS-Parser, den die Attrappe nicht sein soll.
   */
  matches(selector) {
    const flag = /^\[([\w-]+)\]$/.exec(selector);
    if (flag) {
      const [, name] = flag;
      return name.startsWith('data-')
        ? this.dataset[camelCase(name.slice(5))] !== undefined
        : this.attributes[name] !== undefined;
    }

    const pair = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
    if (pair) {
      const [, name, value] = pair;
      return name.startsWith('data-')
        ? this.dataset[camelCase(name.slice(5))] === value
        : this.attributes[name] === value;
    }

    throw new Error(`Selektor von der Attrappe nicht abgedeckt: ${selector}`);
  }

  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.matches(selector)) return node;
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return nodesOf(this).filter((node) => node !== this && node.matches(selector));
  }

  set textContent(value) {
    this.children = [String(value)];
  }

  get textContent() {
    return this.children
      .map((child) => (typeof child === 'string' ? child : child.textContent))
      .join('');
  }
}

export class StubFragment extends StubNode {
  constructor() {
    super('#fragment');
  }
}

/** @returns {StubNode[]} Alle Knoten des Baums, den Wurzelknoten eingeschlossen. */
export function nodesOf(root) {
  const found = [root];
  for (const child of root.children) {
    if (typeof child !== 'string') found.push(...nodesOf(child));
  }
  return found;
}

/** @returns {StubNode[]} Alle Knoten mit dieser Klasse. */
export const byClass = (root, name) =>
  nodesOf(root).filter((node) => node.className.split(' ').includes(name));

/**
 * Baut ein Dokument und setzt es als `globalThis.document`.
 *
 * `getElementById` legt Knoten bei Bedarf an: welche Kennungen es gibt, steht
 * in index.html, und die Liste hier zu wiederholen hiesse, sie doppelt zu
 * pflegen. Ein Tippfehler in app.js faellt trotzdem auf -- der erste Zugriff
 * auf einen so entstandenen Knoten geht ins Leere.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.tags] Kennung -> Tag, wo es zaehlt.
 * @returns {object} Das Dokument, um Knoten und Ereignisse zu erreichen.
 */
export function createDocument({ tags = {} } = {}) {
  const elements = new Map();
  const body = new StubNode('body');

  const document = {
    body,
    documentElement: new StubNode('html'),
    activeElement: body,
    listeners: {},
    createElement: (tag) => attach(new StubNode(tag)),
    createDocumentFragment: () => attach(new StubFragment()),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, attach(new StubNode(tags[id] ?? 'div', id)));
      return elements.get(id);
    },
    querySelector: () => null,
    addEventListener(type, listener) {
      (document.listeners[type] ??= []).push(listener);
    },
    /** Loest ein Ereignis auf Dokumentebene aus. */
    dispatch(type, event = {}) {
      for (const listener of document.listeners[type] ?? []) listener(event);
    },
  };

  function attach(node) {
    node.ownerDocument = document;
    return node;
  }

  attach(body);
  attach(document.documentElement);

  globalThis.document = document;
  // `instanceof Node` und `instanceof Element` fragt die Anwendung ab, bevor
  // sie ein Ereignisziel anfasst.
  globalThis.Node = StubNode;
  globalThis.Element = StubNode;

  return document;
}
