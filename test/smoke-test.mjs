import assert from 'node:assert/strict';

const homeHtml = [
  '<a href="/series/hero"><img alt="Hero Donghua" src="/images/hero.jpg"></a>',
  '<h2>ÚLTIMOS EPISODIOS</h2>',
  '<a href="/watch/gamma-donghua-1-5"><h3>Gamma Donghua</h3><img alt="Gamma Donghua" src="/images/gamma.jpg"><span>Capítulo 5</span></a>',
  '<h2>ESTRENOS VIP</h2>',
  '<a href="/watch/vip-donghua-1-7"><h3>VIP Donghua</h3><img alt="VIP Donghua" src="/images/vip.jpg"><span>Capítulo 7</span></a>',
  '<h2>TE RECOMENDAMOS PARA VOS</h2>',
  '<h3><a href="/series/alpha"><img alt="Alpha Donghua" src="/images/alpha.jpg"></a></h3>',
  '<h3><a href="/series/beta"><img alt="Beta Donghua" src="/images/beta.jpg"></a></h3>',
  '<h3><a href="/series/charlie"><img alt="Charlie Donghua" src="/images/charlie.jpg"></a></h3>',
  '<h2>TENDENCIAS</h2>',
  '<h3><a href="/series/delta"><img alt="Delta Donghua" src="/images/delta.jpg"></a></h3>',
  '<h3><a href="/series/epsilon"><img alt="Epsilon Donghua" src="/images/epsilon.jpg"></a></h3>',
  '<h3><a href="/series/zeta"><img alt="Zeta Donghua" src="/images/zeta.jpg"></a></h3>'
].join('');
const latestHtml = '<a href="/watch/ce435b74-45e1-4f5c-a2ee-29c51f432203-temporada-1-5"><img alt="Gamma Donghua" src="/images/gamma.jpg"><span>Capítulo 5</span></a><a href="/ultimos-episodios?page=2">2</a>';
const latestPageTwoHtml = '<a href="/watch/new-episode-donghua-1-6"><img alt="New Episode Donghua" src="/images/new.jpg"><span>Capítulo 6</span></a><a href="/ultimos-episodios?page=1">1</a><a href="/ultimos-episodios?page=2">2</a>';
const catalogHtml = [
  '<article><span>Finalizado</span><a href="/series/alpha"><img alt="Alpha Donghua" src="/images/alpha.jpg"></a></article>',
  '<article><span>En Emisión</span><a href="/series/beta"><img alt="Beta Donghua" src="/images/beta.jpg"></a></article>',
  '<article><span>Finalizado</span><a href="/series/charlie"><img alt="Charlie Donghua" src="/images/charlie.jpg"></a></article>',
].join('');
const catalogPageTwoHtml = '<article><span>En Emisión</span><a href="/series/delta"><img alt="Delta Donghua" src="/images/delta.jpg"></a></article>';
const moviesHtml = '<h2>Pelis Donghuas</h2><a href="/peliculas/movie-one"><img alt="Movie One" src="/images/movie.jpg"></a><a href="/peliculas?page=2">2</a>';
const moviesPageTwoHtml = '<h2>Películas</h2><a href="/peliculas/movie-two"><img alt="Movie Two" src="/images/movie-two.jpg"></a><a href="/peliculas?page=1">1</a><a href="/peliculas?page=2">2</a>';
const seriesHtml = '<h1>Alpha Donghua</h1><img alt="Alpha Donghua poster" src="/images/alpha.jpg"><h2>Sinopsis</h2><p>Una aventura.</p><a href="/watch/alpha-donghua-1-1">Capítulo 1</a><a href="/watch/alpha-donghua-1-2">Capítulo 2</a><a href="/watch/123e4567-e89b-12d3-a456-426614174000-temporada-1-3">Capítulo 3</a><img alt="Peli Ep 151- 152" src="/images/special.jpg"><a href="/watch/el-inmortal-renegado-temporada-152-1"><span>Capítulo 152</span></a>';
const directWatch = '<video src="https://cdn.example.test/video.mp4"></video>';
const metadata = JSON.stringify({videos:[{name:'hd',url:'https://v.okcdn.ru/video.mp4'}]});
const playerOptions = JSON.stringify({flashvars:{metadata}}).replace(/"/g,'&quot;');
const okHtml = '<div data-options="' + playerOptions + '"></div>';

const fetchCalls = [];
globalThis.kino = {
  log() {},
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input) {
    const url = String(input);
    fetchCalls.push(url);
    let body = '';
    if (url === 'https://donghualife.com/' || url === 'https://donghualife.com') body = homeHtml;
    else if (url.startsWith('https://donghualife.com/peliculas')) body = /[?&]page=\d+/.test(url) ? moviesPageTwoHtml : moviesHtml;
    else if (url.startsWith('https://donghualife.com/ultimos-episodios')) body = /[?&]page=\d+/.test(url) ? latestPageTwoHtml : latestHtml;
    else if (url.startsWith('https://donghualife.com/series/alpha')) body = seriesHtml;
    else if (url.startsWith('https://donghualife.com/series?') && url.includes('page=2')) body = catalogPageTwoHtml;
    else if (url.startsWith('https://donghualife.com/series?') && url.includes('page=3')) body = catalogPageTwoHtml;
    else if (url.startsWith('https://donghualife.com/series?')) body = catalogHtml;
    else if (url.startsWith('https://donghualife.com/series')) body = catalogHtml;
    else if (url.startsWith('https://donghualife.com/watch/')) body = directWatch;
    else if (url.startsWith('https://ok.ru/videoembed/')) body = okHtml;
    else throw new Error('URL inesperada en prueba: ' + url);
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
};

const plugin = await import('../plugin.js?smoke=2');
const beforeHomeFetches = fetchCalls.length;
const home = await plugin.home();
assert.equal(fetchCalls.length - beforeHomeFetches, 3, 'El Inicio consulta portada, catálogo y sección de películas');
const categories = await plugin.categories(null);
const sectionHome = await plugin.section({ tab: null });
assert.equal(sectionHome.tab, 'inicio');
assert.deepEqual(sectionHome.tabs.map((entry) => entry.id), ['inicio', 'ultimos-episodios', 'tendencias', 'series-finalizadas', 'peliculas', 'catalogo-az']);
assert.ok(sectionHome.rows.length >= 3, 'La sección propia debe mostrar varias filas');
assert.ok(sectionHome.rows.every((row) => !Object.hasOwn(row, 'genre')), 'La sección reutiliza las mismas filas sin género forzado');
const sectionCatalog = await plugin.section({ tab: 'catalogo-az' });
assert.equal(sectionCatalog.tab, 'catalogo-az');
assert.equal(sectionCatalog.rows.length, 1);
assert.equal(sectionCatalog.rows[0].id, 'catalogo-az');
assert.ok(sectionCatalog.rows[0].items.every((item) => item.kind === 'series' && item.ref));

assert.deepEqual(categories.map((category) => category.id), ['ultimos-episodios', 'tendencias', 'series-finalizadas', 'peliculas', 'catalogo-az']);
assert.ok(categories.every((category) => category.title && category.ref));

assert.ok(home.length >= 3, "Home debe devolver al menos tres filas visibles");
assert.deepEqual(home.map((row) => row.title), ['Últimos Episodios', 'Tendencias', 'Series Finalizadas', 'Películas', 'Catálogo completo de A-Z']);
assert.equal(home[0].items[0].title, 'Gamma Donghua', 'Últimos episodios debe usar la sección real de la portada');
assert.ok(home.every((row) => Array.isArray(row.items) && row.items.every((item) => item.id && item.ref)));
assert.equal(home.find((row) => row.id === 'series-finalizadas').items.length, 2);
assert.equal(home.find((row) => row.id === 'peliculas').items[0].kind, 'movie');
assert.ok(home.every((row) => !Object.hasOwn(row, 'genre')), 'Las filas de Home no deben forzar todas las categorías al género anime');
assert.equal(home.find((row) => row.id === 'catalogo-az').items[0].title, 'Alpha Donghua');
const pageA = await plugin.browse('catalogo-az', null);
assert.ok(pageA.items.length > 0);
assert.equal(JSON.parse(pageA.next).page, 2, 'El catálogo debe ofrecer otra página aunque la web no incluya un enlace Siguiente detectable');
const pageA2 = await plugin.browse('catalogo-az', pageA.next);
assert.equal(pageA2.items[0].title, 'Delta Donghua', 'El cursor debe cargar resultados nuevos sin repetir la primera página');
assert.equal(JSON.parse(pageA2.next).page, 3, 'Debe seguir ofreciendo páginas mientras lleguen resultados nuevos');
const pageA3 = await plugin.browse('catalogo-az', pageA2.next);
assert.deepEqual(pageA3.items, [], 'Si el sitio ignora page=N y repite resultados, el plugin debe detenerse para evitar duplicados');
const pageMovies = await plugin.browse('peliculas', null);
assert.equal(pageMovies.items[0].title, 'Movie One');
assert.equal(JSON.parse(pageMovies.next).page, 2, 'Películas debe ofrecer una segunda página');
const pageMovies2 = await plugin.browse('peliculas', pageMovies.next);
assert.equal(pageMovies2.items[0].title, 'Movie Two', 'Películas debe cargar títulos nuevos');
assert.equal(pageMovies2.next, undefined, 'Películas no debe ofrecer otra página si la web no tiene Siguiente');
const pageMoviesHome = await plugin.browse('peliculas-home', null);
assert.equal(pageMoviesHome.items[0].title, 'Movie Two', 'Ver más desde Home debe saltar las películas ya mostradas en la fila');
const pageLatest = await plugin.browse('ultimos-episodios', null);
assert.equal(pageLatest.items[0].title, 'Gamma Donghua');
assert.equal(JSON.parse(pageLatest.next).page, 2, 'Últimos episodios debe ofrecer otra página');
assert.ok(pageLatest.next.length < 2048, 'El cursor de Últimos Episodios debe caber en el límite de Kino');
const pageLatest2 = await plugin.browse('ultimos-episodios', pageLatest.next);
assert.equal(pageLatest2.items[0].title, 'New Episode Donghua', 'Últimos episodios debe cargar títulos nuevos');
assert.equal(pageLatest2.next, undefined, 'Últimos episodios no debe ofrecer otra página si la web no tiene Siguiente');
const pageLatestHome = await plugin.browse('ultimos-episodios-home', null);
assert.equal(pageLatestHome.items[0].title, 'New Episode Donghua', 'Ver más desde Home debe saltar las series ya mostradas en la fila');
const pageB = await plugin.browse('tendencias', null);
assert.ok(pageB.items.length > 0);
assert.ok(pageB.next, 'Tendencias debe ofrecer una segunda página');
const pageB2 = await plugin.browse('tendencias', pageB.next);
assert.equal(pageB2.items[0].title, 'Delta Donghua', 'Tendencias debe continuar con títulos nuevos y no repetir la fila de portada');
const found = await plugin.search('Alpha');
assert.ok(found.length >= 1);
const episodes = await plugin.episodes('alpha');
assert.equal(episodes.episodes.length,3, 'El especial no debe mezclarse con los episodios normales');
assert.equal(episodes.seasons[1].title, 'Peli Ep 151- 152', 'El selector debe conservar el nombre exacto del especial que muestra la web');
const specialEpisodes = await plugin.episodes('special-peli:alpha');
assert.equal(specialEpisodes.episodes.length, 1);
assert.equal(specialEpisodes.episodes[0].title, 'Peli Ep 151- 152');

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
console.log('Prueba simulada correcta: recomendaciones, últimos episodios, estrenos VIP, tendencias, catálogo, búsqueda, episodios y reproducción.');
