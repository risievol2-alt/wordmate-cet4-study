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

test("server-renders the Office vocabulary application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Wordmate · Office 英文界面词汇陪练<\/title>/i);
  assert.match(html, /把英文界面，练成熟悉操作。/);
  assert.match(html, /随机学习/);
  assert.match(html, /复习列表/);
  assert.match(html, /纠错练习/);
  assert.match(html, /正在装载 Office 界面词库/);
  assert.match(html, /PowerPoint/);
});

test("ships categorized Office vocabulary and stable quiz controls", async () => {
  const [page, vocabulary] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/office.tsv", import.meta.url), "utf8"),
  ]);

  const entries = vocabulary.split(/\r?\n/).filter(Boolean);
  assert.equal(entries.length, 974);
  const parsed = entries.map((entry) => entry.split("\t"));
  assert.ok(parsed.every((entry) => entry.length === 3));
  assert.deepEqual(
    Object.fromEntries(
      ["common", "word", "excel", "powerpoint"].map((category) => [
        category,
        parsed.filter((entry) => entry[2] === category).length,
      ]),
    ),
    { common: 178, word: 232, excel: 281, powerpoint: 283 },
  );
  assert.equal(new Set(parsed.map((entry) => entry[0].toLowerCase())).size, 974);
  const commonCount = parsed.filter((entry) => entry[2] === "common").length;
  assert.deepEqual(
    Object.fromEntries(
      ["word", "excel", "powerpoint"].map((category) => [
        category,
        commonCount + parsed.filter((entry) => entry[2] === category).length,
      ]),
    ),
    { word: 410, excel: 459, powerpoint: 461 },
  );

  assert.match(page, /speechSynthesis/);
  assert.match(page, /localStorage/);
  assert.match(page, /nextTimerRef/);
  assert.match(page, /clearTimeout\(nextTimerRef\.current\)/);
  assert.match(page, /setTimeout/);
  assert.match(page, /switchCategory/);
  assert.match(
    page,
    /selected !== "common" &&\s*entry\.category === "common"/,
  );
});
