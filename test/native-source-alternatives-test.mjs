import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/source-test-1-1";
const masterUrl = "https://videos.donghualife.com/episodes/source-test/master.m3u8";
const embedUrl = "https://www.dailymotion.com/embed/video/abc123";
const dmUrl = "https://cdndirector.dailymotion.com/cdn/manifest/video/abc123.m3u8";
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{episodeId:"episode-source-test",playerConfig:{sources:[
    {label:"R2",token:"token-r2-test",provider:"R2",priority:1,isWorking:true},
    {label:"Dailymotion",token:"token-dm-test",provider:"dailymotion",priority:2,isWorking:true}
  ]}}}}) +
  '</script></html>';

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;}};
    }
    if (url === "https://donghualife.com/api/player/source") {
      const token = options.body && options.body.json && options.body.json.token;
      if (token === "token-r2-test") {
        return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:masterUrl});}};
      }
      if (token === "token-dm-test") {
        return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:embedUrl});}};
      }
    }
    if (url === "https://www.dailymotion.com/player/metadata/video/abc123") {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({qualities:{auto:[{url:dmUrl}]}});}};
    }
    if (url === masterUrl) {
      return {ok:true,status:200,headers:{"content-type":"application/vnd.apple.mpegurl"},text(){return "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n";}};
    }
    if (url === "https://donghualife.com/api/subtitles?episodeId=episode-source-test") {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({subtitles:[]});},json(){return {subtitles:[]};}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: { async capture() { throw new Error("No debería usar browser.capture para fuentes nativas"); } }
};

const plugin = await import("../plugin.js?native-source-alternatives-test=1");
const stream = await plugin.resolve("/watch/source-test-1-1");
assert.equal(stream.url, masterUrl, "R2, de mayor prioridad, debe seguir siendo la fuente principal");
assert.ok(Array.isArray(stream.alternatives), "Las otras fuentes resueltas deben exponerse como alternativas");
const dailymotion = stream.alternatives.find((item) => /dailymotion/i.test(item.label));
assert.ok(dailymotion, "Dailymotion debe aparecer en el menú de servidores");
assert.equal(dailymotion.url, dmUrl);
assert.equal(dailymotion.mime, "application/vnd.apple.mpegurl");
assert.ok(dailymotion.headers && dailymotion.headers.Referer, "La alternativa conserva los headers del proveedor");
assert.ok(logs.some((line) => line.includes("Fuentes reproducibles del reproductor") && line.includes("Dailymotion")));

console.log("Fuentes nativas: R2 queda principal y Dailymotion se ofrece como alternativa seleccionable.");
