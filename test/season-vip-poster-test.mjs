import assert from "node:assert/strict";

const seriesUrl = "https://donghualife.com/series/vip-show";
const longUrl = "https://donghualife.com/series/long-series";
const sparseUrl = "https://donghualife.com/series/sparse-series";
const sparseHtml = '<html><h1>Sparse Series</h1><p>2 temporadas</p><a href="/watch/sparse-series-1-10">Capítulo 10</a></html>';
const longHtml = '<html><h1>Long Series</h1><p>1 Temporada</p>' +
  Array.from({length:120}, (_, i) => '<a href="/watch/long-series-1-' + (i + 1) + '">Capítulo ' + (i + 1) + '</a>').join('') +
  '</html>';
const spareUrl = "https://donghualife.com/series/spare-me-great-lord";
const spareEpisodeBase = "/watch/436574ad-4b73-4f86-8f30-659d5cbc0afc-temporada-3-";
const spareHtml = '<html><h1>Spare Me, Great Lord!</h1><p>2 temporadas</p>' +
  '<a href="/watch/spare-me-great-lord-1-1">Capítulo 1</a>' +
  '<div class="episode-card"><a href="' + spareEpisodeBase + '4">Capítulo 4</a></div><span class="vip-badge">VIP</span>' +
  '</html>';
const spareSeasonThreeHtml = '<html><h1>Spare Me, Great Lord!</h1><p>Temporada 3</p>' +
  [1,2,3].map(n => '<div class="episode-card"><a href="' + spareEpisodeBase + n + '">Capítulo ' + n + '</a></div>').join("") +
  '<div class="episode-card"><a href="' + spareEpisodeBase + '4">Capítulo 4</a><span class="badge">VIP</span></div></html>';
const seriesHtml = '<html><head><meta property="og:image" content="/images/series.jpg"></head>' +
  '<h1>VIP Show</h1><p>4 Temporadas</p>' +
  [1,2,3,4].map(n => '<a href="/series/vip-show"><div class="season-card"><img alt="Portada ' + n + '" src="/images/season-' + n + '.jpg"><span>Temporada ' + n + '</span></div></a>').join("") +
  '<a href="/watch/vip-show-1-1">Capítulo 1</a>' +
  '<a href="/watch/vip-show-1-2">Capítulo 2</a>' +
  '<a href="/watch/vip-show-1-3">Capítulo 3</a>' +
  '<a href="/watch/vip-show-2-1">Capítulo 1</a>' +
  // Simula la ficha que solo enlaza el capítulo 4 de la temporada 3.
  '<a href="/watch/vip-show-3-4">Capítulo 4</a>' +
  '<a href="/watch/vip-show-4-1">Capítulo 1</a></html>';

globalThis.kino = {
  log() {},
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input) {
    const url = String(input);
    if (url === seriesUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return seriesHtml;}};
    if (url === longUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return longHtml;}};
    if (url === sparseUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return sparseHtml;}};
    const sparseEpisode = /\/watch\/sparse-series-(\d+)-(\d+)$/.exec(new URL(url).pathname);
    if (sparseEpisode) {
      const season = Number(sparseEpisode[1]), episode = Number(sparseEpisode[2]);
      if (season > 2 || episode > 60) throw new Error("Episodio fuera de fixture");
      const html = '<html><h1>Sparse Series</h1><a href="/watch/sparse-series-' + season + '-' + episode + '">Capítulo ' + episode + '</a></html>';
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;}};
    }
    if (url === spareUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return spareHtml;}};
    if (url.includes("/watch/436574ad-4b73-4f86-8f30-659d5cbc0afc-temporada-3-1")) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return spareSeasonThreeHtml;}};
    }
    if (url.includes("/watch/spare-me-great-lord-1-1")) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return '<h1>Spare Me, Great Lord!</h1><a href="/watch/spare-me-great-lord-1-1">Capítulo 1</a>';}};
    }
    const match = /\/watch\/vip-show-(\d+)-(\d+)$/.exec(new URL(url).pathname);
    if (match) {
      const season = Number(match[1]), episode = Number(match[2]);
      if (episode > 1 && !(season === 3 && episode <= 4)) {
        throw new Error("Episodio no disponible en fixture");
      }
      const html = '<h1>VIP Show</h1><a href="/watch/vip-show-' + season + '-' + episode + '">' +
        (season === 3 && episode === 4 ? '<span>Capítulo 4VIP</span>' : 'Capítulo ' + episode) + '</a>';
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;}};
    }
    throw new Error("URL inesperada en prueba de temporada VIP: " + url);
  }
};

