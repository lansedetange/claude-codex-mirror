import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppId, Manifest, ReleaseEntry } from "../types.js";

const MANIFEST_PATH = join(process.cwd(), "manifest.json");

export async function loadManifest(): Promise<Manifest> {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const m = JSON.parse(raw) as Manifest;
  m.translations ??= {};
  return m;
}

export async function saveManifest(m: Manifest): Promise<void> {
  m.updated_at = new Date().toISOString();
  // Sort releases newest-first so diffs read naturally.
  for (const app of Object.values(m.apps)) {
    app.releases.sort((a, b) => compareVersions(b.version, a.version));
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n");
}

export function findRelease(
  m: Manifest,
  app: AppId,
  version: string,
): ReleaseEntry | undefined {
  return m.apps[app]?.releases.find((r) => r.version === version);
}

export function hasSha(m: Manifest, sha: string): boolean {
  return Object.values(m.apps).some((app) =>
    app.releases.some((r) => r.files.some((f) => f.sha256 === sha)),
  );
}

export function upsertRelease(
  m: Manifest,
  app: AppId,
  release: ReleaseEntry,
): void {
  const list = m.apps[app].releases;
  const idx = list.findIndex((r) => r.version === release.version);
  if (idx === -1) {
    list.push(release);
  } else {
    // Merge: preserve existing files, add/replace by (platform, arch).
    const existing = list[idx];
    const map = new Map(existing.files.map((f) => [`${f.platform}-${f.arch}`, f]));
    for (const f of release.files) map.set(`${f.platform}-${f.arch}`, f);
    existing.files = [...map.values()];
    existing.notes_en = release.notes_en ?? existing.notes_en;
    existing.notes_zh = release.notes_zh ?? existing.notes_zh;
    existing.released_at = release.released_at ?? existing.released_at;
  }
}

// Lightweight semver-ish comparison; tolerates non-semver tags by falling
// back to lexicographic order on the trailing remainder.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10));
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = Number.isNaN(pa[i]) ? -1 : pa[i] ?? -1;
    const bv = Number.isNaN(pb[i]) ? -1 : pb[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}
