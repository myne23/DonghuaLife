import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/odysee-native-direct-test";
const secureUrl = "https://secure.odycdn.com/api/v4/streams/free/claim/hash/video.mp4?sig=opaque";
const playerUrl = secureUrl.replace("secure.odycdn.com", "player.odycdn.com");
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{playerConfig:{sources:[
    {label:"rumble",provider:"rumble",token:"token-rumble",priority:1,isWorking:true},
    {label:"odysee",provider:"odysee",token:"token-odysee",priority:2,isWorking:true}
  ]}}}}) + '</script></html>';

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;}};
    if (url === "https://donghualife.com/api/player/source") {
      const token = options.body?.json?.token;
      if (token === "token-rumble") return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:"https://rumble.com/video.mp4"});}};
      if (token === "token-odysee") return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:secureUrl});}};
    }
    if (url === secureUrl || url === playerUrl) {
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Range, "bytes=0-0");
      assert.equal(options.headers.Referer, "https://odysee.com/");
      assert.equal(options.headers.Origin, "https://odysee.com");
      if (url === secureUrl) return {ok:false,status:401,url,headers:{},text(){return "unauthorized";}};
      return {ok:true,status:206,url,headers:{"content-type":"video/mp4"},text(){return "x";}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: { async capture() { throw new Error("La URL directa de la API no debe requerir captura del navegador"); } }
};

const plugin = await import("../plugin.js?odysee-native-direct-source-test=1");
const stream = await plugin.resolve("/watch/odysee-native-direct-test");
assert.equal(stream.url, "https://rumble.com/video.mp4");
const alternative = stream.alternatives.find((item) => /odysee/i.test(item.label));
assert.ok(alternative, "Odysee debe conservarse como alternativa");
assert.equal(alternative.url, playerUrl, "Si el enlace directo secure devuelve 401, debe probar player.odycdn.com");
assert.equal(alternative.mime, "video/mp4");
assert.equal(alternative.headers.Referer, "https://odysee.com/");
assert.equal(alternative.headers.Origin, "https://odysee.com");
assert.ok(logs.some((line) => line.includes("Prueba de URL Odysee API") && line.includes("HTTP 401")));
assert.ok(logs.some((line) => line.includes("Prueba de URL Odysee API") && line.includes("player.odycdn.com") && line.includes("HTTP 206")));

console.log("Odysee API directa: detecta HTTP 401 en secure y conserva player.odycdn.com cuando responde 206.");
