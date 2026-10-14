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
const metadata = JSON.stringify({videos:[{name:'hd',url:'https://v.okcdn.ru/video.mp4'},{name:'sd',url:'https://v.okcdn.ru/video-sd.mp4'}]});
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
assert.ok(fetchCalls.includes('https://donghualife.com/peliculas?sort=newest'), 'Películas debe usar el orden Reciente al cargar la primera página');
assert.ok(fetchCalls.includes('https://donghualife.com/peliculas?page=2&sort=newest'), 'Películas debe usar la URL de página 2 con sort=newest para evitar el 502 de la ruta sin orden');
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

// Cuando el sitio crea el reproductor con JavaScript y no expone el MP4 en HTML,
// Kino debe usar la captura del navegador y conservar headers/subtítulos.
globalThis.kino.browser = {
  async capture(url, options) {
    assert.equal(url, 'https://donghualife.com/watch/alpha-donghua-1-1');
    assert.equal(options.autoplay, true);
    return {
      finalUrl: url,
      media: [
        {url:'https://cdn.example.test/playlist.m3u8',mime:'application/vnd.apple.mpegurl',headers:{Referer:url,'User-Agent':'KinoTest'}},
        {url:'https://cdn.example.test/low.mp4',mime:'video/mp4',headers:{}},
        {url:'https://cdn.example.test/segment-001.ts',mime:'video/mp2t',headers:{}}
      ],
      subtitles:[{url:'https://cdn.example.test/es.vtt',lang:'es'}]
    };
  }
};
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === 'https://donghualife.com/watch/alpha-donghua-1-1') {
    return {ok:true,status:200,async text(){return '<html><h1>Player</h1></html>';},async json(){return {};}};
  }
  throw new Error('URL inesperada en prueba de captura: ' + url);
};
const capturePlugin = await import('../plugin.js?browser-capture-test=1');
const captured = await capturePlugin.resolve('/watch/alpha-donghua-1-1');
assert.equal(captured.url,'https://cdn.example.test/playlist.m3u8','La captura debe priorizar HLS frente a MP4');
assert.equal(captured.mime,'application/vnd.apple.mpegurl');
assert.equal(captured.label,'cdn.example.test · HLS','Debe identificar la fuente activa en el menú Servidor de Kino');
assert.equal(captured.headers['User-Agent'],'KinoTest','Debe conservar los headers capturados');
assert.equal(captured.alternatives.length,1,'Debe conservar el MP4 capturado como alternativa al HLS');
assert.equal(captured.alternatives[0].url,'https://cdn.example.test/low.mp4');
assert.equal(captured.alternatives[0].mime,'video/mp4');
assert.equal(captured.alternatives[0].label,'cdn.example.test · MP4');
assert.deepEqual(captured.subtitles,[{lang:'es',url:'https://cdn.example.test/es.vtt',format:'vtt'}]);

delete globalThis.kino.browser;

