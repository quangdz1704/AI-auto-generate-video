import axios from "axios";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export function isPrivateAddress(address: string) {
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      address,
    ) ||
    address === "::1" ||
    address === "::" ||
    /^(fc|fd|fe80)/i.test(address) ||
    address.toLowerCase().startsWith("::ffff:")
  );
}

/** Fetch readable article text; the AI never receives page scripts or instructions as tools. */
export async function readArticle(source: string) {
  let url = new URL(source);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("URL phải là bài báo HTTP/HTTPS công khai.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host }]
      : await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
      throw new Error(
        "Chỉ đọc URL công khai; dùng ô văn bản cho nội dung nội bộ.",
      );
    const response = await axios.get<string>(url.href, {
      responseType: "text",
      timeout: 20000,
      maxRedirects: 0,
      maxContentLength: 5_000_000,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { "User-Agent": "VideoStudio/1.0", Accept: "text/html" },
      // Pin the validated DNS answer for this connection to avoid rebinding.
      lookup: (_hostname, options, callback) => {
        const opts = (typeof options === "object" ? options : {}) as {
          all?: boolean;
        };
        if (opts.all) callback(null, addresses as any);
        else
          callback(
            null,
            addresses[0].address,
            isIP(addresses[0].address) as 4 | 6,
          );
      },
    });
    if (response.status >= 300) {
      if (!response.headers.location)
        throw new Error("URL chuyển hướng không hợp lệ.");
      url = new URL(response.headers.location, url);
      continue;
    }
    const { document } = parseHTML(response.data);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim();
    if (!text || text.length < 80)
      throw new Error(
        "Không đọc được nội dung bài. Hãy sao chép nội dung vào ô văn bản.",
      );
    return {
      title: article?.title ?? "Bài viết mới",
      text: text.slice(0, 60000),
      url: url.href,
    };
  }
  throw new Error("Bài viết chuyển hướng quá nhiều lần.");
}
