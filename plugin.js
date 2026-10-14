/// <reference path="./kino.d.ts" />
// Fuente de donghua para Kino. Usa páginas públicas y resolvers por proveedor.
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
function normalizePlayerMarkup(html) {
  return decodeHtml(String(html || ""))
    .replace(/\\u002f/gi, "/").replace(/\\u0026/gi, "&")
    .replace(/\\u003a/gi, ":").replace(/\\\//g, "/");
}

function providerForUrl(url) {
  if (/ok\.ru\/(?:video|videoembed)\//i.test(url)) return "okru";
  if (/(?:dailymotion\.com|dai\.ly)\//i.test(url)) return "dailymotion";
  if (/rumble\.com\//i.test(url)) return "rumble";
  if (/odysee\.com\//i.test(url)) return "odysee";
  if (/(?:voe\.sx|voe\.to)\//i.test(url)) return "voe";
  if (/(?:r2\.dev|cloudflarestorage\.com|cloudflarestream\.com|videodelivery\.net)\//i.test(url)) return "r2";
  return "";
}

function parseSourceCandidates(html, pageUrl) {
  const source = normalizePlayerMarkup(html);
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const url = absolute(String(raw || "").replace(/&amp;/gi, "&").replace(/[),;}\]]+$/g, ""), pageUrl);
    if (!/^https:\/\//i.test(url) || seen.has(url)) return;
    const provider = providerForUrl(url);
    const direct = /\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(url);
    if (!provider && !direct) return;
    seen.add(url);
    out.push({
      url,
      provider: direct ? "direct" : provider,
      label: provider === "r2" ? "R2 · Directo" : provider === "dailymotion" ? "Dailymotion" :
        provider === "rumble" ? "Rumble" : provider === "odysee" ? "Odysee" :
        provider === "voe" ? "Voe" : provider === "okru" ? "OK.ru" : "Video directo"
    });
  };
  const urls = /https?:\/\/[^\s"'<>\\]+/gi;
  let match;
  while ((match = urls.exec(source))) add(match[0]);
  const attrs = /(?:src|data-src|data-url|embedUrl|videoUrl|file|url)\s*[:=]\s*["']([^"']{4,2048})["']/gi;
  while ((match = attrs.exec(source))) {
    const value = match[1].replace(/\\\//g, "/");
    if (/^(?:https?:)?\/\//i.test(value)) add(value.startsWith("//") ? "https:" + value : value);
  }
  return out;
}

function parseEmbed(html, pageUrl) {
  const candidates = parseSourceCandidates(html, pageUrl);
  const direct = candidates.find((item) => item.provider === "direct" || item.provider === "r2");
  if (direct) return direct.url;
  const re = /<(?:iframe|video|source)\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let match;
  while ((match = re.exec(normalizePlayerMarkup(html)))) {
    const url = absolute(match[2], pageUrl);
    if (url && providerForUrl(url)) return url;
  }
  return candidates[0] ? candidates[0].url : "";
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

function capturedStream(capture) {
  const media = Array.isArray(capture && capture.media) ? capture.media : [];
  const rank = (item) => {
    const url = String(item && item.url || "");
    const mime = String(item && item.mime || "").toLowerCase();
    if (/mpegurl|m3u8/.test(mime) || /\.m3u8(?:[?#]|$)/i.test(url)) return 0;
    if (/mp4|webm/.test(mime) || /\.(?:mp4|webm)(?:[?#]|$)/i.test(url)) return 1;
    return 2;
  };
  const stream = media.filter((item) => item && /^https:\/\//i.test(String(item.url || "")))
    .sort((a, b) => rank(a) - rank(b))[0];
  if (!stream) return null;
  const mime = String(stream.mime || "").toLowerCase();
  const url = String(stream.url);
  const result = {
    url,
    mime: /mpegurl|m3u8/.test(mime) || /\.m3u8(?:[?#]|$)/i.test(url)
      ? "application/vnd.apple.mpegurl"
      : /webm/.test(mime) || /\.webm(?:[?#]|$)/i.test(url) ? "video/webm"
      : /mp4/.test(mime) || /\.mp4(?:[?#]|$)/i.test(url) ? "video/mp4" : (stream.mime || "video/mp4")
  };
  if (stream.headers && typeof stream.headers === "object") result.headers = stream.headers;
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

async function capturePageStream(url) {
  if (!kino.browser || typeof kino.browser.capture !== "function") return null;
  try {
    const capture = await kino.browser.capture(url, { timeoutMs: 18000, autoplay: true });
    const stream = capturedStream(capture);
    if (stream) log("Se detectó una fuente de video con el navegador integrado");
    else log("El navegador integrado no detectó una fuente de video");
    return stream;
  } catch (error) {
    log("No se pudo capturar el reproductor web", error && error.message || String(error));
    return null;
  }
}

function streamForDirectUrl(url, referer) {
  if (!url || !/^https:\\/\\//i.test(url) || !/\\.(?:mp4|webm|m3u8)(?:[?#]|$)/i.test(url)) return null;
  const stream = { url, mime: /\\.m3u8(?:[?#]|$)/i.test(url) ? "application/vnd.apple.mpegurl" :
    /\\.webm(?:[?#]|$)/i.test(url) ? "video/webm" : "video/mp4" };
  if (referer) stream.headers = { Referer: referer };
  return stream;
}

async function resolveDailymotion(url) {
  const id = /(?:\\/video\\/|\\/embed\\/video\\/|[?&]video=)([a-z0-9]+)/i.exec(url) || /dai\\.ly\\/([a-z0-9]+)/i.exec(url);
  if (id) {
    try {
      const raw = await getText("https://www.dailymotion.com/player/metadata/video/" + id[1], { headers: { Referer: url } });
      const data = JSON.parse(raw);
      const urls = [];
      const visit = (value) => {
        if (typeof value === "string") {
          const candidate = value.replace(/\\\\\\//g, "/");
          if (/^https:\\/\\//i.test(candidate) && /\\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(candidate)) urls.push(candidate);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
      };
      visit(data);
      const media = urls.find((value) => /\\.m3u8(?:[?#]|$)/i.test(value)) || urls[0];
      if (media) return streamForDirectUrl(media, url);
    } catch (error) {
      log("Dailymotion: no se pudieron leer metadatos", error && error.message || String(error));
    }
  }
  const html = await getText(url, { headers: { Referer: "https://www.dailymotion.com/" } });
  const media = parseSourceCandidates(html, url).find((item) => item.provider === "direct");
  if (media) return streamForDirectUrl(media.url, url);
  const captured = await capturePageStream(url);
  if (captured) return captured;
  throw new Error("Dailymotion no entregó una fuente directa compatible");
}

async function resolveProviderUrl(url) {
  if (/\\. (?:m3u8|mp4|webm)/i.test(url)) {
    const direct = streamForDirectUrl(url);
    if (direct) return direct;
  }
  if (/ok\\.ru\\/(?:video|videoembed)\\//i.test(url)) return resolveOkru(url);
  if (/(?:dailymotion\\.com|dai\\.ly)\\//i.test(url)) return resolveDailymotion(url);
  const html = await getText(url, { headers: { Referer: BASE + "/" } });
  const media = parseSourceCandidates(html, url).find((item) => item.provider === "direct");
  if (media) return streamForDirectUrl(media.url, url);
  const captured = await capturePageStream(url);
  if (captured) return captured;
  throw new Error("El proveedor no publicó video directo");
}

function attachAlternatives(stream, candidates, currentUrl) {
  const alternatives = [];
  const seen = new Set([stream.url]);
  for (const item of candidates) {
    if (!item.url || item.url === currentUrl || seen.has(item.url)) continue;
    seen.add(item.url);
    if (item.provider === "direct" || item.provider === "r2") {
      const direct = streamForDirectUrl(item.url, currentUrl);
      if (direct) alternatives.push({ label: item.label, url: direct.url, mime: direct.mime, headers: direct.headers });
    } else {
      alternatives.push({ label: item.label, ref: "source:" + item.url });
    }
    if (alternatives.length === 8) break;
  }
  if (alternatives.length) stream.alternatives = alternatives;
  return stream;
}

export async function resolve(ref) {
  const path = String(ref || "");
  if (path.startsWith("source:")) {
    const sourceUrl = absolute(path.slice(7));
    if (!sourceUrl || !/^https:\\/\\//i.test(sourceUrl)) throw kino.error("not_found", "El servidor de video no es válido");
    try { return await resolveProviderUrl(sourceUrl); }
    catch (error) {
      log("Falló el resolver del servidor " + providerForUrl(sourceUrl), error && error.message || String(error));
      throw kino.error("unavailable", "No se pudo obtener video de ese servidor");
    }
  }

  let url = absolute(path.startsWith("/") ? path : "/" + path);
  if (!url || !/^https:\\/\\/donghualife\\.com\\//i.test(url)) {
    throw kino.error("not_found", "El episodio o película no es válido");
  }
  let html = await getText(url);
  if (!/\\/watch\\//i.test(url)) {
    const watch = /href\\s*=\\s*(["'])([^"']*\\/watch\\/[^"']+)\\1/i.exec(html);
    if (watch) {
      url = absolute(watch[2], url);
      html = await getText(url);
    }
  }
  if (/solo\\s+para\\s+vip|requiere\\s+(?:una\\s+)?suscripci[oó]n|inicia\\s+sesi[oó]n\\s+para\\s+ver/i.test(textOf(html))) {
    throw kino.error("unavailable", "Este episodio requiere acceso en el sitio");
  }

  const candidates = parseSourceCandidates(html, url);
  const embed = parseEmbed(html, url);
  const direct = candidates.find((item) => item.provider === "direct" || item.provider === "r2");
  if (direct) {
    const stream = streamForDirectUrl(direct.url, url);
    if (stream) return attachAlternatives(stream, candidates, direct.url);
  }

  // Resolver por proveedor: un servidor caído no impide probar los demás.
  const providers = candidates.filter((item) => item.provider && item.provider !== "direct" && item.provider !== "r2");
  if (embed && providerForUrl(embed) && !providers.some((item) => item.url === embed)) {
    providers.unshift({ url: embed, provider: providerForUrl(embed), label: "Servidor alternativo" });
  }
  const seen = new Set();
  for (const candidate of providers) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    try {
      const stream = await resolveProviderUrl(candidate.url);
      if (stream) return attachAlternatives(stream, candidates, candidate.url);
    } catch (error) {
      log("Falló " + candidate.provider + "; se probará otra fuente", error && error.message || String(error));
    }
  }

  // Último respaldo para páginas donde el proveedor se construye completamente con JavaScript.
  const captured = await capturePageStream(url);
  if (captured) return attachAlternatives(captured, candidates, url);
  if (!embed && !candidates.length) throw kino.error("unavailable", "La página no publicó fuentes de reproducción reconocibles");
  throw kino.error("unavailable", "No se pudo resolver ningún servidor de video compatible");
}
