import assert from "node:assert/strict";

const seriesUrl = "https://donghualife.com/series/vip-show";
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
console.log("Temporadas: excluye episodios VIP y cambia la portada según la temporada seleccionada.");
