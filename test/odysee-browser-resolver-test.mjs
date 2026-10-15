import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/odysee-browser-test";
const embedUrl = "https://odysee.com/$/embed/@dlife:3/Sgls3c-1:2";
const secureUrl = "https://secure.odycdn.com/api/v4/streams/free/test-claim/test-hash/video.mp4?hash77=opaque";
const playerUrl = secureUrl.replace("secure.odycdn.com", "player.odycdn.com");
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{playerConfig:{sources:[
    {label:"rumble",provider:"rumble",token:"token-rumble",priority:1,isWorking:true},
    {label:"odysee",provider:"odysee",token:"token-odysee",priority:2,isWorking:true}
  ]}}}}) + '</script></html>';
const calls = [];

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;},json(){return JSON.parse(html);}};
    if (url === "https://donghualife.com/api/player/source") {
      const token = options.body?.json?.token;
      if (token === "token-rumble") return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:"https://rumble.com/video.mp4"});}};
      if (token === "token-odysee") return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:embedUrl});}};
    }
    if (url === embedUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return "<html><body><video></video></body></html>";}};
    if (url === secureUrl || url === playerUrl) {
      calls.push({url,options});
      if (url === secureUrl) return {ok:false,status:429,url,headers:{},text(){return "rate limited";}};
      return {ok:true,status:206,url,headers:{"content-type":"video/mp4"},text(){return "x";}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: {
    async capture(url, options = {}) {
      assert.equal(url, embedUrl);
      assert.equal(options.autoplay, true);
      assert.match(options.match, /odycdn/);
      assert.ok(new RegExp(options.match, "i").test(secureUrl), "El filtro de captura debe coincidir con la URL real del medio");
      return {finalUrl:embedUrl,subtitles:[],media:[{url:secureUrl,mime:"video/mp4",headers:{
        accept:"*/*",
        "access-control-request-headers":"range,content-type",
        "access-control-request-method":"GET",
        origin:"https://odysee.com",
        referer:embedUrl,
        "user-agent":"Mozilla/5.0 Kino capture"
      }}]};
    }
  }
};

const plugin = await import("../plugin.js?odysee-browser-resolver-test=1");
const primary = await plugin.resolve("/watch/odysee-browser-test");
assert.equal(primary.url, "https://rumble.com/video.mp4");
const alternative = primary.alternatives.find((item) => /odysee/i.test(item.label));
assert.ok(alternative?.ref);
const odysee = await plugin.resolve(alternative.ref);
assert.equal(odysee.url, playerUrl, "Si el host secure devuelve 429, debe probar el host público player");
assert.equal(odysee.mime, "video/mp4");
assert.equal(odysee.headers.referer, embedUrl);
assert.equal(odysee.headers.origin, "https://odysee.com");
assert.equal(odysee.headers["user-agent"], "Mozilla/5.0 Kino capture");
assert.ok(!("access-control-request-headers" in odysee.headers));
assert.ok(!("access-control-request-method" in odysee.headers));
assert.equal(calls.length, 2);
assert.ok(logs.some((line) => line.includes("Prueba de URL Odysee") && line.includes("host-gratuito")));
console.log("Odysee: el resolvedor de navegador prueba el host público para rutas free y conserva encabezados de reproducción válidos.");
