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
function splitCatalog(catalogHtml) {
  const items = unique(parseSeries(catalogHtml)).slice().sort((a, b) =>
    normalizeSearch(a.title).localeCompare(normalizeSearch(b.title))
  );
  if (items.length < 2) return { first: items, second: [] };
  const middle = Math.ceil(items.length / 2);
  return { first: items.slice(0, middle), second: items.slice(middle) };
}

function parseFinishedSeries(html) {
  const source = String(html || "");
  return unique(parseSeries(source)).filter((item) => {
    const at = source.indexOf("/series/" + item.ref);
    if (at < 0) return false;
    const cardStart = source.lastIndexOf("<article", at);
    const cardEnd = source.indexOf("</article>", at);
    if (cardStart >= 0 && cardEnd > at) {
      return /finalizad[oa]|completad[oa]|terminad[oa]/i.test(source.slice(cardStart, cardEnd + 10));
    }
    const from = Math.max(0, at - 260);
    const nearby = source.slice(from, Math.min(source.length, at + 260));
    let closest = Infinity;
    const status = /finalizad[oa]|completad[oa]|terminad[oa]/gi;
    let match;
    while ((match = status.exec(nearby))) {
      closest = Math.min(closest, Math.abs((from + match.index) - at));
    }
    return closest <= 650;
  });
}

function parseMovieItems(html) {
  const source = String(html || "");
  const section = sectionSlice(source, "(?:pel[ií]culas|pelis\\s+donghuas|donghua\\s+movies)", 70000) || source;
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(section)) && out.length < MAX_PAGE) {
    const url = absolute(match[2]);
    let path = "";
    try { path = new URL(url).pathname; } catch { continue; }
    const segments = path.split("/").filter(Boolean);
    if (seen.has(path) || segments.length < 2 || /\/(?:series|watch)\//i.test(path) ||
        /\/(?:peliculas?|movies?|index\.php)\/?$/i.test(path)) continue;
    const imgMatch = /<img\b[^>]*>/i.exec(match[3]);
    const img = imgMatch ? imgMatch[0] : "";
    const title = attr(img, "alt") || attr(img, "title") || textOf(match[3]);
    if (!title || /^(ver ahora|detalles|play)$/i.test(title)) continue;
    const posterRaw = attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "data-original") || attr(img, "src");
    const slug = path.split("/").filter(Boolean).pop();
    out.push({ id: slug, ref: path, title: title.slice(0, 200), kind: "movie",
      poster: posterRaw ? absolute(posterRaw) : undefined,
      backdrop: posterRaw ? absolute(posterRaw) : undefined });
    seen.add(path);
  }
  return out;
}

function mapToCatalog(parsed, catalog) {
  const normalized = catalog.map((item) => ({ item, title: normalizeSearch(item.title) }));
  const result = [];
  for (const candidate of parsed) {
    const title = normalizeSearch(candidate.title);
    const found = normalized.find((entry) => entry.title === title ||
      (title.length > 5 && entry.title.includes(title)) ||
      (entry.title.length > 5 && title.includes(entry.title)));
    const item = found ? found.item : candidate;
    if (!result.some((prior) => prior.ref === item.ref)) result.push(item);
  }
  return result;
}

export async function home() {
  let homeHtml = "";
  let catalogHtml = "";
  let moviesHtml = "";
  try { homeHtml = await getText(BASE + "/", { fast: true }); }
  catch (e) { log("No se pudo cargar el Inicio del sitio", e.message); }
  try { catalogHtml = await getText(SERIES + "?sort=az", { fast: true }); }
  catch (e) { log("No se pudo cargar el catálogo para Inicio", e.message); }
  try { moviesHtml = await getText(BASE + "/movies?page=0", { fast: true }); }
  catch (e) {
    log("No se pudo cargar el catálogo directo de películas", e.message);
    try { moviesHtml = await getText(BASE + "/genres/Acción", { fast: true }); }
    catch (fallbackError) { log("No se pudo cargar el respaldo de películas", fallbackError.message); }
  }

  const catalog = unique(parseSeries(catalogHtml));
  const latestSection = sectionSlice(homeHtml, "últimos? episodios", 60000);
  const trendsSection = sectionSlice(homeHtml, "tendencias", 45000);
  let latest = mapToCatalog(unique(parseLatestSeries(latestSection)), catalog).slice(0, MAX_HOME);
  if (!latest.length) latest = mapToCatalog(unique(parseSeries(latestSection)), catalog).slice(0, MAX_HOME);
  const trends = mapToCatalog(unique(parseSeries(trendsSection)), catalog).slice(0, MAX_HOME);
  const finished = parseFinishedSeries(catalogHtml).slice(0, MAX_HOME);
  const movies = parseMovieItems(moviesHtml).slice(0, MAX_HOME);
  const alphabetic = catalog.slice().sort((a, b) =>
    normalizeSearch(a.title).localeCompare(normalizeSearch(b.title))
  ).slice(0, MAX_HOME);

  return [
    { id: "ultimos-episodios", ref: "ultimos-episodios", title: "Últimos Episodios", items: latest },
    { id: "tendencias", ref: "tendencias", title: "Tendencias", items: trends },
    { id: "series-finalizadas", ref: "series-finalizadas", title: "Series Finalizadas", items: finished },
    { id: "peliculas", ref: "peliculas", title: "Películas", items: movies },
    { id: "catalogo-az", ref: "catalogo-az", title: "Catálogo completo A-Z", items: alphabetic }
  ].filter((row) => row.items.length > 0);
}

