import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Wordmate application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Wordmate · 四级词汇陪练<\/title>/i);
  assert.match(html, /今天，再记住一个。/);
  assert.match(html, /随机学习/);
  assert.match(html, /复习列表/);
  assert.match(html, /纠错练习/);
  assert.match(html, /正在装载四级词库/);
});

test("ships the complete vocabulary and stable quiz controls", async () => {
  const [page, vocabulary] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/cet4.tsv", import.meta.url), "utf8"),
  ]);

  const entries = vocabulary.split(/\r?\n/).filter(Boolean);
  assert.equal(entries.length, 7508);
  assert.ok(entries.every((entry) => entry.includes("\t")));

  assert.match(page, /speechSynthesis/);
  assert.match(page, /localStorage/);
  assert.match(page, /nextTimerRef/);
  assert.match(page, /clearTimeout\(nextTimerRef\.current\)/);
  assert.match(page, /setTimeout/);
});