const plugin = await import("../plugin.js?season-vip-poster-test=1");
const first = await plugin.episodes("vip-show");
assert.deepEqual(first.episodes.filter(episode => episode.season === 1).map(episode => episode.number), [1,2,3], "El capítulo VIP de la temporada 1 no debe listarse");
const thirdSeason = await plugin.episodes(first.seasons.find(season => season.number === 3).ref);
assert.deepEqual(thirdSeason.episodes.map(episode => episode.number), [1,2,3], "La temporada 3 debe mostrar solo los capítulos 1–3 y excluir el capítulo 4 VIP");
assert.equal(first.seasons.length, 4, "Debe conservar las cuatro temporadas");
assert.equal(first.series.poster, "https://donghualife.com/images/season-1.jpg", "La ficha debe usar la portada de la temporada actual");
const fourth = await plugin.episodes(first.seasons[3].ref);
assert.deepEqual(fourth.episodes.map(episode => episode.number), [1], "La temporada seleccionada debe devolver solo sus episodios");
assert.equal(fourth.series.poster, "https://donghualife.com/images/season-4.jpg", "La portada debe cambiar al seleccionar la temporada 4");

// Regresión: ficha con contador desactualizado y rutas UUID distintas en T3.
const spare = await plugin.episodes("spare-me-great-lord");
const spareThirdRef = spare.seasons.find(season => season.number === 3)?.ref;
assert.ok(spareThirdRef, "Debe detectar la temporada 3 aunque la ficha diga que hay solo dos");
const spareThird = await plugin.episodes(spareThirdRef);
assert.deepEqual(spareThird.episodes.map(episode => episode.number), [1,2,3],
  "Debe usar la URL de T3 para recuperar los capítulos públicos y excluir el 4 VIP");

// Regresión: VIP como texto hermano fuera del enlace del episodio.
assert.ok(!spareThird.episodes.some(episode => episode.number === 4),
  "Debe excluir el capítulo si el distintivo VIP está fuera del enlace");

// Series largas: Kino recibe bloques de 50 capítulos, con refs que vuelven a cargar el rango.
const longFirst = await plugin.episodes("long-series");
assert.equal(longFirst.episodes.length, 50, "El primer bloque debe contener 50 capítulos");
assert.deepEqual(longFirst.episodes.map(episode => episode.number), Array.from({length:50}, (_, i) => i + 1));
assert.equal(longFirst.seasons.length, 3, "120 capítulos deben dividirse en tres bloques");
assert.equal(longFirst.seasons[0].title, "T1 · Capítulos 1–50");
const longSecond = await plugin.episodes(longFirst.seasons[1].ref);
assert.deepEqual(longSecond.episodes.map(episode => episode.number), Array.from({length:50}, (_, i) => i + 51),
  "El segundo bloque debe devolver los capítulos 51–100");
const longLast = await plugin.episodes(longFirst.seasons[2].ref);
assert.deepEqual(longLast.episodes.map(episode => episode.number), Array.from({length:20}, (_, i) => i + 101),
  "El último bloque debe devolver solo los capítulos restantes");
// Regresión: la ficha solo muestra el capítulo 10, pero las rutas públicas contienen
// una temporada larga y la segunda temporada no tiene un enlace propio en la ficha.
const sparseFirst = await plugin.episodes("sparse-series");
assert.equal(sparseFirst.seasons.length, 4, "Dos temporadas de 60 episodios deben generar dos bloques por temporada");
assert.deepEqual(sparseFirst.episodes.map(episode => episode.number), Array.from({length:50}, (_, i) => i + 1),
  "Debe reconstruir la primera temporada aunque la ficha solo enlaza el capítulo 10");
