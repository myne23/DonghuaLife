import assert from 'node:assert/strict';

const homeHtml = [
  '<a href="/series/hero"><img alt="Hero Donghua" src="/images/hero.jpg"></a>',
  '<h2>TE RECOMENDAMOS PARA VOS</h2>',
  '<a href="/series/alpha"><img alt="Alpha Donghua" src="/images/alpha.jpg"></a>',
  '<a href="/series/beta"><img alt="Beta Donghua" src="/images/beta.jpg"></a>',
  '<a href="/series/charlie"><img alt="Charlie Donghua" src="/images/charlie.jpg"></a>',
  '<h2>TENDENCIAS</h2>',
  '<a href="/series/delta"><img alt="Delta Donghua" src="/images/delta.jpg"></a>',
  '<a href="/series/epsilon"><img alt="Epsilon Donghua" src="/images/epsilon.jpg"></a>',
  '<a href="/series/zeta"><img alt="Zeta Donghua" src="/images/zeta.jpg"></a>'
].join('');
const latestHtml = '<a href="/watch/ce435b74-45e1-4f5c-a2ee-29c51f432203-temporada-1-5"><img alt="Gamma Donghua" src="/images/gamma.jpg"><span>Capítulo 5</span></a>';
const catalogHtml = [
  '<a href="/series/alpha"><img alt="Alpha Donghua" src="/images/alpha.jpg"></a>',
  '<a href="/series/beta"><img alt="Beta Donghua" src="/images/beta.jpg"></a>',
  '<a href="/series/charlie"><img alt="Charlie Donghua" src="/images/charlie.jpg"></a>'
].join('');
const seriesHtml = '<h1>Alpha Donghua</h1><img alt="Alpha Donghua poster" src="/images/alpha.jpg"><h2>Sinopsis</h2><p>Una aventura.</p><a href="/watch/alpha-donghua-1-1">Capítulo 1</a><a href="/watch/alpha-donghua-1-2">Capítulo 2</a><a href="/watch/123e4567-e89b-12d3-a456-426614174000-temporada-1-3">Capítulo 3</a>';
const directWatch = '<video src="https://cdn.example.test/video.mp4"></video>';
const metadata = JSON.stringify({videos:[{name:'hd',url:'https://v.okcdn.ru/video.mp4'}]});
const playerOptions = JSON.stringify({flashvars:{metadata}}).replace(/"/g,'&quot;');
const okHtml = '<div data-options="' + playerOptions + '"></div>';

globalThis.kino = {
  log() {},
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input) {
    const url = String(input);
    let body = '';
    if (url === 'https://donghualife.com/' || url === 'https://donghualife.com') body = homeHtml;
    else if (url === 'https://donghualife.com/ultimos-episodios') body = latestHtml;
    else if (url.startsWith('https://donghualife.com/series/alpha')) body = seriesHtml;
    else if (url.startsWith('https://donghualife.com/series?')) body = catalogHtml;
    else if (url.startsWith('https://donghualife.com/series')) body = catalogHtml;
    else if (url.startsWith('https://donghualife.com/watch/')) body = directWatch;
    else if (url.startsWith('https://ok.ru/videoembed/')) body = okHtml;
    else throw new Error('URL inesperada en prueba: ' + url);
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
};

const plugin = await import('../plugin.js?smoke=2');
const home = await plugin.home();
assert.deepEqual(home.map((row) => row.id), ['destacados', 'ultimos-episodios', 'tendencias']);
assert.equal(home[0].items[0].title, 'Alpha Donghua');
assert.equal(home[1].items[0].title, 'Gamma Donghua');
assert.equal(home[1].items[0].ref, 'https://donghualife.com/series/gamma-donghua');
assert.equal(home[2].items[0].title, 'Delta Donghua');
const found = await plugin.search('Alpha');
assert.ok(found.length >= 1);
const episodes = await plugin.episodes('alpha');
assert.equal(episodes.episodes.length,3);
assert.equal(episodes.episodes[1].number,2);
assert.equal(episodes.episodes[2].number,3);
const stream = await plugin.resolve('/watch/alpha-donghua-1-1');
assert.equal(stream.url,'https://cdn.example.test/video.mp4');

globalThis.kino.fetch = async (input) => {
  const url = String(input);
  const body = url.startsWith('https://donghualife.com/watch/')
    ? '<iframe src="https://ok.ru/videoembed/123456789"></iframe>'
    : url.startsWith('https://ok.ru/videoembed/') ? okHtml : '';
  return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
};
const okStream = await plugin.resolve('/watch/alpha-donghua-1-1');
assert.equal(okStream.url,'https://v.okcdn.ru/video.mp4');
console.log('Prueba simulada correcta: 3 filas de inicio, ruta nueva de episodios, búsqueda, episodios y reproducción.');
