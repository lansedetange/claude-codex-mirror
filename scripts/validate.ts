import { request } from "undici";
import { loadManifest } from "./lib/manifest.js";

async function main() {
  const m = await loadManifest();
  let errors = 0;
  let checked = 0;

  for (const [appId, app] of Object.entries(m.apps)) {
    if (app.releases.length === 0) {
      console.log(`[${appId}] (no releases yet)`);
      continue;
    }
    for (const rel of app.releases) {
      for (const f of rel.files) {
        checked++;
        const res = await request(f.url, { method: "HEAD", maxRedirections: 5 });
        await res.body.dump();
        const len = Number.parseInt(
          (res.headers["content-length"] as string) ?? "0",
          10,
        );
        const ok = res.statusCode < 400 && (len === f.size_bytes || len === 0);
        console.log(
          `[${ok ? "OK" : "FAIL"}] ${appId} ${rel.version} ${f.platform}/${f.arch} ${f.url} (status=${res.statusCode}, size=${len}/${f.size_bytes})`,
        );
        if (!ok) errors++;
      }
    }
  }

  console.log(`\nchecked ${checked} file(s), ${errors} error(s)`);
  process.exit(errors === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
