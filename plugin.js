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
  const response = await kino.fetch(url, options);
  if (!response.ok) throw new Error("El sitio respondió " + response.status);
  return response.text();
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
      id: slug, ref: SERIES + "/" + slug, title: (badTitle ? slug.replace(/-/g, " ") : title).slice(0, 200),
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
      bySlug.set(slug, { id: slug, ref: SERIES + "/" + slug, title: textOf(ogTitle[1]).slice(0, 200), kind: "series",
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
    const m = /-(\d{1,3})-(\d{1,4})\/?$/.exec(path);
    if (!m) continue;
    const season = Number(m[1]), number = Number(m[2]);
    if (season < 1 || number < 1) continue;
    let label = textOf(match[3]);
    label = label.replace(/\b(?:fuentes?|subt[ií]tulos?|vip)\b/gi, " ").replace(/\s+/g, " ").trim();
    // DonghuaLife suele repetir el número en «Capítulo 2 episodio 02».
    // El enlace tiene el número real: evitamos títulos redundantes.
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

  // La búsqueda de DonghuaLife se dibuja parcialmente con JavaScript. Consultar ?search=
  // no garantiza resultados; leemos varias páginas del catálogo en paralelo y filtramos aquí.
  // Así evitamos hasta cuatro esperas consecutivas que podían superar el límite de 15 s de Kino.
  const urls = [
    SERIES,
    SERIES + "?page=2",
    SERIES + "?page=3",
    BASE + "/"
  ];
  const pages = await Promise.all(urls.map(async (url) => {
    try { return parseSeries(await getText(url)); }
    catch (e) { log("No se pudo consultar una página de búsqueda", e.message); return []; }
  }));
  return unique(pages.flat().filter(matches)).slice(0, MAX_PAGE);
}

function sectionSlice(html, headingPattern, maxChars) {
  const headings = html.match(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi) || [];
  let match = null;
  let offset = 0;
  for (const heading of headings) {
    const index = html.indexOf(heading, offset);
    offset = index + heading.length;
    if (new RegExp(headingPattern, "i").test(textOf(heading))) {
      match = { index, length: heading.length };
      break;
    }
  }
  if (!match) return "";
  const start = match.index + match.length;
  const tail = html.slice(start, start + (maxChars || 60000));
  const next = /<h[1-3]\b[^>]*>/i.exec(tail);
  return next ? tail.slice(0, next.index) : tail;
}
function parseLatestSeries(html) {
  const out = [];
  const seen = new Set();
  // La página de últimos episodios enlaza a /watch/, no siempre a la ficha /series/.
  // El slug del episodio corresponde al de la serie antes de los dos números finales.
  const re = /<a\b[^>]*href\s*=\s*(["'])([^"']*\/watch\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && out.length < MAX_PAGE) {
    const url = absolute(match[2]);
    let path = "";
    try { path = new URL(url).pathname; } catch { continue; }
    const m = /\/watch\/([a-z0-9-]+)-(\d{1,3})-(\d{1,4})\/?$/i.exec(path);
    if (!m) continue;
    const slug = m[1];
    if (seen.has(slug)) continue;
    const around = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, re.lastIndex + 1800));
    const imgMatch = /<img\b[^>]*>/i.exec(around);
    const img = imgMatch ? imgMatch[0] : "";
    const posterRaw = attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "data-original") || attr(img, "src");
    const label = attr(img, "alt") || attr(img, "title") || slug.replace(/-/g, " ");
    out.push({ id: slug, ref: SERIES + "/" + slug, title: textOf(label).slice(0, 200), kind: "series",
      poster: posterRaw ? absolute(posterRaw) : undefined, backdrop: posterRaw ? absolute(posterRaw) : undefined, genres: ["anime"] });
    seen.add(slug);
  }
  return out;
}

function parseHomeRows(homeHtml, latestHtml, catalogHtml) {
  const allHome = unique(parseSeries(homeHtml));
  const allCatalog = unique(parseSeries(catalogHtml || ""));
  const allAvailable = unique(allHome.concat(allCatalog));
  const featuredHtml = sectionSlice(homeHtml, "(?:te recomendamos para vos|recomendados|destacados)", 65000);
  const trendsHtml = sectionSlice(homeHtml, "tendencias", 45000);
  let featured = unique(parseSeries(featuredHtml));
  // Si el HTML no conserva el encabezado de la sección, usar el catálogo de la portada
  // para no terminar con una sola tarjeta en el banner.
  if (featured.length < 3) featured = allAvailable.slice(0, Math.min(10, allAvailable.length));
  featured = featured.slice(0, MAX_HOME);
  let latest = unique(parseLatestSeries(latestHtml || ""));
  if (!latest.length) latest = unique(parseLatestSeries(homeHtml));
  latest = latest.filter((x) => !featured.some((y) => y.id === x.id)).slice(0, MAX_HOME);
  let trends = unique(parseSeries(trendsHtml));
  if (trends.length < 3) trends = allAvailable;
  trends = trends.filter((x) => !featured.some((y) => y.id === x.id) && !latest.some((y) => y.id === x.id)).slice(0, MAX_HOME);
  return [
    // Cada fila tiene su propio ref: Kino usa este valor para «Ver más»,
    // mientras que el ref de cada tarjeta sigue apuntando a la ficha de la serie.
    { id: "destacados", ref: "destacados", title: "Destacados", items: featured },
    { id: "ultimos-episodios", ref: "ultimos-episodios", title: "Últimos episodios", items: latest },
    { id: "tendencias", ref: "tendencias", title: "Tendencias", items: trends }
  ].filter((row) => row.items.length);
}

export async function home() {
  await null;
  const results = await Promise.all([
    getText(BASE + "/").catch((e) => { log("Falló el inicio", e.message); return ""; }),
    getText(BASE + "/ultimos-episodios").catch((e) => { log("Falló últimos episodios", e.message); return ""; }),
    getText(SERIES).catch((e) => { log("Falló el catálogo", e.message); return ""; })
  ]);
  let homeHtml = results[0];
  const latestHtml = results[1];
  const catalogHtml = results[2];
  if (!homeHtml) homeHtml = catalogHtml;
  const rows = parseHomeRows(homeHtml, latestHtml, catalogHtml);
  if (rows.length) return rows;
  return [{ id: "destacados", title: "Destacados", genre: "anime", items: unique(parseSeries(homeHtml)).slice(0, MAX_HOME) }];
}

export async function browse(ref, cursor) {
  await null;
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw kino.error("not_found", "La página solicitada no existe");
  let url;
  if (ref === "destacados" || ref === "tendencias") url = BASE + "/";
  else if (ref === "ultimos-episodios") url = BASE + "/ultimos-episodios";
  else if (ref === "series") url = SERIES + (page > 1 ? "?page=" + page : "");
  else throw kino.error("not_found", "La categoría solicitada no existe");
  let html = await getText(url);
  if (ref === "destacados") html = sectionSlice(html, "(?:te recomendamos para vos|recomendados|destacados)", 65000) || html;
  if (ref === "tendencias") html = sectionSlice(html, "tendencias", 45000) || html;
  const items = unique(parseSeries(html));
  return { items, next: items.length === MAX_PAGE && page < 100 ? String(page + 1) : undefined };
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
