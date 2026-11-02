import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { checkExternal, classify, extractLinks, externalVerdict, run } from "./check-links.mjs";

test("classify resolves relative, absolute and same origin links", () => {
  assert.deepEqual(classify("../about/", "/en/work/x/"), { kind: "internal", path: "/en/work/about/", hash: "" });
  assert.deepEqual(classify("/#casos", "/en/"), { kind: "internal", path: "/", hash: "casos" });
  assert.deepEqual(classify("https://www.ramirocerda.com.ar/en/", "/"), { kind: "internal", path: "/en/", hash: "" });
  assert.equal(classify("https://kano.studio/", "/").kind, "external");
  assert.equal(classify("mailto:a@b.c", "/").kind, "skip");
});

test("extractLinks ignores preconnect origins", () => {
  const html = '<link rel="preconnect" href="https://fonts.gstatic.com"><a href="/a/">a</a><img src="/x.png">';
  assert.deepEqual(extractLinks(html), ["/a/", "/x.png"]);
});

test("run flags missing pages and anchors, passes valid ones", async () => {
  const dist = await mkdtemp(path.join(tmpdir(), "links-"));
  await mkdir(path.join(dist, "en"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), '<a href="/en/">en</a><a href="#casos">c</a><section id="casos"></section><a href="/nope/">x</a><a href="/en/#missing">m</a>');
  await writeFile(path.join(dist, "en", "index.html"), '<a href="/">es</a>');
  const { broken } = await run(dist, { log: () => {} });
  assert.deepEqual(
    broken.map((b) => b.href),
    ["/nope/", "/en/#missing"],
  );
});

test("external verdicts: 404 and DNS fail, bot blocks warn", async () => {
  assert.equal(externalVerdict({ status: 200 }), "ok");
  assert.equal(externalVerdict({ status: 404 }), "broken");
  assert.equal(externalVerdict({ status: 0, error: "ENOTFOUND" }), "broken");
  assert.equal(externalVerdict({ status: 403 }), "warn");
  assert.equal(externalVerdict({ status: 503 }), "warn");
});

test("checkExternal falls back to GET when HEAD is rejected", async () => {
  const methods = [];
  const fetchImpl = async (_url, init) => {
    methods.push(init.method);
    return new Response(null, { status: init.method === "HEAD" ? 405 : 200 });
  };
  const result = await checkExternal("https://example.com/", { fetchImpl, retries: 1 });
  assert.equal(result.status, 200);
  assert.deepEqual(methods, ["HEAD", "GET"]);
});
