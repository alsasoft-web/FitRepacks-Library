import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadDlpsgameHook() {
  const hookPath = path.resolve(process.cwd(), "ab_hooks/dlpsgame.js");
  const code = fs.readFileSync(hookPath, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Buffer,
    TextDecoder,
    atob,
    URL,
    Map,
    Set,
    console,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: false, json: async () => [] }),
    collections: { get: () => null, create: () => {}, update: () => {} },
    cronAdd: () => {},
    routerAdd: () => {},
    log: () => {},
  };
  vm.runInNewContext(code, sandbox, { filename: hookPath });
  return sandbox;
}

test("dlpsgame hook decodes Base64 download blocks and skips guide links", () => {
  const ctx = loadDlpsgameHook();
  const payloadHtml =
    '<p>REGION: EUR</p><p><a href="https://downloadgameps3.net/archives/123">Here</a></p><p><a href="https://downloadgameps3.net/guide-download-game/">Guide</a></p>';
  const b64 = Buffer.from(payloadHtml, "utf8").toString("base64");
  const html = `<div class="secure-data" data-payload="${b64}">Loading</div>`;

  const downloads = ctx.parseDownloadBlocks(html);
  assert.equal(downloads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(downloads[0].links)), [
    { label: "Here", url: "https://downloadgameps3.net/archives/123" },
  ]);
});

test("dlpsgame hook parses metadata table, description, and trailer", () => {
  const ctx = loadDlpsgameHook();
  const post = {
    id: 42,
    title: { rendered: "Crash &#8211; Test" },
    link: "https://dlpsgame.com/crash-test/",
    date: "2026-11-19T00:00:00",
    modified: "2026-11-19T00:00:00",
    categories: [1],
    yoast_head_json: { og_image: [{ url: "https://dlpsgame.com/cover.jpg" }] },
    content: {
      rendered: `
        <table><tr><td>NAME</td><td>Crash Test</td></tr><tr><td>GENRE</td><td>Action</td></tr></table>
        <iframe src="https://www.youtube.com/embed/abc123"></iframe>
        <blockquote>Great game!</blockquote>
      `,
    },
  };
  const parsed = ctx.parsePost(post, new Map([[1, "PS5"]]));
  assert.equal(parsed.post_id, "42");
  assert.equal(parsed.title, "Crash \u2013 Test");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.categories)), ["PS5"]);
  assert.equal(parsed.metadata.genre, "Action");
  assert.equal(parsed.trailer_url, "https://www.youtube.com/embed/abc123");
  assert.equal(parsed.description, "Great game!");
});
