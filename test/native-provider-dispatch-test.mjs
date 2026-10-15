import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/provider-test-1-1";
const embedUrl = "https://www.dailymotion.com/embed/video/abc123";
const mediaUrl = "https://cdn-123.dmcdn.net/sec/test/video.m3u8";
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{playerConfig:{sources:[
    {label:"Dailymotion",token:"token-dm-test",provider:"dailymotion",priority:1,isWorking:true}
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
      assert.equal(options.method, "POST");
      assert.equal(options.body.json.token, "token-dm-test");
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:embedUrl});}};
    }
    if (url === "https://www.dailymotion.com/player/metadata/video/abc123") {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({qualities:{auto:[{url:mediaUrl}]}});}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: { async capture() { throw new Error("No debería capturar el embed resuelto por metadata"); } }
};

const plugin = await import("../plugin.js?native-provider-dispatch-test=1");
const stream = await plugin.resolve("/watch/provider-test-1-1");
assert.equal(stream.url, mediaUrl);
assert.equal(stream.mime, "application/vnd.apple.mpegurl");
assert.ok(logs.some((line) => line.includes("Fuente resuelta por API propia de DonghuaLife")));

console.log("Despacho de embed correcto: el token entrega un embed Dailymotion y el resolvedor manual obtiene el HLS.");
