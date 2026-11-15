const test = require("node:test");
const assert = require("node:assert/strict");
const { sharedSite, sameSite } = require("./policy.cjs");

test("shared HTTPS and loopback development origins are supported", () => {
  for (const url of ["https://app.example.test/", "http://127.0.0.1:8080", "http://localhost", "http://[::1]"]) {
    assert.equal(sharedSite(url).origin, new URL(url).origin);
  }
});
test("plain HTTP outside loopback and non-web schemes are rejected", () => {
  for (const url of ["http://remote.example", "http://localhost.example", "file:///tmp/a", "javascript:alert(1)", "data:text/html,hi", "https://person:pass@app.example.test"]) {
    assert.throws(() => sharedSite(url));
  }
});
test("same-site navigation preserves scheme, hostname and port", () => {
  const origin = "https://app.example.test";
  assert.equal(sameSite(origin + "/api/bookings/3", origin), true);
  for (const url of [origin + ".example", origin + ":9000", "http://app.example.test", "https://app.example.test@outside.test", "invalid"]) {
    assert.equal(sameSite(url, origin), false);
  }
});