// Sección propia de Kino: aparece como una entrada separada en Inicio
// (chip en celular y entrada lateral en TV), en vez de depender de la categoría global Anime.
export async function section({ tab }) {
  const tabs = [
    { id: "inicio", label: "Inicio" },
    { id: "ultimos-episodios", label: "Últimos Episodios" },
    { id: "tendencias", label: "Tendencias" },
    { id: "series-finalizadas", label: "Series Finalizadas" },
    { id: "peliculas", label: "Películas" },
    { id: "catalogo-az", label: "Catálogo completo A-Z" }
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
    { id: "ultimos-episodios", title: "Últimos Episodios", ref: "ultimos-episodios" },
    { id: "tendencias", title: "Tendencias", ref: "tendencias" },
    { id: "series-finalizadas", title: "Series Finalizadas", ref: "series-finalizadas" },
    { id: "peliculas", title: "Películas", ref: "peliculas" },
    { id: "catalogo-az", title: "Catálogo completo A-Z", ref: "catalogo-az" }
  ];
}

export async function browse(ref, cursor) {
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw kino.error("not_found", "La página solicitada no existe");

  if (ref === "peliculas") {
    let html = "";
    try { html = await getText(BASE + "/movies?page=" + (page - 1)); }
    catch (e) {
      if (page !== 1) throw e;
      html = await getText(BASE + "/genres/Acción");
    }
    const items = parseMovieItems(html);
    return { items, next: items.length === MAX_PAGE && page < 100 ? String(page + 1) : undefined };
  }

  if (ref === "ultimos-episodios" || ref === "tendencias") {
    const homeHtml = await getText(BASE + "/");
    const catalogHtml = await getText(SERIES + (page > 1 ? "?page=" + page : ""));
    const catalog = unique(parseSeries(catalogHtml));
    const sectionHtml = sectionSlice(homeHtml,
      ref === "ultimos-episodios" ? "últimos? episodios" : "tendencias",
      ref === "ultimos-episodios" ? 60000 : 45000);
    const parsed = ref === "ultimos-episodios"
      ? unique(parseLatestSeries(sectionHtml))
      : unique(parseSeries(sectionHtml));
    const items = mapToCatalog(parsed, catalog).slice(0, MAX_PAGE);
    return { items, next: items.length === MAX_PAGE && page < 100 ? String(page + 1) : undefined };
  }

  if (ref === "series-finalizadas" || ref === "catalogo-az") {
    const html = await getText(SERIES + "?sort=az" + (page > 1 ? "&page=" + page : ""));
    const catalog = unique(parseSeries(html));
    const items = ref === "series-finalizadas"
      ? parseFinishedSeries(html)
      : catalog.slice().sort((a, b) => normalizeSearch(a.title).localeCompare(normalizeSearch(b.title)));
    return { items: items.slice(0, MAX_PAGE), next: items.length === MAX_PAGE && page < 100 ? String(page + 1) : undefined };
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
  return { series: info, episodes: list };
}

export async function resolve(ref) {
  const path = String(ref || "");
  let url = absolute(path.startsWith("/") ? path : "/" + path);
  if (!url || !/^https:\/\/donghualife\.com\//i.test(url)) {
    throw kino.error("not_found", "El episodio o película no es válido");
  }
  let html = await getText(url);
  if (!/\/watch\//i.test(url)) {
    const watch = /href\s*=\s*(["'])([^"']*\/watch\/[^"']+)\1/i.exec(html);
    if (watch) {
      url = absolute(watch[2], url);
      html = await getText(url);
    }
  }
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
