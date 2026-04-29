import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import { downloadTo, parseFilename, probe } from "./lib/http.js";
import {
  findRelease,
  hasSha,
  loadManifest,
  saveManifest,
  upsertRelease,
} from "./lib/manifest.js";
import { uploadFile, uploadJson, publicUrl, objectExists } from "./lib/r2.js";
import { sha256File } from "./lib/sha.js";
import { translate } from "./lib/translate.js";
import { extractVersion } from "./lib/version.js";
import { fetchClaudeNotes, findNotesForVersion } from "./notes/claude.js";
import { fetchCodexNotes } from "./notes/codex.js";
import { SOURCES, type Source } from "./sources/index.js";
import type { FileEntry, Manifest, ReleaseEntry } from "./types.js";

interface Args {
  dryRun: boolean;
  force: boolean;
  only?: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      only: { type: "string" },
    },
    allowPositionals: false,
  });
  return {
    dryRun: values["dry-run"] === true,
    force: values.force === true,
    only: values.only as string | undefined,
  };
}

async function processSource(
  src: Source,
  manifest: Manifest,
  args: Args,
): Promise<{ updated: boolean; reason: string }> {
  console.log(`\n[${src.id}] probing ${src.startUrl}`);
  const head = await probe(src.startUrl);
  const filenameHint = parseFilename(
    head.headers["content-disposition"],
    head.finalUrl,
  );
  const etag = head.headers.etag ?? null;
  const size = Number.parseInt(
    head.headers["content-range"]?.split("/")?.[1] ??
      head.headers["content-length"] ??
      "0",
    10,
  );
  console.log(
    `[${src.id}] resolved → ${head.finalUrl} (filename=${filenameHint}, size=${size}, etag=${etag})`,
  );

  // Quick skip: if a release already has a file from this exact URL/etag, skip.
  // We can't trust ETag alone (CDNs vary), but combining filename hint + size
  // is a strong "probably the same" signal.
  if (!args.force) {
    const known = manifest.apps[src.app].releases.find((r) =>
      r.files.some(
        (f) =>
          f.platform === src.platform &&
          f.arch === src.arch &&
          f.size_bytes === size &&
          size > 0,
      ),
    );
    if (known) {
      return { updated: false, reason: `已存在版本 ${known.version}（按文件大小匹配）` };
    }
  }

  if (args.dryRun) {
    return { updated: false, reason: "dry-run：跳过下载" };
  }

  const tmp = await mkdtemp(join(tmpdir(), `mirror-${src.id}-`));
  try {
    const tmpFile = join(tmp, filenameHint);
    console.log(`[${src.id}] downloading...`);
    const bytes = await downloadTo(src.startUrl, tmpFile);
    const sha = await sha256File(tmpFile);
    console.log(`[${src.id}] downloaded ${bytes} bytes, sha256=${sha.slice(0, 12)}…`);

    if (!args.force && hasSha(manifest, sha)) {
      return { updated: false, reason: "sha256 已存在 manifest 中" };
    }

    const version =
      (await extractVersion(tmpFile, filenameHint)) ??
      `unknown-${new Date().toISOString().slice(0, 10)}`;
    console.log(`[${src.id}] resolved version ${version}`);

    const finalFilename = renameWithVersion(filenameHint, version, src);
    const key = src.r2Key(version, finalFilename);

    if (await objectExists(key)) {
      console.log(`[${src.id}] R2 already has ${key}, will reuse`);
    } else {
      console.log(`[${src.id}] uploading to R2 → ${key}`);
      await uploadFile(key, tmpFile);
    }

    const fileEntry: FileEntry = {
      platform: src.platform,
      arch: src.arch,
      filename: finalFilename,
      size_bytes: bytes,
      sha256: sha,
      url: publicUrl(key),
      source_url: src.startUrl,
    };

    // Pull / refresh release notes for this version.
    const notes = await loadNotesFor(src, version);
    const notes_zh = notes ? await translate(manifest, notes.body) : null;

    const existing = findRelease(manifest, src.app, version);
    const release: ReleaseEntry = {
      version,
      released_at: notes?.released_at ?? existing?.released_at ?? null,
      fetched_at: new Date().toISOString(),
      files: [fileEntry],
      notes_en: notes?.body ?? existing?.notes_en ?? null,
      notes_zh: notes_zh ?? existing?.notes_zh ?? null,
    };
    upsertRelease(manifest, src.app, release);

    return { updated: true, reason: `已归档 ${version}` };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function renameWithVersion(
  filenameHint: string,
  version: string,
  src: Source,
): string {
  // Codex's URL is "Codex.dmg" / "Codex-latest-x64.dmg" — we want a stable,
  // version-tagged name once we've identified the version.
  const ext = filenameHint.includes(".")
    ? filenameHint.slice(filenameHint.lastIndexOf("."))
    : "";
  if (filenameHint.includes(version)) return filenameHint;
  const archTag = src.arch === "universal" ? "" : `-${src.arch}`;
  const baseName =
    src.app === "codex-desktop"
      ? "Codex"
      : src.app === "claude-desktop"
      ? "Claude"
      : basename(filenameHint, ext);
  return `${baseName}-${version}${archTag}${ext}`;
}

async function loadNotesFor(
  src: Source,
  version: string,
): Promise<{ body: string; released_at: string | null } | null> {
  try {
    if (src.app === "claude-desktop") {
      const parsed = await fetchClaudeNotes(src.notesUrl);
      return findNotesForVersion(parsed, version);
    }
    if (src.app === "codex-desktop") {
      const r = await fetchCodexNotes(src.notesUrl);
      return r ? { body: r.body, released_at: null } : null;
    }
  } catch (err) {
    console.warn(`[notes:${src.id}] scrape failed: ${(err as Error).message}`);
  }
  return null;
}

async function main() {
  const args = parseCliArgs();
  console.log(`▶ daily-update (dry-run=${args.dryRun}, force=${args.force})`);
  const manifest = await loadManifest();

  const sources = args.only
    ? SOURCES.filter((s) => s.id === args.only)
    : SOURCES;
  if (args.only && sources.length === 0) {
    throw new Error(`No source matches --only=${args.only}`);
  }

  let updates = 0;
  for (const src of sources) {
    try {
      const result = await processSource(src, manifest, args);
      console.log(`[${src.id}] ${result.updated ? "✔ 更新" : "= 跳过"}: ${result.reason}`);
      if (result.updated) updates++;
    } catch (err) {
      console.error(`[${src.id}] ✘ 失败: ${(err as Error).stack ?? err}`);
    }
  }

  if (args.dryRun) {
    console.log("\n▶ dry-run，未写入 manifest");
    return;
  }

  if (updates === 0) {
    console.log("\n▶ 无需更新");
    return;
  }

  await saveManifest(manifest);
  try {
    await uploadJson("manifest.json", manifest);
    console.log("▶ manifest.json 已上传到 R2");
  } catch (err) {
    console.warn(`▶ manifest 上传 R2 失败：${(err as Error).message}`);
  }

  const hook = process.env.CF_PAGES_DEPLOY_HOOK;
  if (hook) {
    const res = await fetch(hook, { method: "POST" });
    console.log(`▶ Pages deploy hook → ${res.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
