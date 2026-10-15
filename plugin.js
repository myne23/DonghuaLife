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

const responseCache = new Map();
const pendingRequests = new Map();
const RESPONSE_CACHE_TTL = 20000;
const RESPONSE_CACHE_LIMIT = 100;

async function getText(url, options) {
  const originalUrl = String(url);
  const referer = String(options && options.headers && options.headers.Referer || "");
  const cacheKey = originalUrl + "|" + referer;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.text;
  if (cached) responseCache.delete(cacheKey);
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const request = (async () => {
    let lastError;
    const urls = [originalUrl];
    // Si el dominio principal devuelve 502, probar el host beta una vez antes de fallar.
    if (originalUrl.startsWith(BASE)) {
      const fallback = "https://beta.donghualife.com" + originalUrl.slice(BASE.length);
      if (fallback !== originalUrl) urls.push(fallback);
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
    // Evitamos seis solicitudes consecutivas por página: un intento a cada host y,
    // solo si ambos fallan con 502/503/504, una segunda ronda.
    const attempts = fast ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      for (const candidate of urls) {
        let response;
        try {
          response = await kino.fetch(candidate, { ...requestOptions, headers });
        } catch (error) {
          lastError = error;
          continue;
        }
        if (response.ok) {
          const text = await response.text();
          responseCache.set(cacheKey, { text, expiresAt: Date.now() + RESPONSE_CACHE_TTL });
          while (responseCache.size > RESPONSE_CACHE_LIMIT) {
            responseCache.delete(responseCache.keys().next().value);
          }
          return text;
        }
        lastError = new Error("El sitio respondió " + response.status);
        if (![502, 503, 504].includes(response.status)) throw lastError;
      }
      if (attempt + 1 < attempts) {
        // Una única pausa corta solo cuando ambos hosts fallan.
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw lastError || new Error("No se pudo leer la página");
  })();
  pendingRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(cacheKey);
  }
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

// DonghuaLife sirve algunas portadas a través del optimizador de Next.js.
// Kino puede no resolver esa URL intermedia, así que usamos el archivo original
// indicado en el parámetro ?url= (por ejemplo /_next/image?url=%2Fimages%2Fwebp%2F...).
function posterUrl(raw, base) {
  const resolved = absolute(raw, base);
  if (!resolved) return "";
  try {
    const url = new URL(resolved);
    if (url.pathname.endsWith("/_next/image") || url.pathname === "/_next/image") {
      const original = url.searchParams.get("url");
      if (original) return new URL(original, url.origin).href;
    }
  } catch {}
  return resolved;
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
      kind: "series", poster: posterRaw ? posterUrl(posterRaw) : undefined,
      backdrop: posterRaw ? posterUrl(posterRaw) : undefined, genres: ["anime"]
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
      const image = ogImage ? posterUrl(ogImage[1]) : "";
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
  if (og) poster = posterUrl(og[1]);
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
  return { title: title.slice(0, 200), poster: poster ? posterUrl(poster) : undefined, backdrop: poster ? posterUrl(poster) : undefined, overview, year: year ? year[0] : undefined };
}

function parseEpisodes(html, pageUrl) {
  const out = [];
  const seen = new Set();
  // El rótulo del especial suele estar en la tarjeta de temporada (img alt/title),
  // mientras que el enlace del capítulo puede mostrar solo «Capítulo 152».
  const decodedPage = decodeHtml(String(html || ""));
  const specialLabelMatch = /(Peli(?:\s*Ep)?\s*\d+\s*-\s*\d+)/i.exec(decodedPage);
  const specialLabel = specialLabelMatch ? specialLabelMatch[1].replace(/\s+/g, " ").trim() : "";
  const specialRange = /Peli(?:\s*Ep)?\s*(\d+)\s*-\s*(\d+)/i.exec(specialLabel);
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/watch\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && out.length < 2000) {
    const url = absolute(match[2], pageUrl);
    let path;
    try { path = new URL(url).pathname; } catch { continue; }
    if (seen.has(path)) continue;
    const linkLabel = textOf(match[3]);
    // DonghuaLife usa tanto /watch/titulo-1-5 como el formato nuevo
    // /watch/<id>-temporada-1-5. Aceptamos ambos.
    const m = /-temporada-(\d{1,3})-(\d{1,4})\/?$/i.exec(path) ||
      /-(\d{1,3})-(\d{1,4})\/?$/.exec(path);
    if (!m) continue;

    const season = Number(m[1]), number = Number(m[2]);
    if (season < 1 || number < 1) continue;
    const innerImage = /<img\b[^>]*>/i.exec(match[3]);
    const imageLabel = innerImage ? (attr(innerImage[0], "alt") || attr(innerImage[0], "title")) : "";
    const explicitLabels = [linkLabel, imageLabel, attr(match[0], "aria-label"), attr(match[0], "title")];
    const explicitSpecial = explicitLabels.find((value) =>
      value && /^peli(?:\s*ep)?\s*\d+\s*-\s*\d+$/i.test(value.trim()));
    // Si el enlace del capítulo está rotulado genéricamente, la tarjeta de temporada
    // identifica el especial por el número final del rango (p. ej. Peli Ep 151- 152).
    const isSpecialSeason = Boolean(specialRange && season === Number(specialRange[2]) && season !== 1);
    const specialMovie = Boolean(explicitSpecial || isSpecialSeason || /\/watch\/[^/]*peli[^/]*\d+-\d+/i.test(path));
    let label = explicitSpecial || (specialMovie ? specialLabel : "") || linkLabel || imageLabel ||
      attr(match[0], "aria-label") || attr(match[0], "title") || "";
    if (specialMovie && !label) label = "Peli " + (specialRange ? specialRange[1] + "-" + specialRange[2] : season + "-" + number);
    label = specialMovie ? label.trim() : label.replace(/\b(?:fuentes?|subt[ií]tulos?|vip)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (specialMovie) {
      // Preservar literalmente el rótulo de la tarjeta, no convertir el especial en temporada 152.
    } else {
      // En las fichas de temporada, los enlaces pueden incluir texto vecino
      // como «Temporada 1» o «siguiente». El número de la ruta es la fuente fiable.
      label = "Capítulo " + number;
    }
    out.push({ season, number, ref: path, title: label.slice(0, 180), specialMovie });
    seen.add(path);
  }
  return out.sort((a, b) => a.season - b.season || a.number - b.number);
}
function parseEmbed(html, pageUrl) {
  const re = /<(?:iframe|video|source)\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = absolute(match[2], pageUrl);
    if (url && (/\.(?:mp4|webm|m3u8)(?:[?#]|$)/i.test(url) || /(?:doodstream\.com|dood\.to|dood\.so|dood\.watch|dood\.la|dood\.re|dood\.pm|dood\.wf|dood\.yt|doodstream\.co)\//i.test(url) ||
      /(^|\/\/)([^/]+\.)?ok\.ru\/(?:video|videoembed)\//i.test(url) ||
      /(^|\/\/)([^/]+\.)?(?:dailymotion\.com|dai\.ly)\/(?:embed\/video|video|player\/)/i.test(url))) return url;
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
  const directVideo = (v) => typeof v.url === "string" && /^https:\/\//i.test(v.url) && /\.(?:mp4|webm)(?:[?#]|$)/i.test(v.url);
  videos.sort((a, b) => rank(a) - rank(b));
  const headers = { Referer: OK + "/", Origin: OK };
  const videoAlternatives = (selectedUrl) => videos.filter((v) => directVideo(v) && v.url !== selectedUrl)
    .slice(0, 7).map((v) => ({
      url: v.url,
      mime: /\.webm(?:[?#]|$)/i.test(v.url) ? "video/webm" : "video/mp4",
      headers,
      label: ("OK.ru · " + String(v.name || v.quality || "Video")).slice(0, 48)
    }));
  const direct = videos.find(directVideo);
  const hls = metadata && (metadata.hlsMasterPlaylistUrl || metadata.hlsManifestUrl || metadata.ondemandHls || metadata.hlsMasterUrl);
  if (direct) {
    const result = {
      url: direct.url,
      mime: /\.webm(?:[?#]|$)/i.test(direct.url) ? "video/webm" : "video/mp4",
      headers,
      label: ("OK.ru · " + String(direct.name || direct.quality || "Video")).slice(0, 48)
    };
    result.alternatives = videoAlternatives(direct.url);
    if (typeof hls === "string" && /^https:\/\//i.test(hls) && hls !== direct.url) {
      result.alternatives.push({ url: hls, mime: "application/vnd.apple.mpegurl", headers, label: "OK.ru · HLS" });
    }
    if (!result.alternatives.length) delete result.alternatives;
    return result;
  }
  if (typeof hls === "string" && /^https:\/\//i.test(hls)) {
    const result = { url: hls, mime: "application/vnd.apple.mpegurl", headers, label: "OK.ru · HLS" };
    result.alternatives = videoAlternatives(hls);
    if (!result.alternatives.length) delete result.alternatives;
    return result;
  }
  const other = videos.find((v) => typeof v.url === "string" && /^https:\/\//i.test(v.url));
  if (other) {
    const result = { url: other.url, mime: "video/mp4", headers, label: "OK.ru · Video" };
    result.alternatives = videoAlternatives(other.url);
    if (!result.alternatives.length) delete result.alternatives;
    return result;
  }
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
      poster: posterRaw ? posterUrl(posterRaw) : undefined,
      backdrop: posterRaw ? posterUrl(posterRaw) : undefined,
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

function hasNextPage(html, currentPage) {
  const source = String(html || "");
  const expected = Number(currentPage) + 1;
  // Pagination can be a numbered link, rel=next anchor, button, or JS-driven control.
  const links = source.match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/gi) || [];
  for (const link of links) {
    const match = /(?:[?&]page=|data-page\s*=\s*["']?)(\d+)/i.exec(link);
    if (match && Number(match[1]) === expected) return true;
    if (/\brel\s*=\s*(["'])next\1/i.test(link)) return true;
    if (/(?:siguiente|next|›|»|→|cargar más|ver más)/i.test(textOf(link))) return true;
  }
  const pageNumbers = Array.from(source.matchAll(/(?:[?&]page=|data-page\s*=\s*["']?)(\d+)/gi), m => Number(m[1]));
  return pageNumbers.some((number) => number > Number(currentPage));
}

function browseCursor(cursor) {
  if (!cursor) return { page: 1, previous: "", pageSize: 0 };
  try {
    const parsed = JSON.parse(String(cursor));
    if (parsed && Number.isInteger(parsed.page) && parsed.page >= 1) {
      return {
        page: parsed.page,
        previous: String(parsed.previous || ""),
        pageSize: Number.isInteger(parsed.pageSize) && parsed.pageSize > 0 ? parsed.pageSize : 0,
        consumed: Number.isInteger(parsed.consumed) && parsed.consumed >= 0 ? parsed.consumed : 0,
        seen: Array.isArray(parsed.seen) ? parsed.seen.filter((value) => typeof value === "string").slice(0, 200) : []
      };
    }
  } catch {}
  const page = Number(cursor);
  return { page: Number.isInteger(page) && page >= 1 ? page : 1, previous: "", pageSize: 0, seen: [] };
}

function movieTotalCount(html) {
  const text = textOf(html);
  const match = /(\d[\d.,]*)\s*(?:pel[ií]culas?|movies?)\b/i.exec(text);
  if (!match) return 0;
  const count = Number(match[1].replace(/[.,](?=\d{3}\b)/g, "").replace(/[^\d]/g, ""));
  return Number.isFinite(count) ? count : 0;
}
function cursorKey(value) {
  // Cursor de tamaño acotado: Kino limita next a 2048 caracteres y los refs completos
  // de 25-50 títulos pueden superar ese límite. FNV-1a mantiene claves cortas y estables.
  const input = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function pageSignature(items) {
  if (!items || !items.length) return "";
  const refs = items.map((item) => String(item.ref || item.id || ""));
  return refs.length + ":" + refs.slice(0, 3).join(",") + ":" + refs.slice(-3).join(",");
}

function pagedResult(items, page, previous) {
  const signature = pageSignature(items);
  // If the site silently ignores ?page=N, stop instead of endlessly repeating the same batch.
  if (!items.length || (previous && signature === previous)) return { items: [] };
  return {
    items,
    next: page < 100 ? JSON.stringify({ page: page + 1, previous: signature }) : undefined
  };
}

function parseFinishedSeries(html) {
  const source = String(html || "");
  const lowerSource = source.toLowerCase();
  return unique(parseSeries(source)).filter((item) => {
    const needle = ("/series/" + item.ref).toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerSource.length) {
      const at = lowerSource.indexOf(needle, searchFrom);
      if (at < 0) return false;
      searchFrom = at + needle.length;
      const cardStart = source.lastIndexOf("<article", at);
      const cardEnd = source.indexOf("</article>", at);
      if (cardStart >= 0 && cardEnd > at) {
        if (/finalizad[oa]|completad[oa]|terminad[oa]/i.test(source.slice(cardStart, cardEnd + 10))) return true;
        continue;
      }
      const from = Math.max(0, at - 700);
      const nearby = source.slice(from, Math.min(source.length, at + 350));
      let closest = Infinity;
      const status = /finalizad[oa]|completad[oa]|terminad[oa]/gi;
      let match;
      while ((match = status.exec(nearby))) {
        closest = Math.min(closest, Math.abs((from + match.index) - at));
      }
      if (closest <= 650) return true;
    }
    return false;
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
      poster: posterRaw ? posterUrl(posterRaw) : undefined,
      backdrop: posterRaw ? posterUrl(posterRaw) : undefined });
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
  try { moviesHtml = await getText(BASE + "/peliculas", { fast: true }); }
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
    { id: "ultimos-episodios", ref: "ultimos-episodios-home", title: "Últimos Episodios", items: latest },
    { id: "tendencias", ref: "tendencias", title: "Tendencias", items: trends },
    { id: "series-finalizadas", ref: "series-finalizadas", title: "Series Finalizadas", items: finished },
    { id: "peliculas", ref: "peliculas-home", title: "Películas", items: movies },
    { id: "catalogo-az", ref: "catalogo-az", title: "Catálogo completo de A-Z", items: alphabetic }
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
    { id: "catalogo-az", label: "Catálogo completo de A-Z" }
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
    { id: "catalogo-az", title: "Catálogo completo de A-Z", ref: "catalogo-az" }
  ];
}

export async function browse(ref, cursor) {
  const cursorState = browseCursor(cursor);
  const page = cursorState.page;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw kino.error("not_found", "La página solicitada no existe");

  if (ref === "peliculas") {
    const sourcePage = page;
    const url = BASE + "/peliculas" + (sourcePage > 1 ? "?page=" + sourcePage + "&sort=newest" : "?sort=newest");
    const sourceHtml = await getText(url);
    const totalCount = movieTotalCount(sourceHtml);
    const parsed = parseMovieItems(sourceHtml);
    if (!parsed.length) return { items: [] };

    const signature = pageSignature(parsed);
    const consumed = cursorState.consumed || 0;
    const repeatedFullPage = Boolean(cursorState.previous && signature === cursorState.previous);
    // El sitio usa páginas reales de tamaños distintos (25 en la primera y 15 en la segunda).
    // Conservamos todos los elementos de cada página. Solo aplicamos offset si el servidor
    // ignora ?page=N y vuelve a entregar el mismo catálogo completo.
    const remaining = repeatedFullPage ? parsed.slice(consumed) : parsed;
    if (!remaining.length) return { items: [] };
    const items = repeatedFullPage ? remaining.slice(0, cursorState.pageSize || 20) : remaining;
    const nextConsumed = consumed + items.length;
    const hasMoreInRepeatedResponse = repeatedFullPage && remaining.length > items.length;
    const hasMore = hasMoreInRepeatedResponse ||
      (totalCount > 0 && nextConsumed < totalCount) ||
      hasNextPage(sourceHtml, sourcePage);

    return {
      items,
      next: hasMore && sourcePage < 100
        ? JSON.stringify({
            page: sourcePage + 1,
            pageSize: cursorState.pageSize || 20,
            consumed: nextConsumed,
            previous: signature
          })
        : undefined
    };
  }

  if (ref === "peliculas-home") {
    const isHomeRow = ref === "peliculas-home";
    const pageSize = cursorState.pageSize || 20;
    let sourcePage = page;
    let consumed = cursorState.consumed || 0;
    let previous = cursorState.previous || "";
    if (isHomeRow && page === 1 && consumed === 0) {
      const firstHtml = await getText(BASE + "/peliculas");
      const firstMovies = parseMovieItems(firstHtml);
      const homeItems = firstMovies.slice(0, MAX_HOME);
      consumed = homeItems.length;
      previous = pageSignature(firstMovies);
      sourcePage = 2;
    }

    const url = BASE + "/peliculas" + (sourcePage > 1 ? "?page=" + sourcePage + "&sort=newest" : "?sort=newest");
    const sourceHtml = await getText(url);
    const totalCount = movieTotalCount(sourceHtml);
    const parsed = parseMovieItems(sourceHtml);
    if (!parsed.length) return { items: [] };

    // Algunas respuestas de /peliculas?page=N contienen páginas distintas;
    // otras ignoran el parámetro y repiten el catálogo completo. Detectamos ambos
    // casos comparando la firma con la respuesta anterior y aplicando offset solo
    // cuando se repite exactamente el mismo conjunto.
    const signature = pageSignature(parsed);
    const repeatedFullPage = Boolean(previous && signature === previous);
    const remaining = repeatedFullPage ? parsed.slice(consumed) : parsed;
    if (!remaining.length) return { items: [] };

    const resultItems = remaining.slice(0, pageSize);
    const nextConsumed = repeatedFullPage ? consumed + resultItems.length : consumed + resultItems.length;
    const hasMoreByCount = totalCount > 0 && nextConsumed < totalCount;
    const hasMoreByLink = hasNextPage(sourceHtml, sourcePage);
    const hasMoreInSameResponse = repeatedFullPage && remaining.length > resultItems.length;
    const nextPage = sourcePage + 1;
    return {
      items: resultItems,
      next: nextPage <= 100 && (hasMoreInSameResponse || hasMoreByLink || hasMoreByCount)
        ? JSON.stringify({
            page: nextPage,
            pageSize,
            consumed: nextConsumed,
            previous: signature
          })
        : undefined
    };
  }

  if (ref === "ultimos-episodios" || ref === "ultimos-episodios-home") {
    const isHomeRow = ref === "ultimos-episodios-home";
    const catalogHtml = await getText(SERIES + "?sort=az");
    const catalog = unique(parseSeries(catalogHtml));
    const seen = new Set(cursorState.seen || []);
    if (isHomeRow && page === 1 && seen.size === 0) {
      const homeHtml = await getText(BASE + "/");
      const homeLatest = sectionSlice(homeHtml, "últimos? episodios", 60000);
      mapToCatalog(unique(parseLatestSeries(homeLatest)), catalog).forEach((item) => seen.add(cursorKey(item.ref)));
    }
    const items = [];
    let sourcePage = page;
    let sourceHtml = "";
    for (let checked = 0; checked < 10 && sourcePage <= 100 && items.length < MAX_PAGE; checked++, sourcePage++) {
      const url = BASE + "/ultimos-episodios" + (sourcePage > 1 ? "?page=" + sourcePage : "");
      sourceHtml = await getText(url);
      const parsed = unique(parseLatestSeries(sourceHtml));
      if (!parsed.length) break;
      const mapped = mapToCatalog(parsed, catalog);
      for (const item of mapped) {
        if (seen.has(cursorKey(item.ref)) || items.some((prior) => prior.ref === item.ref)) continue;
        items.push(item);
        seen.add(cursorKey(item.ref));
      }
      if (items.length || !hasNextPage(sourceHtml, sourcePage)) break;
    }
    if (!items.length) return { items: [] };
    return {
      items: items.slice(0, MAX_PAGE),
      next: hasNextPage(sourceHtml, sourcePage)
        ? JSON.stringify({ page: sourcePage + 1, seen: Array.from(seen).slice(-30) })
        : undefined
    };
  }

  if (ref === "tendencias") {
    const seen = new Set(cursorState.seen || []);
    if (page === 1) {
      const homeHtml = await getText(BASE + "/");
      const sectionHtml = sectionSlice(homeHtml, "tendencias", 45000);
      const items = unique(parseSeries(sectionHtml)).slice(0, MAX_PAGE);
      if (!items.length) return { items: [] };
      items.forEach((item) => seen.add(cursorKey(item.ref)));
      return {
        items,
        next: JSON.stringify({ page: 2, seen: Array.from(seen).slice(-30) })
      };
    }
    // La portada solo muestra una selección. Para continuar, usamos el catálogo
    // ordenado por popularidad, que permite recorrer más títulos sin repetir la fila.
    let sourcePage = page;
    let sourceHtml = "";
    const items = [];
    for (let checked = 0; checked < 10 && sourcePage <= 100 && items.length < MAX_PAGE; checked++, sourcePage++) {
      sourceHtml = await getText(SERIES + "?sort=popular" + (sourcePage > 1 ? "&page=" + sourcePage : ""));
      const parsed = unique(parseSeries(sourceHtml));
      if (!parsed.length) break;
      for (const item of parsed) {
        if (seen.has(cursorKey(item.ref)) || items.some((prior) => prior.ref === item.ref)) continue;
        items.push(item);
        seen.add(cursorKey(item.ref));
      }
      if (items.length || !hasNextPage(sourceHtml, sourcePage)) break;
    }
    if (!items.length) return { items: [] };
    return {
      items: items.slice(0, MAX_PAGE),
      next: hasNextPage(sourceHtml, sourcePage)
        ? JSON.stringify({ page: sourcePage + 1, seen: Array.from(seen).slice(-30) })
        : undefined
    };
  }

  if (ref === "series-finalizadas") {
    const items = [];
    let sourcePage = page;
    let lastRawCount = 0;
    // A source page may contain few finished titles even while the catalog has more pages.
    for (let checked = 0; checked < 10 && sourcePage <= 100 && items.length < MAX_HOME; checked++, sourcePage++) {
      const html = await getText(SERIES + "?sort=az&status=finalizadas" + (sourcePage > 1 ? "&page=" + sourcePage : ""));
      const raw = unique(parseSeries(html));
      lastRawCount = raw.length;
      if (!raw.length) break;
      items.push(...parseFinishedSeries(html));
    }
    const resultItems = unique(items).slice(0, MAX_PAGE);
    const signature = pageSignature(resultItems);
    if (cursorState.previous && signature && signature === cursorState.previous) return { items: [] };
    return {
      items: resultItems,
      next: sourcePage <= 100 && lastRawCount > 0
        ? JSON.stringify({ page: sourcePage, previous: signature })
        : undefined
    };
  }

  if (ref === "catalogo-az") {
    const html = await getText(SERIES + "?sort=az" + (page > 1 ? "&page=" + page : ""));
    const catalog = unique(parseSeries(html));
    const items = catalog.slice().sort((a, b) => normalizeSearch(a.title).localeCompare(normalizeSearch(b.title)));
    return pagedResult(items, page, cursorState.previous);
  }

  throw kino.error("not_found", "La categoría solicitada no existe");
}
function declaredSeasonCount(html) {
  const match = /(\d{1,2})\s+temporadas?\b/i.exec(textOf(html));
  return match ? Math.min(50, Number(match[1])) : 0;
}

function episodeRouteForSeason(episodeRef, season) {
  const path = String(episodeRef || "");
  const modern = /^(.*\/watch\/.+?)-temporada-\d{1,3}-\d{1,4}\/?$/i.exec(path);
  if (modern) return modern[1] + "-temporada-" + season + "-1";
  const legacy = /^(.*\/watch\/.+?)-\d{1,3}-\d{1,4}\/?$/i.exec(path);
  return legacy ? legacy[1] + "-" + season + "-1" : "";
}

function seasonItems(list, season) {
  return list.filter((episode) => !episode.specialMovie && episode.season === season);
}

export async function episodes(ref) {
  const specialPrefix = "special-peli:";
  const seasonPrefix = "season:";
  const requestedRef = String(ref || "");
  const specialMode = requestedRef.startsWith(specialPrefix);
  const seasonMatch = !specialMode && requestedRef.startsWith(seasonPrefix)
    ? /^season:(.+):(\d{1,3})$/.exec(requestedRef)
    : null;
  const selectedSeason = seasonMatch ? Number(seasonMatch[2]) : 0;
  const baseRef = specialMode ? requestedRef.slice(specialPrefix.length)
    : seasonMatch ? seasonMatch[1] : ref;
  const url = seriesUrl(baseRef);
  if (!url) throw kino.error("not_found", "No se encontró la serie");
  let html;
  let detailUrl = url;
  let slug = slugFromUrl(url);
  try {
    html = await getText(url);
  } catch (error) {
    // Si un enlace de catálogo usa un slug antiguo o incorrecto, buscar la ficha
    // canónica solo tras fallar la URL directa.
    const query = String(baseRef || "").replace(/[-_]+/g, " ").trim();
    const candidates = query ? await search(query).catch(() => []) : [];
    const canonical = candidates.find((item) =>
      normalizeSearch(item.title) === normalizeSearch(query) ||
      normalizeSearch(item.ref) === normalizeSearch(baseRef)
    );
    if (!canonical || canonical.ref === baseRef) throw error;
    detailUrl = seriesUrl(canonical.ref);
    if (!detailUrl) throw error;
    html = await getText(detailUrl);
    slug = slugFromUrl(detailUrl);
  }

  let info = parseInfo(html, slug);
  let list = parseEpisodes(html, detailUrl);
  if (!list.length) {
    // La ficha puede responder 200 con HTML incompleto. Recuperar la ficha canónica
    // de la búsqueda solo cuando no se pudieron leer episodios.
    const query = String(baseRef || "").replace(/[-_]+/g, " ").trim();
    const candidates = query ? await search(query).catch(() => []) : [];
    const canonical = candidates.find((item) =>
      normalizeSearch(item.title) === normalizeSearch(query) ||
      normalizeSearch(item.ref) === normalizeSearch(baseRef)
    );
    if (canonical) {
      const canonicalUrl = seriesUrl(canonical.ref);
      if (canonicalUrl && canonicalUrl !== detailUrl) {
        const canonicalHtml = await getText(canonicalUrl);
        const canonicalList = parseEpisodes(canonicalHtml, canonicalUrl);
        if (canonicalList.length) {
          detailUrl = canonicalUrl;
          html = canonicalHtml;
          slug = slugFromUrl(canonicalUrl);
          info = parseInfo(html, slug);
          list = canonicalList;
        }
      }
    }
  }
  if (!list.length) throw kino.error("not_found", "No se encontraron episodios en la ficha pública");

  // Algunas fichas muestran solo los episodios de la temporada seleccionada, aunque
  // anuncian varias temporadas. Cada ruta /watch/<serie>-<temporada>-1 contiene la
  // lista real de esa temporada; la consultamos cuando la ficha no trae la lista entera.
  const seasonCount = declaredSeasonCount(html);
  const firstEpisode = list.find((episode) => !episode.specialMovie);
  if (seasonCount > 1 && firstEpisode) {
    for (let number = 1; number <= seasonCount; number++) {
      const existing = seasonItems(list, number);
      // Una sola referencia puede ser un enlace destacado de temporada, no la lista completa.
      if (existing.length > 1) continue;
      const route = episodeRouteForSeason(firstEpisode.ref, number);
      if (!route) continue;
      try {
        const seasonUrl = absolute(route, detailUrl);
        const seasonHtml = await getText(seasonUrl);
        const seasonList = seasonItems(parseEpisodes(seasonHtml, seasonUrl), number);
        if (seasonList.length > existing.length) {
          list = list.filter((episode) => episode.specialMovie || episode.season !== number);
          list.push(...seasonList);
        }
      } catch (error) {
        log("No se pudo cargar la temporada " + number, error.message);
      }
    }
  }

  const specialMovies = list.filter((episode) => episode.specialMovie);
  if (specialMode) {
    const selected = specialMovies[0];
    if (!selected) throw kino.error("not_found", "No se encontró el especial de la serie");
    return {
      series: info,
      episodes: [{ season: 1, number: 1, ref: selected.ref, title: selected.title }]
    };
  }

  const regularEpisodes = list.filter((episode) => !episode.specialMovie)
    .sort((a, b) => a.season - b.season || a.number - b.number);
  const seasonNumbers = Array.from(new Set(regularEpisodes.map((episode) => episode.season)))
    .filter((number) => number >= 1 && number <= 50)
    .sort((a, b) => a - b);
  const seasons = seasonNumbers.map((number) => ({
    id: slug + "-season-" + number,
    ref: "season:" + slug + ":" + number,
    title: "Temporada " + number,
    number,
    current: selectedSeason ? number === selectedSeason : number === (seasonNumbers[0] || 1)
  }));

  if (specialMovies.length && regularEpisodes.length) {
    // Conservar el especial como una opción separada y mantener las temporadas normales.
    const seasonRef = specialPrefix + slug;
    const specialSeasonNumber = (seasonNumbers[seasonNumbers.length - 1] || 0) + 1;
    seasons.push({
      id: slug + "-special-peli",
      ref: seasonRef,
      title: specialMovies[0].title,
      number: specialSeasonNumber
    });
  }

  const effectiveSeason = selectedSeason || seasonNumbers[0] || 1;
  const selectedEpisodes = regularEpisodes.filter((episode) => episode.season === effectiveSeason);
  if (selectedSeason && !selectedEpisodes.length) {
    throw kino.error("not_found", "No se encontraron episodios para la temporada " + selectedSeason);
  }

  if (seasonNumbers.length > 1 || selectedSeason) {
    return {
      series: info,
      episodes: selectedEpisodes,
      seasons
    };
  }
  if (specialMovies.length && regularEpisodes.length) {
    return { series: info, episodes: selectedEpisodes, seasons };
  }
  return { series: info, episodes: list };
}

function isDirectMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) && /\.(?:m3u8|mp4|webm)(?:$)/i.test(url.pathname);
  } catch { return false; }
}

function sourceHostAllowed(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return /(?:^|\.)(?:videos\.donghualife\.com|dailymotion\.com|dai\.ly|dmcdn\.net|rumble\.com|odysee\.com|voe\.sx|voe\.to|ok\.ru|okcdn\.ru|mycdn\.me|userapi\.com|vkuser\.net|vk\.com|vkvideo\.ru|doodstream\.com|dood\.to|dood\.so|dood\.watch|dood\.la|dood\.re|dood\.pm|dood\.wf|dood\.yt|doodstream\.co|cdnvideo\.ru|r2\.dev|r2\.cloudflarestorage\.com|cloudflarestorage\.com|cloudflarestream\.com|videodelivery\.net)$/.test(host);
  } catch { return false; }
}

function sourceLabel(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("dailymotion") || host === "dai.ly") return "Dailymotion";
    if (host === "videos.donghualife.com") return "R2";
    if (host.includes("rumble")) return "Rumble";
    if (host.includes("odysee")) return "Odysee";
    if (host.includes("voe.")) return "Voe";
    if (host.includes("ok.ru") || host.includes("okcdn") || host.includes("mycdn.me")) return "OK.ru";
    if (host.includes("r2.") || host.includes("cloudflare")) return "R2";
    return host.slice(0, 48);
  } catch { return "Fuente alternativa"; }
}

function extractSourceCandidates(html, pageUrl) {
  // El HTML de Next puede incluir los datos del reproductor como JSON con barras
  // escapadas. Normalizamos esas representaciones antes de extraer URLs públicas.
  const source = decodeHtml(String(html || ""))
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/");
  const matches = source.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  const candidates = [];
  const seen = new Set();
  for (let raw of matches) {
    raw = raw.replace(/[),\]}]+$/g, "").replace(/[.;]+$/g, "");
    let candidate;
    try { candidate = new URL(raw, pageUrl).href; } catch { continue; }
    if (!sourceHostAllowed(candidate) || seen.has(candidate)) continue;
    if (!isDirectMediaUrl(candidate) && !/(?:dailymotion\.com|dai\.ly|rumble\.com|odysee\.com|voe\.sx|voe\.to|ok\.ru)\/|(?:cloudflarestream\.com|videodelivery\.net)\/[a-z0-9_-]{6,}/i.test(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }
  return candidates.slice(0, 12);
}

function directStream(url) {
  if (!isDirectMediaUrl(url)) return null;
  const path = new URL(url).pathname;
  const mime = /\.m3u8$/i.test(path) ? "application/vnd.apple.mpegurl" :
    /\.webm$/i.test(path) ? "video/webm" : "video/mp4";
  const kind = mime === "application/vnd.apple.mpegurl" ? "HLS" : mime === "video/webm" ? "WEBM" : "MP4";
  const result = { url, mime, label: (sourceLabel(url) + " · " + kind).slice(0, 48) };
  // Dailymotion suele servir el manifiesto desde un subdominio CDN distinto del iframe.
  // Conservamos un Referer de proveedor para evitar respuestas HTML de anti-hotlink en HLS.
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/(^|\.)dailymotion\.com$/.test(host)) {
      result.headers = { Referer: "https://www.dailymotion.com/", Origin: "https://www.dailymotion.com" };
    }
    if (host === "videos.donghualife.com") {
      result.headers = { Referer: "https://donghualife.com/", Origin: "https://donghualife.com" };
    }
  } catch {}
  return result;
}

function mediaUrlsInObject(value, out, depth) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    const normalized = value.replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
    if (isDirectMediaUrl(normalized) && /^https:\/\//i.test(normalized)) out.push(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) mediaUrlsInObject(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) mediaUrlsInObject(item, out, depth + 1);
  }
}

async function resolveDailymotion(url, referer) {
  let id = "";
  try {
    const parsed = new URL(url);
    id = parsed.searchParams.get("video") || parsed.searchParams.get("videoId") || "";
    if (!id) id = /\/(?:embed\/video|video|player\/metadata\/video)\/([a-z0-9]+)/i.exec(parsed.pathname)?.[1] || "";
    if (!id && parsed.hostname === "dai.ly") id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
  } catch {}
  if (!/^[a-z0-9]{5,20}$/i.test(id)) return null;
  const metadataUrl = "https://www.dailymotion.com/player/metadata/video/" + id;
  try {
    const raw = await getText(metadataUrl, { headers: { Referer: referer || "https://www.dailymotion.com/" } });
    const metadata = JSON.parse(raw);
    // El reproductor moderno de Dailymotion entrega la fuente principal en qualities.auto.
    // La leemos primero y después recorremos el resto de la metadata por compatibilidad.
    const urls = Array.isArray(metadata.qualities?.auto)
      ? metadata.qualities.auto.map((quality) => quality && quality.url).filter((value) => typeof value === "string")
      : [];
    mediaUrlsInObject(metadata, urls, 0);
    const uniqueUrls = Array.from(new Set(urls));
    const safeUrlInfo = (item) => {
      try {
        const u = new URL(item);
        return { host: u.hostname, path: u.pathname.slice(0, 100),
          tipo: /\.m3u8$/i.test(u.pathname) ? "hls" : /\.mp4$/i.test(u.pathname) ? "mp4" :
            /\.webm$/i.test(u.pathname) ? "webm" : "otro", queryKeys: Array.from(u.searchParams.keys()).slice(0, 8) };
      } catch { return { tipo: "invalido" }; }
    };
    log("Medios en metadatos Dailymotion", JSON.stringify(uniqueUrls.slice(0, 12).map(safeUrlInfo)));
    const best = uniqueUrls.find((item) => /\.m3u8$/i.test(new URL(item).pathname)) ||
      uniqueUrls.find((item) => /\.mp4$/i.test(new URL(item).pathname)) || uniqueUrls[0];
    if (best) {
      log("Tipo de medio Dailymotion elegido", safeUrlInfo(best).tipo);
      return directStream(best);
    }
  } catch (error) {
    log("No se pudieron leer los metadatos públicos de Dailymotion", error && error.message || String(error));
  }
  return null;
}

async function resolveProviderUrl(providerUrl, referer, allowCapture) {
  const direct = directStream(providerUrl);
  if (direct) return direct;
  if (/(?:ok\.ru\/(?:video|videoembed)|(?:doodstream\.com|dood\.to|dood\.so|dood\.watch|dood\.la|dood\.re|dood\.pm|dood\.wf|dood\.yt|doodstream\.co)\/)/i.test(providerUrl)) {
    try { return await resolveOkru(providerUrl); }
    catch (error) { log("No se pudo resolver OK.ru", error && error.message || String(error)); }
  }
  if (/dailymotion\.com|dai\.ly/i.test(providerUrl)) {
    const stream = await resolveDailymotion(providerUrl, referer);
    if (stream) return stream;
  }

  // Los hosts públicos de los proveedores suelen incluir el archivo o los metadatos
  // del reproductor en su propio HTML. Solo leemos fuentes expuestas públicamente.
  try {
    const origin = new URL(providerUrl).origin + "/";
    const html = await getText(providerUrl, { headers: { Referer: referer || origin } });
    const embed = parseEmbed(html, providerUrl);
    if (embed) {
      const stream = directStream(embed);
      if (stream) return stream;
      if (/ok\.ru\/(?:video|videoembed)\//i.test(embed)) {
        try { return await resolveOkru(embed); } catch {}
      }
    }
    const urls = extractSourceCandidates(html, providerUrl);
    const streamUrl = urls.find((item) => isDirectMediaUrl(item));
    if (streamUrl) return directStream(streamUrl);
  } catch (error) {
    log("No se pudieron leer los metadatos públicos del proveedor", sourceLabel(providerUrl), error && error.message || String(error));
  }
  if (allowCapture) return await capturePageStream(providerUrl);
  return null;
}

function addSourceAlternatives(stream, candidates, selectedUrl) {
  const alternatives = [];
  const seen = new Set([selectedUrl, stream && stream.url].filter(Boolean));
  for (const candidate of candidates) {
    if (alternatives.length >= 8) break;
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const label = sourceLabel(candidate);
    // No ofrecer un MP4/WebM del mismo host como "servidor alternativo" cuando
    // la fuente principal ya es HLS: suele ser una copia fija de baja calidad y
    // no la variante adaptativa que Kino está reproduciendo.
    const direct = directStream(candidate);
    if (direct && stream && /mpegurl|m3u8/i.test(String(stream.mime || stream.url)) &&
        /^(?:video\/mp4|video\/webm)$/.test(direct.mime) &&
        new URL(candidate).hostname.toLowerCase() === new URL(stream.url).hostname.toLowerCase()) continue;
    // Una URL de video directa no necesita una segunda llamada a resolve().
    // Entregarla como alternativa nativa evita que Kino tenga que volver a
    // interpretar el proveedor y conserva el tipo MIME correcto.
    if (direct) {
      alternatives.push({ label: direct.label || label, url: direct.url, mime: direct.mime });
    } else {
      // Los embeds se resuelven de forma diferida solo si la persona los elige.
      alternatives.push({ label, ref: "source:" + candidate });
    }
  }
  if (alternatives.length) stream.alternatives = alternatives;
  return stream;
}

function capturedStream(capture) {
  const media = Array.isArray(capture && capture.media) ? capture.media : [];
  const mediaType = (item) => {
    const url = String(item && item.url || "");
    const mime = String(item && item.mime || "").toLowerCase();
    if (/mpegurl|m3u8/.test(mime) || /\.m3u8(?:[?#]|$)/i.test(url)) return "hls";
    if (/mp4/.test(mime) || /\.mp4(?:[?#]|$)/i.test(url)) return "mp4";
    if (/webm/.test(mime) || /\.webm(?:[?#]|$)/i.test(url)) return "webm";
    return "";
  };
  const rank = (item) => { const type = mediaType(item); let host = ""; try { host = new URL(String(item && item.url || "")).hostname.toLowerCase(); } catch {} if (type === "hls" && host === "cdndirector.dailymotion.com") return -1; return type === "hls" ? 0 : type === "mp4" ? 1 : type === "webm" ? 2 : 3; };
  const candidates = media.filter((item) => {
    if (!item || !/^https:\/\//i.test(String(item.url || "")) || !mediaType(item)) return false;
    try {
      const u = new URL(String(item.url));
      // Dailymotion puede solicitar /cdn/manifest/video/<id>.m3u8 para anuncios
      // y responder VMAP/XML, no un manifiesto HLS reproducible. No entregar ese
      // endpoint publicitario directamente al reproductor de Kino.
      if (u.searchParams.has("error")) return false;
      if (/^dmxleo\.dailymotion\.com$/i.test(u.hostname) &&
          /\/cdn\/manifest\/video\//i.test(u.pathname)) return false;
    } catch { return false; }
    return true;
  }).sort((a, b) => rank(a) - rank(b));
  const stream = candidates[0];
  if (!stream) return null;
  const mimeFor = (item) => {
    const type = mediaType(item);
    return type === "hls" ? "application/vnd.apple.mpegurl" : type === "webm" ? "video/webm" : "video/mp4";
  };
  const playbackHeaders = (item, host) => {
    const headers = item && item.headers && typeof item.headers === "object" ? { ...item.headers } : {};
    if (/(^|\.)dailymotion\.com$/i.test(host)) {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "referer")) headers.Referer = "https://www.dailymotion.com/";
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "origin")) headers.Origin = "https://www.dailymotion.com";
    }
    return headers;
  };
  const url = String(stream.url);
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const result = { url, mime: mimeFor(stream), label: (sourceLabel(url) + " · " + mediaType(stream).toUpperCase()).slice(0, 48) };
  const headers = playbackHeaders(stream, host);
  if (Object.keys(headers).length) result.headers = headers;

  const seen = new Set([url]);
  const alternatives = [];
  let primaryHost = host;
  for (const item of candidates.slice(1)) {
    const alternateUrl = String(item.url);
    if (seen.has(alternateUrl) || alternatives.length >= 8) continue;
    let alternateHost = "";
    try { alternateHost = new URL(alternateUrl).hostname.toLowerCase(); } catch {}
    if (mediaType(stream) === "hls" && alternateHost === primaryHost &&
        (mediaType(item) === "mp4" || mediaType(item) === "webm")) continue;
    seen.add(alternateUrl);
    const kind = mediaType(item).toUpperCase();
    const alternateHeaders = playbackHeaders(item, alternateHost);
    alternatives.push({
      label: (sourceLabel(alternateUrl) + " · " + kind).slice(0, 48),
      url: alternateUrl,
      mime: mimeFor(item),
      ...(Object.keys(alternateHeaders).length ? { headers: alternateHeaders } : {})
    });
  }
  if (alternatives.length) result.alternatives = alternatives;

  const subtitles = Array.isArray(capture.subtitles) ? capture.subtitles : [];
  result.subtitles = subtitles.filter((item) => item && /^https:\/\//i.test(String(item.url || "")))
    .map((item) => ({
      lang: String(item.lang || "es").slice(0, 16),
      url: String(item.url),
      format: /\.srt(?:[?#]|$)/i.test(item.url) ? "srt" : "vtt"
    })).slice(0, 10);
  if (!result.subtitles.length) delete result.subtitles;
  return result;
}
async function resolveRenderedDailymotionPage(url) {
  if (!kino.browser || typeof kino.browser.page !== "function") return null;
  try {
    // La captura de red puede recoger callbacks de anuncios de Dailymotion en vez
    // del manifiesto. Leemos el DOM tras ejecutar los scripts y buscamos el ID del embed.
    const page = await kino.browser.page(url, { timeoutMs: 6000 });
    const html = String(page && page.html || "");
    const pageUrl = page && page.finalUrl || url;
    log("Página del reproductor procesada", "status:", page && page.status, "html:", html.length);
    const iframeInfo = [];
    const iframeRe = /<(?:iframe|video|source)\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
    let iframeMatch;
    while ((iframeMatch = iframeRe.exec(html)) && iframeInfo.length < 12) {
      try {
        const u = new URL(absolute(iframeMatch[2], pageUrl));
        iframeInfo.push({ tag: /^<iframe/i.test(iframeMatch[0]) ? "iframe" : /^<video/i.test(iframeMatch[0]) ? "video" : "source",
          host: u.hostname, path: u.pathname.slice(0, 100), queryKeys: Array.from(u.searchParams.keys()).slice(0, 8) });
      } catch {}
    }
    log("Elementos multimedia del DOM", JSON.stringify(iframeInfo));
    const embed = parseEmbed(html, pageUrl);
    if (embed && /(?:dailymotion\.com|dai\.ly)/i.test(embed) && !isDirectMediaUrl(embed)) {
      const stream = await resolveProviderUrl(embed, page.finalUrl || url, false);
      if (stream) {
        log("Reproductor Dailymotion resuelto desde el DOM");
        return stream;
      }
    }
    // Algunos reproductores guardan el iframe en JSON o en atributos no estándar.
    const candidates = extractSourceCandidates(html, pageUrl);
    log("Candidatos del DOM", JSON.stringify(candidates.slice(0, 10).map((candidate) => {
      try {
        const u = new URL(candidate);
        return { host: u.hostname, path: u.pathname.slice(0, 100),
          tipo: /\.m3u8$/i.test(u.pathname) ? "hls" : /\.mp4$/i.test(u.pathname) ? "mp4" :
            /\.webm$/i.test(u.pathname) ? "webm" : "embed", queryKeys: Array.from(u.searchParams.keys()).slice(0, 8) };
      } catch { return { tipo: "invalido" }; }
    })));
    for (const candidate of candidates) {
      if (!/(?:dailymotion\.com|dai\.ly)/i.test(candidate) || isDirectMediaUrl(candidate)) continue;
      const stream = await resolveProviderUrl(candidate, page.finalUrl || url, false);
      if (stream) {
        log("Reproductor Dailymotion resuelto desde candidatos del DOM");
        return stream;
      }
    }
    log("La página procesada no expuso un embed Dailymotion resoluble");
  } catch (error) {
    log("No se pudo leer el DOM del reproductor", String(error && error.message || error).slice(0, 120));
  }
  return null;
}

async function capturePageStream(url) {
  if (!kino.browser || typeof kino.browser.capture !== "function") return null;
  try {
    const capture = await kino.browser.capture(url, { timeoutMs: 18000, autoplay: true });
    // La captura de Dailymotion puede confundir el manifiesto de anuncios VMAP
    // con el video porque ambos terminan en .m3u8. Si encontramos el ID en esa
    // ruta, consultar primero la metadata pública, que contiene qualities.auto
    // con la fuente real de reproducción.
    const capturedMedia = Array.isArray(capture && capture.media) ? capture.media : [];
    for (const item of capturedMedia) {
      try {
        const capturedUrl = new URL(String(item && item.url || ""));
        if (!/^dmxleo\.dailymotion\.com$/i.test(capturedUrl.hostname)) continue;
        const videoId = /\/cdn\/manifest\/video\/([a-z0-9]+)\.m3u8$/i.exec(capturedUrl.pathname)?.[1] || "";
        if (!videoId) continue;
        const resolved = await resolveDailymotion("https://www.dailymotion.com/video/" + videoId, url);
        if (resolved) {
          log("Fuente real de Dailymotion recuperada desde metadata pública");
          return resolved;
        }
      } catch (error) {
        log("No se pudo recuperar metadata del video capturado", String(error && error.message || error).slice(0, 100));
      }
    }
    // No validamos HLS con kino.fetch: esa petición puede recibir HTML/XML
    // distinto de lo que obtuvo el navegador integrado y descartar fuentes válidas.
    const stream = capturedStream(capture);
    if (stream) {
      let host = "desconocido";
      try { host = new URL(stream.url).hostname; } catch {}
      log("Fuente capturada", host, stream.mime, "alternativas:", Array.isArray(stream.alternatives) ? stream.alternatives.length : 0);

      // Diagnóstico temporal y seguro: nunca registrar URL completa, valores de query,
      // cookies ni valores de cabeceras.
      const safeMediaInfo = (item, index) => {
        try {
          const u = new URL(String(item && item.url || ""));
          const path = u.pathname.split("/").filter(Boolean);
          const ext = /\.m3u8$/i.test(u.pathname) ? "m3u8" :
            /\.mpd$/i.test(u.pathname) ? "mpd" :
            /\.mp4$/i.test(u.pathname) ? "mp4" :
            /\.webm$/i.test(u.pathname) ? "webm" : "sin-extension";
          return {
            n: index + 1,
            host: u.hostname,
            tipo: String(item && item.mime || "sin-mime").slice(0, 48),
            ext,
            segmentos: path.length,
            queryKeys: Array.from(new Set(Array.from(u.searchParams.keys()))).slice(0, 12),
            headers: Object.keys(item && item.headers || {}).map((key) => key.toLowerCase()).sort()
          };
        } catch { return { n: index + 1, url: "invalida" }; }
      };
      const capturedMedia = Array.isArray(capture && capture.media) ? capture.media : [];
      log("Diagnóstico fuentes capturadas", JSON.stringify(capturedMedia.slice(0, 8).map(safeMediaInfo)));

      // Esta petición es solo diagnóstica; nunca invalida la fuente capturada.
      if (kino.fetch && stream.mime === "application/vnd.apple.mpegurl") {
        try {
          const probeHeaders = {};
          const primary = capturedMedia.find((item) => item && item.url === stream.url);
          for (const [key, value] of Object.entries(primary && primary.headers || {})) {
            if (/^(referer|origin|user-agent|cookie)$/i.test(key) && typeof value === "string") probeHeaders[key] = value;
          }
          const response = await kino.fetch(stream.url, { headers: probeHeaders, timeoutMs: 2500 });
          const body = String(response.text() || "");
          const trimmed = body.trimStart();
          const kind = /^#EXTM3U/.test(trimmed) ? "hls" :
            /^<!doctype\s+html|^<html\b/i.test(trimmed) ? "html" :
            /^[{[]/.test(trimmed) ? "json-o-datos" :
            /^<\?xml|^<[a-z][^>]*>/i.test(trimmed) ? "xml-u-otro-markup" :
            !trimmed ? "vacio" : "otro";
          const xmlRoot = /^\s*(?:<\?xml[^>]*>\s*)?<([a-z][a-z0-9:_-]*)\b/i.exec(body);
          const hasMpd = /<MPD\b/i.test(body);
          const hasHlsTags = /#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE)/i.test(body);
          const errorHint = /expired|forbidden|unauthorized|not found|access denied|invalid|error|blocked|denied/i.test(body);
          log("Diagnóstico manifiesto", "status:", response.status,
            "content-type:", String(response.headers["content-type"] || "sin-content-type").slice(0, 80),
            "tipo:", kind, "raiz:", xmlRoot ? xmlRoot[1].slice(0, 40) : "ninguna",
            "mpd:", hasMpd, "tagsHls:", hasHlsTags, "indicioError:", errorHint,
            "bytes-texto:", body.length);
        } catch (error) {
          log("Diagnóstico manifiesto no disponible", String(error && error.message || error).slice(0, 100));
        }
      }
    } else {
      const media = Array.isArray(capture && capture.media) ? capture.media.length : 0;
      log("El navegador integrado capturó", media, "recursos, pero ninguno parece una fuente de video compatible");
    }
    return stream;
  } catch (error) {
    log("No se pudo capturar el reproductor web", error && error.message || String(error));
    return null;
  }
}

export async function resolve(ref) {
  const path = String(ref || "");
  // Las referencias de servidores son URLs absolutas y deben tratarse antes de
  // normalizar las referencias de episodios, para no convertirlas en rutas locales.
  if (path.startsWith("source:")) {
    const sourceUrl = String(path.slice(7));
    if (!sourceUrl || !/^https:\/\//i.test(sourceUrl) || !sourceHostAllowed(sourceUrl)) {
      throw kino.error("not_found", "El servidor de video no es válido");
    }
    const stream = await resolveProviderUrl(sourceUrl, BASE + "/", true);
    if (stream) return stream;
    throw kino.error("unavailable", "El proveedor no expuso una fuente compatible con Kino");
  }
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
  if (embed) {
    const direct = directStream(embed);
    if (direct) return direct;
    if (/ok\.ru\/(?:video|videoembed)\//i.test(embed)) {
      try { return await resolveOkru(embed); }
      catch (error) { log("No se pudo resolver OK.ru", error && error.message || String(error)); }
    }
    if (/dailymotion\.com|dai\.ly/i.test(embed)) {
      const providerStream = await resolveProviderUrl(embed, url, false);
      if (providerStream) return providerStream;
    }
  }

  // Resolvers propios: inspeccionamos las URLs de proveedores incluidas en el HTML
  // hidratado, resolvemos primero fuentes directas/metadatos y dejamos las demás como
  // alternativas diferidas de Kino. Así no dependemos del servidor seleccionado por defecto.
  const candidates = extractSourceCandidates(html, url);
  for (const candidate of candidates) {
    const stream = await resolveProviderUrl(candidate, url, false);
    if (stream) return addSourceAlternatives(stream, candidates, candidate);
  }
  // Si el proveedor no expone metadatos directos, probamos su reproductor individual.
  for (const candidate of candidates) {
    const stream = await resolveProviderUrl(candidate, url, true);
    if (stream) return addSourceAlternatives(stream, candidates, candidate);
  }

  // Primero leemos el DOM ya ejecutado: Dailymotion puede exponer el ID del video
  // en un iframe dinámico, mientras que la captura de red también incluye VMAP/anuncios.
  const rendered = await resolveRenderedDailymotionPage(url);
  if (rendered) return rendered;

  // Último recurso: captura de solicitudes del reproductor si el DOM no permite resolverlo.
  const captured = await capturePageStream(url);
  if (captured) return addSourceAlternatives(captured, candidates, "");
  if (!candidates.length && !embed) throw kino.error("unavailable", "La página no mostró fuentes públicas de reproducción reconocibles");
  throw kino.error("unavailable", "Los proveedores encontrados no expusieron una fuente compatible con Kino");
}
