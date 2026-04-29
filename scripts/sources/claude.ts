import type { Source } from "./index.js";

export const claudeMac: Source = {
  id: "claude-mac",
  app: "claude-desktop",
  platform: "macos",
  arch: "universal",
  // Anthropic's downloader endpoint redirects to the signed CDN URL.
  startUrl: "https://claude.ai/download/claude/mac",
  notesUrl: "https://support.claude.com/en/articles/12138966-release-notes",
  r2Key: (version, filename) => `claude-desktop/macos/${version}/${filename}`,
};

export const claudeWin: Source = {
  id: "claude-win",
  app: "claude-desktop",
  platform: "windows",
  arch: "x64",
  startUrl: "https://claude.ai/download/claude/windows",
  notesUrl: "https://support.claude.com/en/articles/12138966-release-notes",
  r2Key: (version, filename) => `claude-desktop/windows/${version}/${filename}`,
};
