import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const longOdyseeToken = ":".repeat(220);
const sources = [
  { provider: "rumble", label: "rumble", token: "rumble-token", isWorking: true, priority: 1 },
  { provider: "odysee", label: "odysee", token: longOdyseeToken, isWorking: true, priority: 2 }
];
const playerPayload = '<html><script>window.__PLAYER__=' + JSON.stringify({ sources }) + ';</script></html>';
const stored = new Map();
let resolveOdyseeNow = false;
const requests = [];

globalThis.kino = {
  log() {},
  error(code, message) { const error = new Error(message); error.code = code; return error; },
  crypto: {
    hash(algorithm, value) {
      assert.equal(algorithm, "sha256");
      return createHash("sha256").update(value).digest("hex");
    }
  },
  storage: {
    set(key, value, options) {
      assert.equal(options.ttlMs, 600000);
      stored.set(key, value);
    },
    get(key) { return stored.get(key) ?? null; }
  },
  async fetch(input, options = {}) {
    const url = String(input);
    requests.push({ url, options });
    if (url === "https://donghualife.com/watch/odysee-test") {
      return { ok: true, status: 200, text() { return playerPayload; } };
    }
    if (url === "https://donghualife.com/api/player/source") {
      const token = options.body?.json?.token;
      if (token === "rumble-token") {
        return { ok: true, status: 200, text() { return JSON.stringify({ url: "https://rumble.com/video.mp4" }); } };
      }
      if (token === longOdyseeToken && resolveOdyseeNow) {
        return { ok: true, status: 200, text() { return JSON.stringify({ url: "https://odysee.com/video.mp4" }); } };
      }
      return { ok: true, status: 200, text() { return "{}"; } };
    }
    throw new Error("URL inesperada en prueba de alternativa Odysee: " + url);
  }
};

const plugin = await import("../plugin.js?odysee-long-token-test=1");
const stream = await plugin.resolve("/watch/odysee-test");
assert.equal(stream.url, "https://rumble.com/video.mp4", "Rumble debe seguir siendo la fuente principal");
assert.equal(stream.alternatives.length, 1, "Odysee debe conservarse como alternativa diferida");
const alternative = stream.alternatives[0];
assert.equal(alternative.label, "odysee");
assert.ok(alternative.ref.startsWith("native-token-ref:"), "Un token largo debe usar una referencia corta de almacenamiento");
assert.ok(alternative.ref.length <= 512, "La referencia de Kino no debe superar 512 caracteres");
const key = alternative.ref.slice("native-token-ref:".length);
assert.equal(stored.get("native-source-token:" + key), longOdyseeToken, "El token debe guardarse sin exponerlo en la referencia");
resolveOdyseeNow = true;
const odysee = await plugin.resolve(alternative.ref);
assert.equal(odysee.url, "https://odysee.com/video.mp4", "Kino debe poder resolver la alternativa Odysee usando el token guardado");
assert.ok(requests.some((request) => request.options.body?.json?.token === longOdyseeToken), "La resolución diferida debe recuperar el token original");
console.log("Alternativa Odysee: tokens largos usan refs cortas y se resuelven correctamente.");
