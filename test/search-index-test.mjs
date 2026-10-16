import assert from 'node:assert/strict';

const card = (slug, title) => '<a href="/series/' + slug + '"><img alt="' + title + '" src="/images/' + slug + '.jpg"></a>';
const pages = {
  1: Array.from({ length: 25 }, (_, i) => card('a-' + i, 'Alfa ' + i)).join(''),
  2: Array.from({ length: 25 }, (_, i) => card('b-' + i, 'Beta ' + i)).join(''),
  3: card('soul-land', 'Soul Land') + Array.from({ length: 24 }, (_, i) => card('c-' + i, 'Gamma ' + i)).join('')
};
const store = new Map();
const calls = [];
let fail502 = 0;
globalThis.kino = {
  log() {},
  error(code, message) { const e = new Error(message); e.code = code; return e; },
  storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v); } },
  async sleep() {},
  async fetch(input) {
    const url = String(input);
    calls.push(url);
    if (fail502 > 0) { fail502--; return { ok: false, status: 502, async text() { return ''; } }; }
    const m = /^https:\/\/donghualife\.com\/series\?sort=az(?:&page=(\d+))?$/.exec(url);
    if (!m) throw new Error('URL inesperada: ' + url);
    const body = pages[m[1] || 1] || '';
    return { ok: true, status: 200, async text() { return body; } };
  }
};

const plugin = await import('../plugin.js?search-index=1');

// Una serie que está en la página 3 del catálogo A-Z se encuentra (antes solo se miraban 3 páginas por orden por defecto).
const found = await plugin.search('soul land');
assert.equal(found[0].ref, 'soul-land');
assert.ok(store.has('series-index:v1'), 'El índice se guarda en kino.storage');

// Segunda búsqueda: sale del índice guardado, sin pedir nada al sitio.
const before = calls.length;
const again = await plugin.search('Soul Land');
assert.equal(again[0].ref, 'soul-land');
assert.equal(calls.length, before, 'La segunda búsqueda no hace peticiones');

// El reintento tras 502 en ambos hosts usa kino.sleep (setTimeout no existe en Kino) y no revienta.
store.clear();
fail502 = 2;
const recovered = await plugin.search('alfa 3');
assert.equal(recovered[0].ref, 'a-3');
console.log('ok search-index');
