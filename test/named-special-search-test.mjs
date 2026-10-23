import assert from "node:assert/strict";

const baseUrl = "https://donghualife.com/series/eclipse-illusion";
const specialUrl = "https://donghualife.com/series/the-miasma-war";
const baseHtml = '<html><h1>Eclipse of Illusion</h1><p>1 temporada</p>' +
  '<div class="season-card"><img alt="Eclipse of Illusion - 1" src="/images/eclipse.jpg"><span>2025</span><a href="/watch/eclipse-illusion-1-1">Capítulo 1</a></div>' +
  '<div class="season-card"><img alt="The Miasma War" src="/images/miasma.jpg"><span>Especial</span><span>2026</span><a href="/watch/the-miasma-war-1-1">Capítulo 1</a></div></html>';
const specialHtml = '<html><h1>The Miasma War</h1><p>Continuation</p><a href="/watch/the-miasma-war-1-1">Capítulo 1</a></html>';
const store = new Map();
globalThis.kino = {
  log() {},
  storage: { get(key) { return store.get(key) ?? null; }, set(key, value) { store.set(key, value); } },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async sleep() {},
  async fetch(input) {
    const url = String(input);
    if (url === "https://donghualife.com/series?sort=az") return {ok:true,status:200,async text(){return "";}};
    if (url === "https://donghualife.com/") return {ok:true,status:200,async text(){return "";}};
    if (url === baseUrl) return {ok:true,status:200,async text(){return baseHtml;}};
    if (url === specialUrl) return {ok:true,status:200,async text(){return specialHtml;}};
    if (url.startsWith("https://beta.donghualife.com/")) {
      const alt = "https://donghualife.com/" + url.slice("https://beta.donghualife.com/".length);
      if (alt === baseUrl) return {ok:true,status:200,async text(){return baseHtml;}};
      if (alt === specialUrl) return {ok:true,status:200,async text(){return specialHtml;}};
      if (alt === "https://donghualife.com/") return {ok:true,status:200,async text(){return "";}};
    }
    throw new Error("URL inesperada en prueba de especiales: " + url);
  }
};

const plugin = await import("../plugin.js?named-special-test=1");
const result = await plugin.episodes("eclipse-illusion");
const special = result.seasons.find((season) => /miasma war/i.test(season.title));
assert.ok(special, "El especial con nombre propio debe aparecer en el selector");
assert.equal(special.title, "The Miasma War", "Debe conservar el título original y no inventar una temporada");
const found = await plugin.search("The Miasma War");
assert.equal(found[0]?.ref, "the-miasma-war", "El buscador debe encontrar una ficha no indexada en el catálogo A-Z");
assert.equal(found[0]?.title, "The Miasma War");
console.log("ok named-special-search");
