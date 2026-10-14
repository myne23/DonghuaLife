/// <reference path="./kino.d.ts" />
// Fuente de donghua para Kino. Usa páginas públicas y fuentes enlazadas por el propio sitio.
// No intenta saltarse cuentas, CAPTCHA, restricciones de acceso ni reproductores protegidos.

const BASE = "https://donghualife.com";
const SERIES = BASE + "/series";
const OK = "https://ok.ru";
const MAX_HOME = 30;
const MAX_PAGE = 50;

function log(...args) {
  try { kino.log(...args); } catch {}
}

async function getText(url, options) {
  let lastError;
  const urls = [String(url)];
  // El dominio principal devuelve 502 intermitentes desde el runtime de Kino aunque
  // el mismo contenido esté disponible en beta. Probar ambos hosts evita dejar Inicio vacío.
  if (String(url).startsWith(BASE)) {
    const fallback = "https://beta.donghualife.com" + String(url).slice(BASE.length);
    if (fallback !== String(url)) urls.push(fallback);
  }
  const fast = Boolean(options && options.fast);
  const requestOptions = { ...(options || {}) };
  delete requestOptions.fast;
  const headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    ...(options && options.headers ? options.headers : {})
  };
  // Home can have a shorter UI deadline than opening the dedicated plugin section.
  // Its fast mode tries the primary host and the beta fallback once each, without
  // three rounds of retries that can leave the global Home without plugin rows.
  for (let attempt = 0; attempt < (fast ? 1 : 3); attempt++) {
    for (const candidate of urls) {
      let response;
      try {
        response = await kino.fetch(candidate, { ...requestOptions, headers });
      } catch (error) {
        lastError = error;
        continue;
      }
      if (response.ok) return response.text();
      lastError = new Error("El sitio respondió " + response.status);
      if (![502, 503, 504].includes(response.status)) throw lastError;
    }
    if (attempt < 2) {
      // Back off before trying both hosts again; immediate retries often hit the same gateway error.
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError || new Error("No se pudo leer la página");
}
function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function textOf(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])([\\s\\S]*?)\\1", "i");
  const match = re.exec(tag);
  return match ? decodeHtml(match[2]).trim() : "";
}

function absolute(url, base) {
  try { return new URL(decodeHtml(url), base || BASE).href; } catch { return ""; }
}

function slugFromUrl(url) {
  const match = /\/series\/([a-z0-9-]+)/i.exec(String(url || ""));
  return match ? match[1] : "";
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || !item.ref || seen.has(item.ref)) return false;
    seen.add(item.ref);
    return true;
  });
}

function parseSeries(html) {
  const bySlug = new Map();
  // Reunimos todos los enlaces a una ficha antes de elegir el mejor: la página repite
  // el mismo enlace en el título, la imagen y el botón «DETALLES».
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/series\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = absolute(match[2]);
    const slug = slugFromUrl(url);
    if (!slug || slug === "series") continue;
    const inner = match[3];
    const imgMatch = /<img\b[^>]*>/i.exec(inner);
    const img = imgMatch ? imgMatch[0] : "";
    let title = attr(img, "alt") || attr(img, "title") || "";
    const innerText = textOf(inner);
    if (!title && innerText && !/^(ver ahora|detalles|ver detalles|ver ahora detalles|ver m[aá]s|play)$/i.test(innerText)) title = innerText;
    // El enlace de acción no tiene el nombre de la serie; buscar texto útil en el
    // bloque cercano y metadatos habituales de tarjetas.
    const around = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, re.lastIndex + 1800));
    if (!title || /^(ver ahora|detalles|ver detalles|ver ahora detalles|ver m[aá]s|play)$/i.test(title)) {
      const heading = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(around);
      const labelled = /(?:data-title|aria-label|title)\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
      title = (labelled && labelled[2]) || (heading && textOf(heading[1])) || title;
    }
    const badTitle = !title || /^(ver ahora|detalles|ver detalles|ver ahora detalles|ver m[aá]s|play|series|donghuas|todas|popular|reciente|a-z)$/i.test(title.trim());
    const posterRaw = attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "data-original") || attr(img, "src") ||
      /(?:background-image)\s*:\s*url\((["']?)([^)"']+)\1\)/i.exec(match[0])?.[2] || "";
    const candidate = {
      id: slug, ref: slug, title: (badTitle ? slug.replace(/-/g, " ") : title).slice(0, 200),
      kind: "series", poster: posterRaw ? absolute(posterRaw) : undefined,
      backdrop: posterRaw ? absolute(posterRaw) : undefined, genres: ["anime"]
    };
    const prior = bySlug.get(slug);
    const score = (x) => (x.poster ? 4 : 0) + (/detalles|ver ahora|play/i.test(x.title) ? -10 : 0) + (x.title.toLowerCase() !== slug.replace(/-/g, " ") ? 2 : 0);
    if (!prior || score(candidate) > score(prior)) bySlug.set(slug, candidate);
  }
  // El inicio tiene un banner destacado que no siempre está dentro de un enlace /series/.
  // Si todavía no apareció como tarjeta, recuperamos el título desde los metadatos de la página.
  const ogTitle = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html);
  const ogImage = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html);
  const heroLink = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/series\/[^"']+)\1[^>]*>[\s\S]{0,5000}?<\/a>/i.exec(html);
  if (heroLink && ogTitle) {
    const slug = slugFromUrl(absolute(heroLink[2]));
    if (slug && !bySlug.has(slug)) {
      const image = ogImage ? absolute(ogImage[1]) : "";
      bySlug.set(slug, { id: slug, ref: slug, title: textOf(ogTitle[1]).slice(0, 200), kind: "series",
        poster: image || undefined, backdrop: image || undefined, genres: ["anime"] });
    }
  }
  return Array.from(bySlug.values()).slice(0, MAX_PAGE);
}
function seriesUrl(ref) {
  const slug = slugFromUrl(ref) || String(ref || "").replace(/^series:/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9-]{1,180}$/i.test(slug)) return "";
  return SERIES + "/" + slug;
}