// Los datos de Next pueden contener varias URL directas y embeds de proveedores.
// Kino debe recibir las URL directas como alternativas nativas y los embeds como
// referencias diferidas que solo se resuelven cuando la persona las selecciona.
const nativeSourceUrls = [
  'https://pub-abc.r2.dev/episode/master.m3u8',
  'https://pub-abc.r2.dev/episode/backup.m3u8',
  'https://www.dailymotion.com/embed/video/x9abcde',
  'https://rumble.com/embed/v123abc/'
];
const nativeSourceJson = JSON.stringify({sources:nativeSourceUrls.map((url) => ({url}))}).replace(/\//g, '\\/');
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === 'https://donghualife.com/watch/shrouding-heavens-1-2') {
    const body = '<script>window.__DATA__=' + nativeSourceJson + '</script>';
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
  if (url === 'https://www.dailymotion.com/player/metadata/video/x9abcde') {
    const body = JSON.stringify({qualities:{auto:[{type:'application/x-mpegURL',url:'https://pub-abc.r2.dev/episode/dailymotion.m3u8'}]}});
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
  if (url === 'https://rumble.com/embed/v123abc/') {
    const body = '<video><source src="https://rumble.com/video.mp4"></video>';
    return {ok:true,status:200,async text(){return body;},async json(){return {};}};
  }
  throw new Error('URL inesperada en prueba de resolvers propios: ' + url);
};
const nativeSourcePlugin = await import('../plugin.js?native-source-resolver-test=1');
const nativeSourceStream = await nativeSourcePlugin.resolve('/watch/shrouding-heavens-1-2');
assert.equal(nativeSourceStream.url, 'https://pub-abc.r2.dev/episode/master.m3u8', 'Debe resolver primero la fuente R2 directa');
assert.equal(nativeSourceStream.mime, 'application/vnd.apple.mpegurl');
assert.equal(nativeSourceStream.alternatives.length, 3, 'Debe conservar las fuentes directas y los embeds como alternativas');
assert.equal(nativeSourceStream.alternatives[0].url, 'https://pub-abc.r2.dev/episode/backup.m3u8', 'Las fuentes directas deben enviarse a Kino sin una resolución diferida');
assert.equal(nativeSourceStream.alternatives[0].mime, 'application/vnd.apple.mpegurl');
assert.equal(nativeSourceStream.alternatives[0].label, 'R2 · HLS');
assert.equal(nativeSourceStream.alternatives[1].label, 'Dailymotion');
assert.equal(nativeSourceStream.alternatives[2].label, 'Rumble');
const rumbleFallback = await nativeSourcePlugin.resolve(nativeSourceStream.alternatives[2].ref);
assert.equal(rumbleFallback.url, 'https://rumble.com/video.mp4', 'El resolver Rumble debe aceptar una fuente MP4 pública expuesta por su reproductor');
assert.equal(rumbleFallback.mime, 'video/mp4');
const dailymotionFallback = await nativeSourcePlugin.resolve(nativeSourceStream.alternatives[1].ref);
assert.equal(dailymotionFallback.url, 'https://pub-abc.r2.dev/episode/dailymotion.m3u8', 'El resolver Dailymotion debe extraer el HLS de sus metadatos públicos');
assert.equal(dailymotionFallback.mime, 'application/vnd.apple.mpegurl');


globalThis.kino.fetch = async (input) => {
  const url = String(input);
  const body = url.startsWith('https://donghualife.com/watch/')
    ? '<iframe src="https://ok.ru/videoembed/123456789"></iframe>'
    : url.startsWith('https://ok.ru/videoembed/') ? okHtml : '';
  return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
};
const okStream = await plugin.resolve('/watch/alpha-donghua-1-2');
assert.equal(okStream.url,'https://v.okcdn.ru/video.mp4');
assert.equal(okStream.label,'OK.ru · hd');
assert.equal(okStream.alternatives.length,1,'Debe conservar las calidades alternativas de OK.ru');
assert.equal(okStream.alternatives[0].url,'https://v.okcdn.ru/video-sd.mp4');
assert.equal(okStream.alternatives[0].label,'OK.ru · sd');

// La página real de películas tiene 40 resultados: 25 en la primera página y 15 en la segunda.
// La navegación debe respetar las páginas del sitio, sin recortar los primeros 25 a lotes artificiales.
const overflowMoviesPageOne = '<h2>Películas</h2><p>40 películas</p>' +
  Array.from({length:25}, (_, i) => '<a href="/peliculas/movie-' + (i + 1) + '"><img alt="Movie ' + (i + 1) + '" src="/images/movie-' + (i + 1) + '.jpg"></a>').join('') +
  '<a href="/peliculas?page=2">2</a>';
const overflowMoviesPageTwo = '<h2>Películas</h2><p>40 películas</p>' +
  Array.from({length:15}, (_, i) => '<a href="/peliculas/movie-' + (i + 26) + '"><img alt="Movie ' + (i + 26) + '" src="/images/movie-' + (i + 26) + '.jpg"></a>').join('') +
  '<a href="/peliculas?page=1">1</a><a href="/peliculas?page=2">2</a>';
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('https://donghualife.com/peliculas')) {
    const body = /[?&]page=2/.test(url) ? overflowMoviesPageTwo : overflowMoviesPageOne;
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
  throw new Error('URL inesperada en prueba de paginación real de películas: ' + url);
};
const overflowPlugin = await import('../plugin.js?movie-real-pages=1');
const overflowPage1 = await overflowPlugin.browse('peliculas', null);
assert.equal(overflowPage1.items.length, 25, 'La primera página debe conservar sus 25 películas reales');
assert.equal(overflowPage1.items[0].title, 'Movie 1');
assert.equal(overflowPage1.items[24].title, 'Movie 25');
assert.ok(overflowPage1.next, 'Debe ofrecer Ver más al quedar una segunda página real');
assert.equal(JSON.parse(overflowPage1.next).page, 2);
const overflowPage2 = await overflowPlugin.browse('peliculas', overflowPage1.next);
assert.equal(overflowPage2.items.length, 15, 'La segunda página debe conservar sus 15 películas reales');
assert.equal(overflowPage2.items[0].title, 'Movie 26', 'La segunda página debe continuar después de Movie 25 sin repetir ni saltar');
assert.equal(overflowPage2.items[14].title, 'Movie 40');
assert.equal(overflowPage2.next, undefined, 'No debe ofrecer una tercera página cuando ya se alcanzaron las 40 películas');

assert.equal(overflowPage2.next, undefined, 'No debe ofrecer una tercera página cuando ya se alcanzaron las 40 películas');

