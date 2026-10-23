import assert from "node:assert/strict";

const baseUrl = "https://donghualife.com/series/eclipse-illusion";
const specialUrl = "https://donghualife.com/series/the-miasma-war";
const baseHtml = '<html><h1>Eclipse of Illusion</h1><p>2 temporadas</p>' +
  '<div class="season-card"><img alt="Eclipse of Illusion - 1" src="/images/eclipse.jpg"><span>2025</span><a href="/watch/eclipse-illusion-1-1">Capítulo 1</a></div></html>';
const episodeHtml = '<html><h1>Eclipse of Illusion — Cap. 1</h1>' +
  '<a href="/watch/eclipse-illusion-1-1">Temporada 1</a>' +
  '<a href="?s=2">The Maiasma War</a>' +
  '<a href="/watch/eclipse-illusion-1-1">Capítulo 1</a></html>';
const tabHtml = '<html><h1>Eclipse of Illusion — Cap. 1</h1>' +
  '<a href="?s=1">Temporada 1</a><a href="?s=2">The Maiasma War</a>' +
  Array.from({length:6}, (_,i) => '<a href="/watch/eclipse-illusion-1-' + (i+1) + '">Capítulo ' + (i+1) + ' Episodio ' + (i+1) + '</a>').join('') +
  '</html>';
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
    if (url === "https://donghualife.com/watch/eclipse-illusion-1-1") return {ok:true,status:200,async text(){return episodeHtml;}};
    if (url === "https://donghualife.com/watch/eclipse-illusion-1-1?s=2") return {ok:true,status:200,async text(){return tabHtml;}};
    if (url === specialUrl) return {ok:true,status:200,async text(){return specialHtml;}};
    if (url.startsWith("https://beta.donghualife.com/")) {
      const alt = "https://donghualife.com/" + url.slice("https://beta.donghualife.com/".length);
      if (alt === baseUrl) return {ok:true,status:200,async text(){return baseHtml;}};
      if (alt === "https://donghualife.com/watch/eclipse-illusion-1-1") return {ok:true,status:200,async text(){return episodeHtml;}};
      if (alt === "https://donghualife.com/watch/eclipse-illusion-1-1?s=2") return {ok:true,status:200,async text(){return tabHtml;}};
      if (alt === specialUrl) return {ok:true,status:200,async text(){return specialHtml;}};
      if (alt === "https://donghualife.com/") return {ok:true,status:200,async text(){return "";}};
    }
    throw new Error("URL inesperada en prueba de especiales: " + url);
  }
};

const plugin = await import("../plugin.js?named-special-test=1");
const result = await plugin.episodes("eclipse-illusion");
const special = result.seasons.find((season) => /maiasma war|miasma war/i.test(season.title));
assert.ok(special, "La pestaña con nombre propio debe aparecer en el selector");
assert.equal(special.title, "The Maiasma War", "Debe conservar el título del selector sin inventar una temporada");
const selected = await plugin.episodes(special.ref);
assert.equal(selected.episodes.length, 6, "La pestaña alternativa debe cargar sus seis episodios");
assert.ok(selected.episodes.every((episode) => episode.ref.includes("?s=2")), "Cada episodio debe conservar ?s=2 para la reproducción");
const found = await plugin.search("The Miasma War");
assert.equal(found[0]?.ref, "the-miasma-war", "El buscador debe encontrar una ficha no indexada en el catálogo A-Z");
assert.equal(found[0]?.title, "The Miasma War");
console.log("ok named-special-search");
