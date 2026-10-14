import assert from 'node:assert/strict';

const homeHtml = '<a href="/series/alpha"><img alt="Alpha Donghua" src="/images/alpha.jpg"></a><a href="/series/beta"><img alt="Beta Donghua" src="/images/beta.jpg"></a>';
const seriesHtml = '<h1>Alpha Donghua</h1><img alt="Alpha Donghua poster" src="/images/alpha.jpg"><h2>Sinopsis</h2><p>Una aventura.</p><a href="/watch/alpha-donghua-1-1">Capítulo 1</a><a href="/watch/alpha-donghua-1-2">Capítulo 2</a>';
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
    else if (url.startsWith('https://donghualife.com/series/alpha')) body = seriesHtml;
    else if (url.startsWith('https://donghualife.com/series?')) body = homeHtml;
    else if (url.startsWith('https://donghualife.com/series')) body = homeHtml;
    else if (url.startsWith('https://donghualife.com/watch/')) body = directWatch;
    else if (url.startsWith('https://ok.ru/videoembed/')) body = okHtml;
    else throw new Error('URL inesperada en prueba: ' + url);
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
};

const plugin = await import('../plugin.js?smoke=1');
const home = await plugin.home();
assert.equal(home.length,1);
assert.equal(home[0].items[0].title,'Alpha Donghua');
const found = await plugin.search('Alpha');
assert.ok(found.length >= 1);
const episodes = await plugin.episodes('alpha');
assert.equal(episodes.episodes.length,2);
assert.equal(episodes.episodes[1].number,2);
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
console.log('Prueba simulada correcta: home, búsqueda, episodios, video directo y OK.ru.');