// Las portadas de algunas fichas vienen de /_next/image; el plugin debe usar
// la ruta del archivo original para que Kino pueda cargarla directamente.
const posterPlugin = await import('../plugin.js?next-image-poster-test=1');
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('https://donghualife.com/peliculas')) {
    const body = '<h2>Películas</h2>' +
      '<a href="/peliculas/lord-legend-of-ravaging-dynasties"><img alt="L.O.R.D: Legend of Ravaging Dynasties" src="https://donghualife.com/_next/image?q=75&amp;url=%2Fimages%2Fwebp%2Flord-legend-ravaging-dynasties__bannerImage.webp&amp;w=3840"></a>' +
      '<a href="/peliculas/la-leyenda-del-rey-mono-el-regreso-del-heroe"><img alt="La Leyenda del Rey Mono: El Regreso del Héroe" src="https://donghualife.com/_next/image?q=75&amp;url=%2Fimages%2Flegacy%2Fla-leyenda-del-rey-mono-el-regreso-del-heroe__coverImage__892e9c632c77.jpg&amp;w=3840"></a>';
    return {ok:true,status:200,async text(){return body;},async json(){return JSON.parse(body);}};
  }
  throw new Error('URL inesperada en prueba de portadas Next.js: ' + url);
};
const nextImageMovies = await posterPlugin.browse('peliculas', null);
assert.equal(nextImageMovies.items[0].poster, 'https://donghualife.com/images/webp/lord-legend-ravaging-dynasties__bannerImage.webp',
  'L.O.R.D debe usar la imagen original y no la URL del optimizador Next.js');
assert.equal(nextImageMovies.items[1].poster, 'https://donghualife.com/images/legacy/la-leyenda-del-rey-mono-el-regreso-del-heroe__coverImage__892e9c632c77.jpg',
  'La Leyenda del Rey Mono debe usar la imagen original y no la URL del optimizador Next.js');

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

 // Las temporadas deben seguir la distribución real de la ficha: 53, 52, 52 y 29.
const seasonFixture = (season, count) => '<h1>Shrouding the Heavens</h1><h2>Sinopsis</h2><p>Una aventura.</p>' +
  Array.from({length:count}, (_, i) => '<a href="/watch/shrouding-heavens-' + season + '-' + (i + 1) + '">' +
    (season === 2 && i === 0 ? 'Capítulo 1 Temporada 1' : season === 2 && i === 1 ? 'Capítulo 2 siguiente' : 'Capítulo ' + (i + 1)) + '</a>').join('');
const seasonPlugin = await import('../plugin.js?seasons-regression=1');
globalThis.kino.fetch = async (input) => {
  const url = String(input);
  if (url === 'https://donghualife.com/series/shrouding-heavens') {
    const body = '<h1>Shrouding the Heavens</h1><p>4 Temporadas</p>' + seasonFixture(1, 53);
    return {ok:true,status:200,async text(){return body;},async json(){return {};}};
  }
  const match = /^https:\/\/donghualife\.com\/watch\/shrouding-heavens-(\d+)-1$/.exec(url);
  if (match) {
    const counts = {1:53, 2:52, 3:52, 4:29};
    const season = Number(match[1]);
    const body = seasonFixture(season, counts[season]);
    return {ok:true,status:200,async text(){return body;},async json(){return {};}};
  }
  throw new Error('URL inesperada en prueba de temporadas: ' + url);
};
const seasonOne = await seasonPlugin.episodes('shrouding-heavens');
assert.equal(seasonOne.seasons.length, 4, 'Debe exponer las cuatro temporadas declaradas por la web');
assert.deepEqual(seasonOne.seasons.map((item) => item.title), ['Temporada 1','Temporada 2','Temporada 3','Temporada 4']);
assert.equal(seasonOne.episodes.length, 53, 'La temporada 1 debe conservar sus 53 episodios');
assert.equal(seasonOne.seasons.filter((item) => item.current).length, 1);
assert.equal(seasonOne.seasons[0].current, true);
const seasonTwo = await seasonPlugin.episodes(seasonOne.seasons[1].ref);
assert.equal(seasonTwo.episodes.length, 52, 'La temporada 2 debe mostrar solo sus 52 episodios');
assert.ok(seasonTwo.episodes.every((item) => item.season === 2), 'La temporada 2 no debe mezclar capítulos de otras temporadas');
assert.equal(seasonTwo.episodes[0].title, 'Capítulo 1', 'El primer capítulo de temporada no debe arrastrar el texto «Temporada 1»');
assert.equal(seasonTwo.episodes[1].title, 'Capítulo 2', 'Los capítulos no deben arrastrar etiquetas vecinas como «siguiente»');
assert.equal(seasonTwo.seasons.find((item) => item.number === 2).current, true);
const seasonFour = await seasonPlugin.episodes(seasonOne.seasons[3].ref);
assert.equal(seasonFour.episodes.length, 29, 'La temporada 4 debe mostrar solo sus 29 episodios');
assert.ok(seasonFour.episodes.every((item) => item.season === 4), 'La temporada 4 no debe mezclar capítulos de otras temporadas');
assert.equal(seasonFour.seasons.find((item) => item.number === 4).current, true);

console.log('Prueba simulada correcta: catálogo, búsqueda, episodios, reproducción, paginación de películas, recuperación de fichas y separación de temporadas.');