const sparseSecondSeason = await plugin.episodes(sparseFirst.seasons.find(season => season.ref.includes(":2:1")).ref);
assert.deepEqual(sparseSecondSeason.episodes.map(episode => episode.number), Array.from({length:50}, (_, i) => i + 1),
  "Debe recuperar la segunda temporada a partir de la ruta de la temporada anterior");
const sparseSecondBlock = await plugin.episodes(sparseFirst.seasons.find(season => season.ref.includes(":2:51")).ref);
assert.deepEqual(sparseSecondBlock.episodes.map(episode => episode.number), Array.from({length:10}, (_, i) => i + 51),
  "El bloque final de la segunda temporada debe devolver los capítulos 51–60");


 // Regresión: el distintivo VIP puede estar antes del enlace dentro de la tarjeta.
const precedingVipHtml = '<html><h1>Badge Series</h1><p>1 temporada</p>' +
  '<div class="episode-card"><a href="/watch/badge-series-1-1">Capítulo 1</a></div>' +
  '<div class="episode-card"><span class="vip-badge">VIP</span><a href="/watch/badge-series-1-2">Capítulo 2</a></div>' +
  '<div class="episode-card"><a href="/watch/badge-series-1-3">Capítulo 3</a></div></html>';
const precedingVipUrl = "https://donghualife.com/series/badge-series";
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === precedingVipUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return precedingVipHtml;}};
  if (url.includes("/watch/badge-series-1-")) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return '<a href="' + new URL(url).pathname + '">Capítulo ' + /-(\d+)$/.exec(url)[1] + '</a>';}};
  throw new Error("URL inesperada en prueba de VIP antes del enlace: " + url);
};
const precedingVipPlugin = await import("../plugin.js?vip-before-link-test=1");
const precedingVip = await precedingVipPlugin.episodes("badge-series");
assert.deepEqual(precedingVip.episodes.map(episode => episode.number), [1,3],
  "Debe excluir el capítulo con VIP antes del enlace y conservar los capítulos públicos vecinos");

// Regresión: una temporada que arranca en el 106 no debe generar bloques vacíos 1-50 y 51-100.
const lateStartUrl = "https://donghualife.com/series/late-start-series";
const lateStartHtml = '<html><h1>Late Start Series</h1><p>1 temporada</p>' +
  '<div class="episode-card"><span class="vip-badge">VIP</span><a href="/watch/late-start-series-2-10">Capítulo 10</a></div>' +
  Array.from({length:56}, (_, i) => {
    const n = i + 106;
    return '<div class="episode-card"><a href="/watch/late-start-series-2-' + n + '">Capítulo ' + n + '</a></div>';
  }).join('') + '</html>';
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === lateStartUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return lateStartHtml;}};
  if (url.startsWith("https://donghualife.com/watch/late-start-series-2-")) {
    return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return lateStartHtml;}};
  }
  throw new Error("URL inesperada en prueba de temporada desde 106: " + url);
};
const lateStartPlugin = await import("../plugin.js?late-start-blocks-test=1");
const lateStart = await lateStartPlugin.episodes("late-start-series");
assert.deepEqual(lateStart.seasons.map(season => season.title), ["T2 · Capítulos 101–150", "T2 · Capítulos 151–161"],
  "Los bloques deben empezar en el rango que contiene el primer episodio existente");
assert.equal(lateStart.episodes[0].number, 106, "La lista inicial debe comenzar por el capítulo público 106");
assert.ok(!lateStart.episodes.some(episode => episode.number === 10), "El capítulo 10 VIP no debe aparecer");


 // Regresión realista: el texto del enlace puede incluir «Capítulo 10 VIP Episodio 10».
const vipAnchorHtml = '<html><h1>Supreme God Emperor</h1><p>1 temporada</p>' +
  // La misma ruta aparece primero en «Ver último» sin la marca VIP.
  '<a href="/watch/supreme-god-emperor-2-10">Ver último</a>' +
  '<a href="/watch/supreme-god-emperor-2-10">Capítulo 10 VIP Episodio 10</a>' +
  '<a href="/watch/supreme-god-emperor-temporada-2-106">Capítulo 106 episodio 106</a>' +
  '<a href="/watch/supreme-god-emperor-temporada-2-107">Capítulo 107 episodio 107</a></html>';
