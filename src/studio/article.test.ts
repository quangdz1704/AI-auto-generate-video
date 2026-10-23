import { afterEach, beforeEach, expect, it, vi } from "vitest";
import nock from "nock";
import { readArticle } from "./article.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
beforeEach(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

it("extracts readable text from an article and strips scripts", async () => {
  const paragraph =
    "Một câu chuyện rõ ràng giúp người xem hiểu nội dung và ghi nhớ điều quan trọng. Hình ảnh và giọng đọc tạo thành nhịp điệu cho video. ";
  nock("https://article.example")
    .get("/news")
    .reply(
      200,
      `<!doctype html><html><head><title>Câu chuyện mới</title></head><body><article><h1>Câu chuyện mới</h1><p>${paragraph.repeat(8)}</p></article><script>window.hidden='do not read';</script></body></html>`,
      { "content-type": "text/html" },
    );
  const article = await readArticle("https://article.example/news");
  expect(article.title).toContain("Câu chuyện mới");
  expect(article.text).toContain("Hình ảnh và giọng đọc");
  expect(article.text).not.toContain("window.hidden");
});

it("blocks redirects to internal network addresses", async () => {
  nock("https://article.example")
    .get("/redirect")
    .reply(302, undefined, { Location: "http://127.0.0.1/private" });
  await expect(readArticle("https://article.example/redirect")).rejects.toThrow(
    /URL công khai/,
  );
});
