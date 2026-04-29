import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Platform = "macos" | "windows";
export type Arch = "arm64" | "x64" | "universal";

export interface FileEntry {
  platform: Platform;
  arch: Arch;
  filename: string;
  size_bytes: number;
  sha256: string;
  url: string;
  source_url: string;
}

export interface ReleaseEntry {
  version: string;
  released_at: string | null;
  fetched_at: string;
  files: FileEntry[];
  notes_en: string | null;
  notes_zh: string | null;
}

export interface AppEntry {
  name: string;
  homepage: string;
  official_download: string;
  windows_redirect?: string;
  releases: ReleaseEntry[];
}

export interface Manifest {
  updated_at: string | null;
  apps: Record<string, AppEntry>;
}

let cached: Manifest | null = null;

export function getManifest(): Manifest {
  if (cached) return cached;
  const path = join(process.cwd(), "..", "manifest.json");
  cached = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  return cached;
}

export function appIds(): string[] {
  return Object.keys(getManifest().apps);
}

export function getApp(id: string): AppEntry | undefined {
  return getManifest().apps[id];
}

export function getRelease(
  appId: string,
  version: string,
): ReleaseEntry | undefined {
  return getApp(appId)?.releases.find((r) => r.version === version);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function platformLabel(p: Platform, a: Arch): string {
  if (p === "macos") {
    if (a === "arm64") return "macOS · Apple Silicon";
    if (a === "x64") return "macOS · Intel";
    return "macOS · 通用";
  }
  if (p === "windows") return "Windows";
  return `${p}/${a}`;
}
