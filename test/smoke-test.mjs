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
const trendsPageTwoHtml = '<article><a href="/series/eta"><img alt="Eta Donghua" src="/images/eta.jpg"></a></article>';
const moviesHtml = '<h2>Películas</h2><p>2 películas</p><a href="/peliculas/movie-one"><img alt="Movie One" src="/images/movie.jpg"></a>';
const moviesPageTwoHtml = '<h2>Películas</h2><p>2 películas</p><a href="/peliculas/movie-two"><img alt="Movie Two" src="/images/movie-two.jpg"></a>';
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
    else if (url.startsWith('https://donghualife.com/series?sort=popular') && url.includes('page=2')) body = trendsPageTwoHtml;
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
assert.equal(pageB2.items[0].title, 'Eta Donghua', 'Tendencias debe continuar con títulos nuevos y no repetir la fila de portada');
const found = await plugin.search('Alpha');
assert.ok(found.length >= 1);
const alphaDetailRequestsBefore = fetchCalls.filter((url) => url === 'https://donghualife.com/series/alpha').length;
const episodes = await plugin.episodes('alpha');
assert.equal(episodes.episodes.length,3, 'El especial no debe mezclarse con los episodios normales');
assert.equal(episodes.seasons[1].title, 'Peli Ep 151- 152', 'El selector debe conservar el nombre exacto del especial que muestra la web');
const specialEpisodes = await plugin.episodes('special-peli:alpha');
assert.equal(specialEpisodes.episodes.length, 1);
assert.equal(specialEpisodes.episodes[0].title, 'Peli Ep 151- 152');
assert.equal(
  fetchCalls.filter((url) => url === 'https://donghualife.com/series/alpha').length - alphaDetailRequestsBefore,
  1,
  'Cambiar entre Temporada 1 y el especial debe reutilizar la ficha ya cargada'
);

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
const okStream = await plugin.resolve('/watch/alpha-donghua-1-2');
assert.equal(okStream.url,'https://v.okcdn.ru/video.mp4');

// El sitio puede devolver los 40 resultados en un único HTML, aunque Kino solo
// muestre un lote. La paginación debe dividirlo en dos grupos de 20 sin duplicar.
const overflowMoviesHtml = '<h2>Películas</h2><p>40 películas</p>' +
  Array.from({length:40}, (_, i) => '<a href="/peliculas/movie-' + (i + 1) + '"><img alt="Movie ' + (i + 1) + '" src="/images/movie-' + (i + 1) + '.jpg"></a>').join('');
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('https://donghualife.com/peliculas')) {
    return {ok:true,status:200,async text(){return overflowMoviesHtml;},async json(){return JSON.parse(overflowMoviesHtml);}};
  }
  throw new Error('URL inesperada en prueba de lotes de películas: ' + url);
};
const overflowPlugin = await import('../plugin.js?movie-overflow=3');
const overflowPage1 = await overflowPlugin.browse('peliculas', null);
assert.equal(overflowPage1.items.length, 20, 'Películas debe mostrar un lote de 20 aunque el HTML contenga 40');
assert.equal(overflowPage1.items[0].title, 'Movie 1');
assert.ok(overflowPage1.next, 'Debe ofrecer Ver más cuando quedan películas del total');
const overflowPage2 = await overflowPlugin.browse('peliculas', overflowPage1.next);
assert.equal(overflowPage2.items.length, 20, 'El segundo lote debe contener las 20 películas restantes');
assert.equal(overflowPage2.items[0].title, 'Movie 21', 'La paginación debe continuar tras los primeros 20 sin repetir');

assert.equal(overflowPage2.next, undefined, 'No debe ofrecer una tercera página cuando ya se alcanzaron las 40 películas');

// La fuente puede devolver HTML 200 de una ficha incompleta desde el catálogo.
// En ese caso, episodes debe recuperar la ficha canónica como la búsqueda global.
const incompletePlugin = await import('../plugin.js?catalog-incomplete=2');
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === 'https://donghualife.com/series/shrouding-the-heavens') {
    return {ok:true,status:200,async text(){return '<html><h1>Shrouding the Heavens</h1><p>Cargando...</p></html>';},async json(){return {};}};
  }
  if (url === 'https://donghualife.com/series') {
    return {ok:true,status:200,async text(){return '<a href="/series/shrouding-heavens"><img alt="Shrouding the Heavens" src="/images/shrouding.jpg"></a>';},async json(){return {};}};
  }
  if (url === 'https://donghualife.com/series/shrouding-heavens') {
    return {ok:true,status:200,async text(){return '<h1>Shrouding the Heavens</h1><h2>Sinopsis</h2><p>Una aventura.</p><a href="/watch/shrouding-heavens-1-1">Capítulo 1</a>';},async json(){return {};}};
  }
  throw new Error('URL inesperada en prueba de ficha incompleta: ' + url);
};
const recoveredShrouding = await incompletePlugin.episodes('shrouding-the-heavens');
assert.equal(recoveredShrouding.series.title, 'Shrouding the Heavens');
assert.equal(recoveredShrouding.episodes.length, 1, 'Debe recuperar capítulos cuando la ficha inicial devuelve HTML incompleto');


// Si un enlace de catálogo conserva un slug viejo, la ficha se recupera por título
// y se usa la URL canónica que devuelve la búsqueda global.
const shroudingDetailHtml = '<h1>Shrouding the Heavens</h1><h2>Sinopsis</h2><p>Una aventura.</p><a href="/watch/shrouding-heavens-1-1">Capítulo 1</a>';
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === 'https://donghualife.com/series/shrouding-the-heavens') {
    return {ok:false,status:404,async text(){return '';},async json(){return {};}};
  }
  if (url === 'https://donghualife.com/series') {
    const body = '<a href="/series/shrouding-heavens"><img alt="Shrouding the Heavens" src="/images/shrouding.jpg"></a>';
    return {ok:true,status:200,async text(){return body;},async json(){return {};}};
  }
  if (url === 'https://donghualife.com/series/shrouding-heavens') {
    return {ok:true,status:200,async text(){return shroudingDetailHtml;},async json(){return {};}};
  }
  throw new Error('URL inesperada en prueba de URL canónica: ' + url);
};
const aliasPlugin = await import('../plugin.js?catalog-alias=1');
const shroudingEpisodes = await aliasPlugin.episodes('shrouding-the-heavens');
assert.equal(shroudingEpisodes.series.title, 'Shrouding the Heavens');
assert.equal(shroudingEpisodes.episodes.length, 1, 'La ficha canónica debe devolver los capítulos sin error');
console.log('Prueba simulada correcta: catálogo, búsqueda, episodios, reproducción, paginación de películas y recuperación de fichas con slug antiguo.');
