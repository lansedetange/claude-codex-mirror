import type { Source } from "./index.js";

export const codexMacArm: Source = {
  id: "codex-mac-arm",
  app: "codex-desktop",
  platform: "macos",
  arch: "arm64",
  startUrl: "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg",
  notesUrl: "https://developers.openai.com/codex/app",
  r2Key: (version, filename) => `codex-desktop/macos-arm64/${version}/${filename}`,
};

export const codexMacX64: Source = {
  id: "codex-mac-x64",
  app: "codex-desktop",
  platform: "macos",
  arch: "x64",
  startUrl: "https://persistent.oaistatic.com/codex-app-prod/Codex-latest-x64.dmg",
  notesUrl: "https://developers.openai.com/codex/app",
  r2Key: (version, filename) => `codex-desktop/macos-x64/${version}/${filename}`,
};
