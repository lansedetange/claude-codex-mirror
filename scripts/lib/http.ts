import { request, stream } from "undici";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const UA =
  "claude-codex-mirror/0.1 (+https://github.com/your-org/claude-codex-mirror)";

export async function probe(url: string): Promise<{
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
}> {
  // Use GET with Range: bytes=0-0 because some CDNs (Anthropic's redirector)
  // return 405 / inconsistent headers on HEAD.
  const res = await request(url, {
    method: "GET",
    headers: { "user-agent": UA, range: "bytes=0-0" },
    maxRedirections: 5,
  });
  // Drain body to release the socket.
  await res.body.dump();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    if (typeof v === "string") headers[k.toLowerCase()] = v;
    else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
  }
  return {
    // undici exposes the resolved URL via the `context` after redirects;
    // fall back to the input URL if not present.
    finalUrl: (res as unknown as { context?: { history?: URL[] } }).context
      ?.history?.slice(-1)[0]?.toString() ?? url,
    status: res.statusCode,
    headers,
  };
}

export async function downloadTo(url: string, dest: string): Promise<number> {
  await mkdir(dirname(dest), { recursive: true });
  let bytes = 0;
  await stream(
    url,
    {
      method: "GET",
      headers: { "user-agent": UA },
      maxRedirections: 5,
      opaque: dest,
    },
    ({ opaque }) => {
      const out = createWriteStream(opaque as string);
      out.on("drain", () => {});
      return out;
    },
  );
  // Re-stat to get accurate size.
  const { stat } = await import("node:fs/promises");
  bytes = (await stat(dest)).size;
  return bytes;
}

export function parseFilename(
  contentDisposition: string | undefined,
  fallbackUrl: string,
): string {
  if (contentDisposition) {
    const m =
      contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ??
      contentDisposition.match(/filename="?([^";]+)"?/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  try {
    const u = new URL(fallbackUrl);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* noop */
  }
  return "download.bin";
}