function parseInfo(html, slug) {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = h1 ? textOf(h1[1]) : slug.replace(/-/g, " ");
  const images = html.match(/<img\b[^>]*>/gi) || [];
  let poster = "";
  const og = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html);
  if (og) poster = absolute(og[1]);
  for (const img of images) {
    if (!poster && /poster|cover|portada|logo|banner/i.test(attr(img, "alt") + " " + attr(img, "class"))) {
      poster = attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "data-original") || attr(img, "src");
      if (poster) break;
    }
  }
  if (!poster && images[0]) poster = attr(images[0], "data-src") || attr(images[0], "data-lazy-src") || attr(images[0], "data-original") || attr(images[0], "src");
  let overview;
  const synopsisAt = html.search(/sinopsis|descripci[oó]n/i);
  if (synopsisAt >= 0) {
    const block = html.slice(synopsisAt, synopsisAt + 2500);
    const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    if (p) overview = textOf(p[1]).slice(0, 500) || undefined;
  }
  const year = /(?:19|20)\d{2}/.exec(textOf(html.slice(0, 12000)));
  return { title: title.slice(0, 200), poster: poster ? absolute(poster) : undefined, backdrop: poster ? absolute(poster) : undefined, overview, year: year ? year[0] : undefined };
}

function parseEpisodes(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/watch\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && out.length < 2000) {
    const url = absolute(match[2], pageUrl);
    let path;
    try { path = new URL(url).pathname; } catch { continue; }
    if (seen.has(path)) continue;
    // DonghuaLife usa tanto /watch/titulo-1-5 como el formato nuevo
    // /watch/<id>-temporada-1-5. Aceptamos ambos.
    const m = /-temporada-(\d{1,3})-(\d{1,4})\/?$/i.exec(path) ||
      /-(\d{1,3})-(\d{1,4})\/?$/.exec(path);
    if (!m) continue;
    const season = Number(m[1]), number = Number(m[2]);
    if (season < 1 || number < 1) continue;
    let label = textOf(match[3]);
    label = label.replace(/\b(?:fuentes?|subt[ií]tulos?|vip)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!label || /cap[ií]tulo|episodio|^\d+$/i.test(label) || label.length > 100) {
      label = "Capítulo " + number;
    } else {
      label = "Capítulo " + number + " · " + label;
    }
    out.push({ season, number, ref: path, title: label.slice(0, 180) });
    seen.add(path);
  }
  return out.sort((a, b) => a.season - b.season || a.number - b.number);
}
function parseEmbed(html, pageUrl) {
  const re = /<(?:iframe|video|source)\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = absolute(match[2], pageUrl);
    if (url && (/\.(?:mp4|webm|m3u8)(?:[?#]|$)/i.test(url) || /(^|\/\/)([^/]+\.)?ok\.ru\/(?:video|videoembed)\//i.test(url))) return url;
  }
  const raw = /(?:src|file|url)\s*[:=]\s*["']((?:https?:)?\/\/[^"']*(?:ok\.ru|\.m3u8|\.mp4|\.webm)[^"']*)["']/i.exec(html);
  return raw ? absolute(raw[1], pageUrl) : "";
}

function parsePlayerOptions(html) {
  const tags = html.match(/<[^>]+data-options\s*=\s*(?:"[\s\S]*?"|'[\s\S]*?')[^>]*>/gi) || [];
  for (const tag of tags) {
    const raw = attr(tag, "data-options");
    if (!raw) continue;
    try { return JSON.parse(raw); } catch {}
    try { return JSON.parse(decodeHtml(raw)); } catch {}
  }
  return null;
}

async function resolveOkru(embedUrl) {
  const match = /\/video(?:embed)?\/(\d+)/i.exec(embedUrl);
  if (!match) throw new Error("El enlace de OK.ru no contiene un identificador de video");
  const embed = OK + "/videoembed/" + match[1];
  const html = await getText(embed, { headers: { Referer: OK + "/" } });
  const player = parsePlayerOptions(html);
  if (!player || !player.flashvars) throw new Error("OK.ru no entregó los datos del reproductor");
  let metadata = player.flashvars.metadata;
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(decodeHtml(metadata)); } catch { metadata = null; }
  }
  if (!metadata && player.flashvars.metadataUrl) {
    try {
      const metadataUrl = absolute(player.flashvars.metadataUrl, OK);
      metadata = JSON.parse(await getText(metadataUrl, { headers: { Referer: OK + "/" } }));
    } catch (e) { log("No se pudieron leer los metadatos de OK.ru", e.message); }
  }
  const videos = metadata && Array.isArray(metadata.videos) ? metadata.videos.slice() : [];
  const rank = (v) => {
    const quality = String(v.name || v.quality || "").toLowerCase();
    if (/1080|full/.test(quality)) return 0;
    if (/720|hd/.test(quality)) return 1;
    if (/480|sd/.test(quality)) return 2;
    return 3;
  };
  videos.sort((a, b) => rank(a) - rank(b));
  const direct = videos.find((v) => typeof v.url === "string" && /^https:\/\//i.test(v.url) && /\.(?:mp4|webm)(?:[?#]|$)/i.test(v.url));
  if (direct) return { url: direct.url, mime: /\.webm(?:[?#]|$)/i.test(direct.url) ? "video/webm" : "video/mp4", headers: { Referer: OK + "/", Origin: OK } };
  const hls = metadata && (metadata.hlsMasterPlaylistUrl || metadata.hlsManifestUrl || metadata.ondemandHls || metadata.hlsMasterUrl);
  if (typeof hls === "string" && /^https:\/\//i.test(hls)) {
    return { url: hls, mime: "application/vnd.apple.mpegurl", headers: { Referer: OK + "/", Origin: OK } };
  }
  const other = videos.find((v) => typeof v.url === "string" && /^https:\/\//i.test(v.url));
  if (other) return { url: other.url, mime: "video/mp4", headers: { Referer: OK + "/", Origin: OK } };
  throw new Error("OK.ru no ofreció una fuente compatible");
}

function normalizeSearch(value) {
  const text = String(value || "").toLowerCase();
  return (typeof text.normalize === "function" ? text.normalize("NFD") : text)
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function search(query) {
  await null;
  const term = String((typeof query === "string" ? query : query && (query.q || query.originalTitle || query.title)) || "").trim();
  if (!term) return [];
  const wanted = normalizeSearch(term);
  const words = wanted.split(/\s+/).filter(Boolean);
  const matches = (item) => {
    const haystack = normalizeSearch(item.title + " " + item.id + " " + item.ref);
    return haystack.includes(wanted) || (words.length > 1 && words.every((word) => haystack.includes(word)));
  };

  // Consultamos de a una página para no disparar cuatro solicitudes simultáneas al sitio.
  // Algunos servidores responden 502 cuando reciben varias peticiones seguidas desde el mismo cliente.
  // En cuanto encontramos coincidencias, devolvemos resultados sin pedir páginas innecesarias.
  const urls = [
    SERIES,
    SERIES + "?page=2",
    SERIES + "?page=3",
    BASE + "/"
  ];
  const collected = [];
  for (const url of urls) {
    try {
      const items = parseSeries(await getText(url));
      collected.push(...items);
      const found = unique(collected.filter(matches)).slice(0, MAX_PAGE);
      if (found.length) return found;
    } catch (e) {
      log("No se pudo consultar una página de búsqueda", e.message);
    }
  }
  return [];
}

function sectionSlice(html, headingPattern, maxChars) {
  const headings = Array.from(String(html || "").matchAll(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi));
  let match = null;
  for (const heading of headings) {
    if (new RegExp(headingPattern, "i").test(textOf(heading[0]))) {
      match = { index: heading.index, end: heading.index + heading[0].length };
      break;
    }
  }
  if (!match) return "";
  const limit = Math.min(String(html || "").length, match.end + (maxChars || 60000));
  // Las tarjetas suelen tener su propio <h3>. No debemos cortar la sección al llegar
  // al título de la primera tarjeta: solo termina cuando aparece otro encabezado de sección.
  const sectionHeading = /(?:últimos? episodios|estrenos? vip|te recomendamos para vos|recomendados|destacados|tendencias|catálogo|películas|rankings?|calendario|noticias|géneros|votaciones)/i;
  for (const heading of headings) {
    if (heading.index <= match.index || heading.index >= limit) continue;
    if (sectionHeading.test(textOf(heading[0]))) return String(html).slice(match.end, heading.index);
  }
  return String(html).slice(match.end, limit);
}
function parseLatestSeries(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/watch\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && out.length < MAX_PAGE) {
    const url = absolute(match[2]);
    let path = "";
    try { path = new URL(url).pathname; } catch { continue; }
    // La web pasó a identificadores opacos con el sufijo -temporada-1-5.
    // Conservamos compatibilidad con el formato anterior titulo-1-5.
    const routeMatch = /\/watch\/(.+?)-temporada-(\d{1,3})-(\d{1,4})\/?$/i.exec(path) ||
      /\/watch\/(.+?)-(\d{1,3})-(\d{1,4})\/?$/i.exec(path);
    if (!routeMatch) continue;

    const around = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, re.lastIndex + 1800));
    const innerImg = /<img\b[^>]*>/i.exec(match[3]);
    const aroundImg = /<img\b[^>]*>/i.exec(around);
    const img = innerImg ? innerImg[0] : (aroundImg ? aroundImg[0] : "");
    const posterRaw = attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "data-original") || attr(img, "src");

    const seriesLink = /href\s*=\s*(["'])([^"']*\/series\/[^"']+)\1/i.exec(around);
    let title = attr(img, "alt") || attr(img, "title") || "";
    if (!title) {
      const titleAttr = /(?:data-title|aria-label)\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
      if (titleAttr) title = titleAttr[2];
    }
    if (!title) {
      title = textOf(match[3])
        .replace(/^\s*EP\s*\d+\s*/i, "")
        .replace(/\b(?:capítulo|episodio)\s*\d+\b/ig, "")
        .replace(/\bVIP\b/ig, "")
        .replace(/\d{1,2}\s+[a-záéíóú]+\s+\d{4}.*$/i, "")
        .trim();
    }
    if (!title) {
      const heading = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(around);
      if (heading) title = textOf(heading[1]);
    }
    title = textOf(title)
      .replace(/^recomendado\s+/i, "")
      .replace(/\bEP\s*\d+\b/ig, "")
      .replace(/\b(?:capítulo|episodio)\s*\d+\b/ig, "")
      .replace(/\s+/g, " ")
      .trim();
    // El texto de la tarjeta tiene prioridad: el bloque vecino puede contener enlaces
    // a otras series y no debemos asignar por accidente la ficha de otra tarjeta.
    let slug = title ? normalizeSearch(title).replace(/\s+/g, "-") : "";
    if (!slug && seriesLink) slug = slugFromUrl(absolute(seriesLink[2]));
    if (!slug || !title) continue;
    if (seen.has(slug)) continue;
    out.push({
      id: slug,
      ref: slug,
      title: title.slice(0, 200),
      kind: "series",
      poster: posterRaw ? absolute(posterRaw) : undefined,
      backdrop: posterRaw ? absolute(posterRaw) : undefined,
      genres: ["anime"]
    });
    seen.add(slug);
  }
  return out;
}
function parseHomeRows(homeHtml, latestHtml, catalogHtml) {
  const allHome = unique(parseSeries(homeHtml));
  const allCatalog = unique(parseSeries(catalogHtml || ""));
  const allAvailable = unique(allCatalog.concat(allHome));

  // Extraer cada carrusel por su encabezado real. sectionSlice ignora los h3 de las
  // tarjetas, que antes podían truncar cada sección después del primer elemento.
  const latestSection = sectionSlice(homeHtml, "últimos episodios", 60000);
  const vipSection = sectionSlice(homeHtml, "estrenos vip", 60000);
  const featuredSection = sectionSlice(homeHtml, "(?:te recomendamos para vos|recomendados|destacados)", 65000);
  const trendsSection = sectionSlice(homeHtml, "tendencias", 45000);

  let featured = unique(parseSeries(featuredSection));
  if (featured.length < 3) featured = allHome.slice(0, 10);
  featured = featured.slice(0, MAX_HOME);

  // Priorizar los episodios visibles en Inicio; la página separada queda como respaldo.
  let latest = unique(parseLatestSeries(latestSection));
  if (latest.length < 3) latest = unique(latest.concat(parseLatestSeries(latestHtml || "")));
  if (!latest.length) latest = unique(parseLatestSeries(homeHtml));
  latest = latest.filter((x) => !featured.some((y) => y.id === x.id)).slice(0, MAX_HOME);

  let vip = unique(parseLatestSeries(vipSection));
  vip = vip.filter((x) => !featured.some((y) => y.id === x.id) &&
    !latest.some((y) => y.id === x.id)).slice(0, MAX_HOME);

  let trends = unique(parseSeries(trendsSection));
  if (trends.length < 3) trends = allAvailable;
  trends = trends.filter((x) => !featured.some((y) => y.id === x.id) &&
    !latest.some((y) => y.id === x.id) && !vip.some((y) => y.id === x.id)).slice(0, MAX_HOME);

  return [
    { id: "destacados", ref: "destacados", title: "DL 0.1.17 · Recomendados para vos", genre: "anime", items: featured },
    { id: "ultimos-episodios", ref: "ultimos-episodios", title: "DL 0.1.17 · Últimos episodios", genre: "anime", items: latest },
    { id: "estrenos-vip", ref: "estrenos-vip", title: "DL 0.1.17 · Estrenos VIP", genre: "anime", items: vip },
    { id: "tendencias", ref: "tendencias", title: "DL 0.1.17 · Tendencias", genre: "anime", items: trends },
    { id: "series", ref: "series", title: "DL 0.1.17 · Todas las series", genre: "anime", items: allCatalog.slice(0, MAX_HOME) }
  ].filter((row) => row.items.length);
}
function splitCatalog(catalogHtml) {
  const items = unique(parseSeries(catalogHtml)).slice().sort((a, b) =>
    normalizeSearch(a.title).localeCompare(normalizeSearch(b.title))
  );
  if (items.length < 2) return { first: items, second: [] };
  // La mitad alfabética de un catálogo real puede quedar vacía; dividir por orden
  // de título garantiza dos carruseles útiles incluso si el sitio concentra sus títulos.
  const middle = Math.ceil(items.length / 2);
  return { first: items.slice(0, middle), second: items.slice(middle) };
}

export async function home() {
  // El Inicio general puede tener menos tiempo para cargar que la sección del plugin.
  // Consultamos solo el catálogo y usamos un único intento por host: no esperamos
  // además una segunda página (la portada) ni rondas largas de reintentos.
  let catalogHtml = "";
  try { catalogHtml = await getText(SERIES, { fast: true }); }
  catch (e) { log("No se pudo cargar el catálogo para Inicio", e.message); }

  const catalog = unique(parseSeries(catalogHtml)).slice(0, MAX_PAGE);
  const featured = catalog.slice(0, MAX_HOME);
  const split = splitCatalog(catalogHtml);
  const rows = [
    { id: "destacados", ref: "destacados", title: "PRUEBA 0.1.21 · Destacados", genre: "anime", items: featured },
    { id: "catalogo-a", ref: "catalogo-a", title: "PRUEBA 0.1.21 · Catálogo A–M", genre: "anime", items: split.first.slice(0, MAX_HOME) },
    { id: "catalogo-b", ref: "catalogo-b", title: "PRUEBA 0.1.21 · Catálogo N–Z", genre: "anime", items: split.second.slice(0, MAX_HOME) },
    { id: "series", ref: "series", title: "PRUEBA 0.1.21 · Todas las series", genre: "anime", items: catalog.slice(0, MAX_HOME) }
  ].filter((row) => row.items.length > 0);
  if (rows.length > 1) return rows;

  // Si el parser no encuentra fichas, devolver un error explícito es más útil que
  // presentar un falso Home con una única categoría vacía.
  log("Home de diagnóstico: no se pudieron extraer suficientes fichas del catálogo");
  return rows;
}

// Sección propia de Kino: aparece como una entrada separada en Inicio
// (chip en celular y entrada lateral en TV), en vez de depender de la categoría global Anime.
export async function section({ tab }) {
  const tabs = [
    { id: "inicio", label: "Inicio" },
    { id: "destacados", label: "Destacados" },
    { id: "catalogo-a", label: "Catálogo A–M" },
    { id: "catalogo-b", label: "Catálogo N–Z" },
    { id: "series", label: "Todas las series" }
  ];
  const chosen = tabs.some((entry) => entry.id === tab) ? tab : "inicio";
  const rows = await home();
  const selectedRows = chosen === "inicio"
    ? rows
    : rows.filter((row) => row.id === chosen);
  return { tabs, tab: chosen, rows: selectedRows };
}

// Categorías del plugin (API 6): son mosaicos dentro de la pestaña del plugin,
// distintos de las filas home() que se agregan al Inicio global de Kino.
export async function categories() {
  return [
    { id: "destacados", title: "Destacados", ref: "destacados" },
    { id: "catalogo-a", title: "Catálogo A–M", ref: "catalogo-a" },
    { id: "catalogo-b", title: "Catálogo N–Z", ref: "catalogo-b" },
    { id: "series", title: "Todas las series", ref: "series" }
  ];
}

export async function browse(ref, cursor) {
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw kino.error("not_found", "La página solicitada no existe");
  if (ref === "destacados" || ref === "catalogo-a" || ref === "catalogo-b" || ref === "series") {
    const html = await getText(SERIES + (page > 1 ? "?page=" + page : ""));
    const catalog = unique(parseSeries(html));
    if (ref === "series") return { items: catalog, next: catalog.length === MAX_PAGE && page < 100 ? String(page + 1) : undefined };
    if (ref === "destacados") {
      const homeHtml = await getText(BASE + "/").catch(() => "");
      const featured = unique(parseSeries(homeHtml));
      return { items: (featured.length >= 3 ? featured : catalog).slice(0, MAX_PAGE) };
    }
    const split = splitCatalog(html);
    return { items: (ref === "catalogo-a" ? split.first : split.second).slice(0, MAX_PAGE) };
  }
  throw kino.error("not_found", "La categoría solicitada no existe");
}

export async function episodes(ref) {
  const url = seriesUrl(ref);
  if (!url) throw kino.error("not_found", "No se encontró la serie");
  const html = await getText(url);
  const slug = slugFromUrl(url);
  const info = parseInfo(html, slug);
  const list = parseEpisodes(html, url);
  if (!list.length) throw kino.error("not_found", "No se encontraron episodios en la ficha pública");
  info.title = "PRUEBA 0.1.21 · " + info.title;
  return { series: info, episodes: list };
}

export async function resolve(ref) {
  const path = String(ref || "");
  const url = absolute(path.startsWith("/") ? path : "/" + path);
  if (!url || !/^https:\/\/donghualife\.com\/watch\//i.test(url)) throw kino.error("not_found", "El episodio no es válido");
  const html = await getText(url);
  if (/solo\s+para\s+vip|requiere\s+(?:una\s+)?suscripci[oó]n|inicia\s+sesi[oó]n\s+para\s+ver/i.test(textOf(html))) {
    throw kino.error("unavailable", "Este episodio requiere acceso en el sitio");
  }
  const embed = parseEmbed(html, url);
  if (!embed) throw kino.error("unavailable", "La página no mostró una fuente de reproducción reconocida");
  if (/\.(?:mp4|webm)(?:[?#]|$)/i.test(embed)) {
    return { url: embed, mime: /\.webm(?:[?#]|$)/i.test(embed) ? "video/webm" : "video/mp4" };
  }
  if (/ok\.ru\/(?:video|videoembed)\//i.test(embed)) {
    try { return await resolveOkru(embed); }
    catch (e) { log("No se pudo resolver OK.ru", e.message); }
  }
  throw kino.error("unavailable", "No se pudo obtener una fuente directa compatible con Kino");
}