const vipAnchorUrl = "https://donghualife.com/series/supreme-god-emperor";
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === vipAnchorUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return vipAnchorHtml;}};
  if (url.includes("/watch/supreme-god-emperor-temporada-2-")) {
    return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return vipAnchorHtml;}};
  }
  throw new Error("URL inesperada en prueba VIP como primer enlace: " + url);
};
const vipAnchorPlugin = await import("../plugin.js?vip-anchor-test=1");
const vipAnchorResult = await vipAnchorPlugin.episodes("supreme-god-emperor");
assert.ok(!vipAnchorResult.episodes.some(episode => episode.number === 10),
  "El capítulo 10 VIP no debe reaparecer durante la reconstrucción de temporada");
assert.equal(vipAnchorResult.episodes[0].number, 106,
  "La temporada reconstruida debe comenzar por el primer episodio público 106");



// Regresión: el enlace destacado «Ver último» puede repetir una ruta VIP antes
// de que aparezca la tarjeta marcada. La etiqueta VIP posterior debe invalidarla.
const againstUrl = "https://donghualife.com/series/against-sky-supreme";
const againstHtml = '<html><h1>Against The Sky Supreme</h1><p>1 temporada</p>' +
  '<a href="/watch/against-sky-supreme-1-557">Ver último</a>' +
  Array.from({length:556}, (_, i) => '<a href="/watch/against-sky-supreme-1-' + (i + 1) + '">Capítulo ' + (i + 1) + '</a>').join('') +
  '<a href="/watch/against-sky-supreme-1-557">Capítulo 557 VIP Capítulo 557</a></html>';
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === againstUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return againstHtml;}};
  if (url.includes("/watch/against-sky-supreme-1-")) {
    return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return againstHtml;}};
  }
  throw new Error("URL inesperada en prueba VIP duplicado: " + url);
};
const againstPlugin = await import("../plugin.js?against-vip-duplicate-test=1");
const against = await againstPlugin.episodes("against-sky-supreme");
assert.equal(against.episodes.length, 556, "Against the Sky Supreme debe conservar solo los 556 episodios públicos");
assert.equal(against.episodes[0].number, 1);
assert.equal(against.episodes.at(-1).number, 556);
assert.ok(!against.episodes.some(episode => episode.number === 557), "El 557 VIP debe excluirse aunque Ver último lo enlace antes");


// Regresión: si la ficha antigua solo enlaza T1 pero declara 2 temporadas,
// reconstruir T2 desde la ruta compartida /watch/<slug>-2-1.
const legacyTwoSeasonUrl = "https://donghualife.com/series/legacy-two-season";
const legacyTwoSeasonHtml = '<html><h1>Legacy Two Season</h1><p>2 temporadas</p>' +
  Array.from({length:12}, (_, i) => '<a href="/watch/legacy-two-season-1-' + (i + 1) + '">Capítulo ' + (i + 1) + '</a>').join('') +
  '</html>';
const legacySeasonTwoHtml = '<html><h1>Legacy Two Season</h1><p>Temporada 2</p>' +
  Array.from({length:12}, (_, i) => '<a href="/watch/legacy-two-season-2-' + (i + 1) + '">Capítulo ' + (i + 1) + '</a>').join('') +
  '</html>';
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === legacyTwoSeasonUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return legacyTwoSeasonHtml;}};
  if (url === "https://donghualife.com/watch/legacy-two-season-2-1") {
    return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return legacySeasonTwoHtml;}};
  }
  throw new Error("URL inesperada en prueba de reconstrucción de temporada legacy: " + url);
};
const legacyTwoSeasonPlugin = await import("../plugin.js?legacy-two-season-reconstruction=1");
const legacyTwoSeason = await legacyTwoSeasonPlugin.episodes("legacy-two-season");
assert.ok(legacyTwoSeason.seasons.some(season => /T2/.test(season.title)),
  "La temporada 2 debe reconstruirse para rutas legacy compartidas");
assert.ok(legacyTwoSeason.episodes.some(episode => episode.season === 2 && episode.number === 1),
  "Debe incluir el primer capítulo público de la temporada 2 legacy");

console.log("Temporadas: filtro VIP, bloques de episodios, temporadas con metadatos desactualizados y fichas con un único enlace.");
