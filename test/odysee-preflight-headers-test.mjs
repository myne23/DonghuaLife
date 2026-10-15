import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/odysee-header-test";
const embedUrl = "https://odysee.com/$/embed/@dlife:3/Sgls3c-1:2";
const mediaUrl = "https://secure.odycdn.com/api/v4/streams/free/test-claim/test-hash/video.mp4?hash77=opaque";
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{playerConfig:{sources:[
    {label:"rumble",provider:"rumble",token:"token-rumble",priority:1,isWorking:true},
    {label:"odysee",provider:"odysee",token:"token-odysee",priority:2,isWorking:true}
  ]}}}}) +
  '</script></html>';
const providerHtml = "<html><body><video></video></body></html>";
const capturedHeaders = {
  accept: "*/*",
  "access-control-request-headers": "range,content-type",
  "access-control-request-method": "GET",
  origin: "https://odysee.com",
  referer: "https://odysee.com/$/embed/@dlife:3/Sgls3c-1:2",
  "user-agent": "Mozilla/5.0 Kino capture"
};

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;},json(){return JSON.parse(html);}};
    }
    if (url === "https://donghualife.com/api/player/source") {
      const token = options.body?.json?.token;
      if (token === "token-rumble") {
        return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:"https://rumble.com/video.mp4"});}};
      }
      if (token === "token-odysee") {
        return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:embedUrl});}};
      }
    }
    if (url === embedUrl) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return providerHtml;}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: {
    async capture(url) {
      assert.equal(url, embedUrl);
      return {finalUrl:embedUrl,subtitles:[],media:[{url:mediaUrl,mime:"video/mp4",headers:capturedHeaders}]};
    }
  }
};

const plugin = await import("../plugin.js?odysee-preflight-header-test=1");
const primary = await plugin.resolve("/watch/odysee-header-test");
assert.equal(primary.url, "https://rumble.com/video.mp4");
const odyseeAlternative = primary.alternatives.find((item) => /odysee/i.test(item.label));
assert.ok(odyseeAlternative?.ref, "Odysee debe seguir siendo una alternativa diferida");
const odysee = await plugin.resolve(odyseeAlternative.ref);
assert.equal(odysee.url, mediaUrl);
assert.equal(odysee.mime, "video/mp4");
assert.equal(odysee.headers.origin, "https://odysee.com");
assert.equal(odysee.headers.referer, "https://odysee.com/$/embed/@dlife:3/Sgls3c-1:2");
assert.equal(odysee.headers["user-agent"], "Mozilla/5.0 Kino capture");
assert.ok(!("access-control-request-headers" in odysee.headers), "No se debe reenviar el encabezado de preflight");
assert.ok(!("access-control-request-method" in odysee.headers), "No se debe reenviar el método de preflight");
assert.ok(logs.some((line) => line.includes("Se filtraron cabeceras de preflight para reproducción Odysee")));
console.log("Odysee: se conservan Referer/Origin/User-Agent y se eliminan encabezados de preflight.");
