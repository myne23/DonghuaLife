import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/el-inmortal-renegado-1-161";
const masterUrl = "https://videos.donghualife.com/episodes/test/master.m3u8";
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{episodeId:"episode-161",playerConfig:{sources:[
    {label:"R2 principal",token:"token-r2-test",provider:"r2",priority:1,isWorking:true}
  ]}}}}) +
  '</script></html>';

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) {
      return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;},json(){return JSON.parse(html);}};
    }
    if (url === "https://donghualife.com/api/player/source") {
      assert.equal(options.method, "POST");
      assert.deepEqual(options.body, {json:{token:"token-r2-test"}});
      assert.equal(options.headers.Origin, "https://donghualife.com");
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:masterUrl});},json(){return {url:masterUrl};}};
    }
    if (url === masterUrl) {
      return {ok:true,status:200,headers:{"content-type":"application/vnd.apple.mpegurl"},text(){return [
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Español",LANGUAGE="es",URI="es.vtt"',
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:1"
      ].join("\n");}};
    }
    if (url === "https://videos.donghualife.com/episodes/test/es.vtt") {
      return {ok:true,status:200,headers:{"content-type":"text/vtt"},text(){return "WEBVTT";}};
    }
    if (url === "https://donghualife.com/api/subtitles?episodeId=episode-161") {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({subtitles:[
        {id:"12345678-1234-1234-1234-123456789abc",language:"es",url:"https://videos.donghualife.com/episodes/test/api-es.vtt"}
      ]});},json(){return {subtitles:[
        {id:"12345678-1234-1234-1234-123456789abc",language:"es",url:"https://videos.donghualife.com/episodes/test/api-es.vtt"}
      ]};}};
    }
    if (url === "https://videos.donghualife.com/episodes/test/api-es.vtt") {
      return {ok:true,status:200,headers:{"content-type":"text/vtt"},text(){return "WEBVTT";}};
    }
    throw new Error("URL inesperada: " + url);
  },
  browser: {
    async capture() { throw new Error("No debería usar browser.capture si la API nativa responde"); }
  }
};

const plugin = await import("../plugin.js?native-player-api-test=1");
const stream = await plugin.resolve("/watch/el-inmortal-renegado-1-161");
assert.equal(stream.url, masterUrl);
assert.equal(stream.mime, "application/vnd.apple.mpegurl");
assert.equal(stream.headers.Referer, "https://donghualife.com/");
assert.ok(stream.subtitles.some((item) => item.url === "https://videos.donghualife.com/episodes/test/es.vtt"));
assert.ok(stream.subtitles.some((item) => item.url === "https://videos.donghualife.com/episodes/test/api-es.vtt"));
assert.ok(logs.some((line) => line.includes("Fuente resuelta por API propia de DonghuaLife")));

console.log("Resolver nativo correcto: POST de token, HLS R2 y subtítulos de manifiesto/API sin browser.capture.");
