import assert from "node:assert/strict";

const logs = [];

globalThis.kino = {
  log(...args) { logs.push(args.join(" ")); },
  error(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  },
  async fetch(input) {
    assert.equal(String(input), "https://donghualife.com/watch/r2-native-test");
    // Simula el JSON público que Next entrega en el HTML inicial. La URL está
    // dentro de un array, no en un atributo src/file/url, así que debe hallarla
    // extractSourceCandidates y resolverla sin abrir/capturar el reproductor.
    const body = '<html><script>window.__PLAYER__={"media":["https://videos.donghualife.com/episodes/test/master.m3u8"]};</script></html>';
    return { ok: true, status: 200, async text() { return body; } };
  },
  browser: {
    async capture() {
      throw new Error("No debería usar browser.capture para una fuente R2 presente en el HTML");
    }
  }
};

const plugin = await import("../plugin.js?r2-native-test=1");
const stream = await plugin.resolve("/watch/r2-native-test");
assert.equal(stream.url, "https://videos.donghualife.com/episodes/test/master.m3u8");
assert.equal(stream.mime, "application/vnd.apple.mpegurl");
assert.equal(stream.label, "R2 · HLS");
assert.equal(stream.headers.Referer, "https://donghualife.com/");
assert.equal(stream.headers.Origin, "https://donghualife.com");
assert.ok(logs.some((line) => line.includes("Fuente R2 resuelta desde HTML/JSON público, sin captura de red")));

console.log("R2 nativo correcto: URL extraída del HTML, sin usar browser.capture.");
