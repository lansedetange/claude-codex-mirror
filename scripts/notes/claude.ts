import { request } from "undici";
import * as cheerio from "cheerio";

export interface ParsedNote {
  version: string | null;
  released_at: string | null;
  body_md: string;
}

/**
 * Scrape the Claude Apps release-notes help-center article and group
 * paragraphs by their nearest version-bearing heading. The page layout is
 * "date heading → bullet list of changes"; we extract a version when one
 * is present in the bullets, otherwise leave version null and let the
 * caller match by the version we extracted from the installer file.
 */
export async function fetchClaudeNotes(
  notesUrl: string,
): Promise<ParsedNote[]> {
  const res = await request(notesUrl);
  if (res.statusCode >= 400) {
    throw new Error(`Failed to fetch Claude notes: ${res.statusCode}`);
  }
  const html = await res.body.text();
  const $ = cheerio.load(html);

  const article = $("article").first().length
    ? $("article").first()
    : $("main").first();

  const sections: ParsedNote[] = [];
  let current: ParsedNote | null = null;

  article.find("h1, h2, h3, h4, p, ul, ol").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();
    if (!tag) return;
    const text = $(el).text().trim();
    if (!text) return;

    if (/^h[1-4]$/.test(tag)) {
      if (current && current.body_md.trim()) sections.push(current);
      current = {
        version: null,
        released_at: parseDate(text),
        body_md: `## ${text}\n\n`,
      };
      return;
    }

    if (!current) {
      current = { version: null, released_at: null, body_md: "" };
    }

    if (tag === "ul" || tag === "ol") {
      $(el)
        .find("> li")
        .each((__, li) => {
          const liText = $(li).text().trim().replace(/\s+/g, " ");
          if (liText) current!.body_md += `- ${liText}\n`;
          const v = liText.match(/v?(\d+\.\d+\.\d+(?:\.\d+)?)/);
          if (v && !current!.version) current!.version = v[1];
        });
      current.body_md += "\n";
    } else {
      current.body_md += `${text.replace(/\s+/g, " ")}\n\n`;
      const v = text.match(/v?(\d+\.\d+\.\d+(?:\.\d+)?)/);
      if (v && !current.version) current.version = v[1];
    }
  });

  if (current && (current as ParsedNote).body_md.trim()) {
    sections.push(current);
  }
  return sections;
}

function parseDate(text: string): string | null {
  // Recognises "Apr 25, 2026" / "April 25, 2026" / "2026-04-25".
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const long = text.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i,
  );
  if (long) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[long[1].slice(0, 3).toLowerCase()];
    const d = long[2].padStart(2, "0");
    return `${long[3]}-${m}-${d}`;
  }
  return null;
}

export function findNotesForVersion(
  parsed: ParsedNote[],
  version: string,
): { body: string; released_at: string | null } | null {
  // First pass: match by exact version.
  const exact = parsed.find((p) => p.version === version);
  if (exact) return { body: exact.body_md.trim(), released_at: exact.released_at };
  // Second pass: prefix match (e.g. parsed entry says 0.13 and we have 0.13.42).
  const prefix = parsed.find(
    (p) => p.version && (version.startsWith(p.version) || p.version.startsWith(version)),
  );
  if (prefix) return { body: prefix.body_md.trim(), released_at: prefix.released_at };
  // Third pass: most recent dated entry — better than nothing.
  const dated = parsed.filter((p) => p.released_at).sort((a, b) =>
    (b.released_at ?? "").localeCompare(a.released_at ?? ""),
  );
  if (dated[0]) return { body: dated[0].body_md.trim(), released_at: dated[0].released_at };
  return null;
}
