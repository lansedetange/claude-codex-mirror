import type { AppId, Arch, Platform, ProbeResult } from "../types.js";

export interface Source {
  id: string;
  app: AppId;
  platform: Platform;
  arch: Arch;
  /** URL to GET (with redirects) for the latest installer. */
  startUrl: string;
  /** Where the release-notes scraper should look. */
  notesUrl: string;
  /** Build a file path inside the R2 bucket. */
  r2Key(version: string, filename: string): string;
}

import { claudeMac, claudeWin } from "./claude.js";
import { codexMacArm, codexMacX64 } from "./codex.js";

export const SOURCES: Source[] = [claudeMac, claudeWin, codexMacArm, codexMacX64];
