import assert from "node:assert/strict";

const logs = [];
const watchUrl = "https://donghualife.com/watch/el-inmortal-renegado-1-161";
const masterUrl = "https://videos.donghualife.com/episodes/test/master.m3u8";
const subtitleId = "12345678-1234-1234-1234-123456789abc";
const ass = "[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.40,Default,,0,0,0,,Hola mundo";
const html = '<html><script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({props:{pageProps:{episodeId:"episode-161",playerConfig:{sources:[
    {label:"R2 principal",token:"token-r2-test",provider:"r2",priority:1,isWorking:true}
  ]}}}}) + '</script></html>';

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  async fetch(input, options = {}) {
    const url = String(input);
    if (url === watchUrl) return {ok:true,status:200,headers:{"content-type":"text/html"},text(){return html;},json(){return JSON.parse(html);}};
    if (url === "https://donghualife.com/api/player/source") {
      assert.equal(options.method, "POST");
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({url:masterUrl});},json(){return {url:masterUrl};}};
    }
    if (url === masterUrl) return {ok:true,status:200,headers:{"content-type":"application/vnd.apple.mpegurl"},text(){return "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n";}};
    if (url === "https://donghualife.com/api/subtitles?episodeId=episode-161") {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({subtitles:[{id:subtitleId,language:"es"}]});},json(){return {subtitles:[{id:subtitleId,language:"es"}]};}};
    }
    if (url === "https://donghualife.com/api/subtitles/" + subtitleId) {
      return {ok:true,status:200,headers:{"content-type":"application/json"},text(){return JSON.stringify({success:true,label:"Español",language:"es",content:ass});},json(){return {success:true,label:"Español",language:"es",content:ass};}};
    }
    throw new Error("No debe hacer sondeos especulativos de URL de subtítulos: " + url);
  }
};

const plugin = await import("../plugin.js?r2-inline-subtitle-delivery-test=1");
const stream = await plugin.resolve("/watch/el-inmortal-renegado-1-161");
assert.equal(stream.url, masterUrl);
assert.equal(stream.subtitles, undefined, "ASS inline no debe anunciarse como pista de archivo compatible");
assert.ok(logs.some((line) => line.includes("Subtítulo R2 encontrado en ASS inline; Kino requiere una URL VTT/SRT")));
assert.ok(!logs.some((line) => line.includes("format=vtt") || line.includes("raw=1") || line.includes("suffix=.srt")),
  "No debe sondear variantes especulativas de entrega");
console.log("R2: mantiene la detección honesta de ASS inline y evita los sondeos lentos de URL.");
