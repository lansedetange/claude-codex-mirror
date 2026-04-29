import { request } from "undici";
import * as cheerio from "cheerio";

/**
 * OpenAI doesn't publish a structured Codex desktop changelog. We fall back
 * to scraping the "What's new" sections from the product page; if the page
 * structure changes or has nothing, we return null and the manifest records
 * "官方未发布该版本的更新说明".
 */
export async function fetchCodexNotes(
  notesUrl: string,
): Promise<{ body: string } | null> {
  const res = await request(notesUrl);
  if (res.statusCode >= 400) return null;
  const html = await res.body.text();
  const $ = cheerio.load(html);

  // Heuristic: collect headings that mention "What's new" / "new" / "update"
  // and the paragraph + list content immediately following.
  const matches: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const heading = $(el).text().trim();
    if (!/what'?s new|new in|update|changelog|release/i.test(heading)) return;
    const buf: string[] = [`## ${heading}`, ""];
    let node = $(el).next();
    while (node.length && !/^h[1-3]$/i.test(node[0].tagName ?? "")) {
      const tag = node[0].tagName?.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        node.find("> li").each((__, li) => {
          buf.push(`- ${$(li).text().trim().replace(/\s+/g, " ")}`);
        });
        buf.push("");
      } else if (tag === "p") {
        buf.push($(node).text().trim().replace(/\s+/g, " "), "");
      }
      node = node.next();
    }
    matches.push(buf.join("\n").trim());
  });

  if (matches.length === 0) return null;
  return { body: matches.join("\n\n") };
}
