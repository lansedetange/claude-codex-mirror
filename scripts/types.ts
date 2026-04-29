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
  $schema?: string;
  updated_at: string | null;
  apps: Record<string, AppEntry>;
  translations: Record<string, { sha: string; zh: string }>;
}

export type AppId = "claude-desktop" | "codex-desktop";

export interface ProbeResult {
  app: AppId;
  platform: Platform;
  arch: Arch;
  finalUrl: string;
  filenameHint: string | null;
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
}

export interface DownloadResult extends ProbeResult {
  tmpPath: string;
  sha256: string;
  size: number;
  version: string;
  filename: string;
}
