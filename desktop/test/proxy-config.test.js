const test = require("node:test");
const assert = require("node:assert/strict");

function normalizeProxy(input = {}) {
  const type = input.type === "socks5" ? "socks5" : "http";
  const host = String(input.host || "").trim().slice(0, 255);
  const rawPort = Number.parseInt(String(input.port || ""), 10);
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 0;
  const username = String(input.username || "").trim().slice(0, 255);
  return { enabled: Boolean(input.enabled), type, host, port, username };
}

test("normalizes HTTP proxy input", () => {
  assert.deepEqual(normalizeProxy({ enabled: true, type: "http", host: " 1.2.3.4 ", port: "8080", username: "u" }), {
    enabled: true,
    type: "http",
    host: "1.2.3.4",
    port: 8080,
    username: "u"
  });
});

test("normalizes SOCKS5 and rejects invalid port to zero", () => {
  assert.deepEqual(normalizeProxy({ enabled: true, type: "socks5", host: "proxy.local", port: "99999" }), {
    enabled: true,
    type: "socks5",
    host: "proxy.local",
    port: 0,
    username: ""
  });
});
