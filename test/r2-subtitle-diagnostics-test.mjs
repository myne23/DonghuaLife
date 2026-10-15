import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/el-inmortal-renegado-1-161";
const html = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"playerConfig":{"playbackId":"opaque","subtitleTracks":[{"language":"es","format":"vtt"}],"videoSource":null}}}}</script></html>';

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input) {
    const url = String(input);
    if (url === watchUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},async text(){return html;},async json(){return JSON.parse(html);}};
    if (url === "https://videos.donghualife.com/episodes/test/master.m3u8") {
      return {ok:true,status:200,headers:{"content-type":"application/vnd.apple.mpegurl"},text(){return "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n";}};
    }
    throw new Error("URL inesperada en prueba R2/subtítulos: " + url);
  },
  browser: {
    async page(url) {
      assert.equal(url, watchUrl);
      return {html,finalUrl:url,status:200,truncated:false};
    },
    async capture(url) {
      assert.equal(url, watchUrl);
      return {
        finalUrl:url,
        media:[{url:"https://videos.donghualife.com/episodes/test/master.m3u8",mime:"application/vnd.apple.mpegurl",headers:{Referer:"https://donghualife.com/","User-Agent":"KinoTest"}}],
        subtitles:[{url:"https://videos.donghualife.com/episodes/test/es.vtt",lang:"es"}]
      };
    }
  }
};

const plugin = await import("../plugin.js?r2-subtitle-diagnostics-test=1");
const stream = await plugin.resolve("/watch/el-inmortal-renegado-1-161");
assert.equal(stream.mime,"application/vnd.apple.mpegurl");
assert.deepEqual(stream.subtitles,[{lang:"es",url:"https://videos.donghualife.com/episodes/test/es.vtt",format:"vtt"}]);
const playerDiagnostic = logs.find((line) => line.includes("Diagnóstico HTML de reproductor para resolver fuente nativa"));
assert.ok(playerDiagnostic,"Debe registrar las pistas de estructura del HTML/Next");
assert.ok(playerDiagnostic.includes('"hasNextData":true'));
assert.ok(playerDiagnostic.includes('"hasSubtitleText":true'));
assert.ok(playerDiagnostic.includes("subtitleTracks"),"Debe registrar nombres de claves relevantes sin valores privados");
const subtitleDiagnostic = logs.find((line) => line.includes("Diagnóstico de subtítulos capturados"));
assert.ok(subtitleDiagnostic,"Debe indicar si la captura encontró subtítulos");
assert.ok(subtitleDiagnostic.includes('"compatibles":1'));
assert.ok(subtitleDiagnostic.includes('"lang":"es"'));

console.log("Diagnóstico R2/subtítulos correcto: las pistas españolas se conservan y los logs identifican claves sin volcar URLs.");
