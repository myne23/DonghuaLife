import assert from "node:assert/strict";

const seriesUrl = "https://donghualife.com/series/vip-show";
const seriesHtml = '<html><head><meta property="og:image" content="/images/series.jpg"></head>' +
  '<h1>VIP Show</h1><p>4 Temporadas</p>' +
  [1,2,3,4].map(n => '<a href="/series/vip-show"><img alt="Temporada ' + n + '" src="/images/season-' + n + '.jpg"></a>').join("") +
  '<a href="/watch/vip-show-1-1">Capítulo 1</a>' +
  '<a href="/watch/vip-show-1-2">Capítulo 2</a>' +
  '<a href="/watch/vip-show-1-3">Capítulo 3</a>' +
  '<a href="/watch/vip-show-1-4"><span>Capítulo 4</span><span class="badge">VIP</span></a></html>';

globalThis.kino = {
  log() {},
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input) {
    const url = String(input);
    if (url === seriesUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return seriesHtml;}};
    const match = /\\/watch\\/vip-show-(\\d+)-(\\d+)$/.exec(new URL(url).pathname);
    if (match) {
      const season = Number(match[1]), episode = Number(match[2]);
      const html = '<h1>VIP Show</h1><a href="/watch/vip-show-' + season + '-' + episode + '">Capítulo ' + episode + '</a>';
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;}};
    }
    throw new Error("URL inesperada en prueba de temporada VIP: " + url);
  }
};

const plugin = await import("../plugin.js?season-vip-poster-test=1");
const first = await plugin.episodes("vip-show");
assert.deepEqual(first.episodes.map(episode => episode.number), [1,2,3], "El capítulo VIP no debe listarse como reproducible");
assert.equal(first.seasons.length, 4, "Debe conservar las cuatro temporadas");
assert.equal(first.series.poster, "https://donghualife.com/images/season-1.jpg", "La ficha debe usar la portada de la temporada actual");
const fourth = await plugin.episodes(first.seasons[3].ref);
assert.deepEqual(fourth.episodes.map(episode => episode.number), [1], "La temporada seleccionada debe devolver solo sus episodios");
assert.equal(fourth.series.poster, "https://donghualife.com/images/season-4.jpg", "La portada debe cambiar al seleccionar la temporada 4");
console.log("Temporadas: excluye episodios VIP y cambia la portada según la temporada seleccionada.");
