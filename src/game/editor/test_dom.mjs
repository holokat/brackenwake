// Small DOM fixture shared by the editor screen and pointer integration tests.
export function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      value: '', type: '', min: '', max: '', step: '', placeholder: '', title: '', checked: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      prepend(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.unshift(c); return c;
      },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener(name, fn) { node.listeners[name] = (node.listeners[name] || []).filter(f => f !== fn); },
      getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }; },
      setPointerCapture(id) { node.captured = id; },
      releasePointerCapture() { node.captured = null; },
      fire(name, ev) { for (const fn of [...(node.listeners[name] || [])]) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    createTextNode: (t) => { const n = el('#text'); n.textContent = t; return n; },
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
