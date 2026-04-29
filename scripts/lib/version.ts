import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Try a series of strategies to read the application version embedded in a
 * downloaded installer file. Returns null if every strategy fails — callers
 * should fall back to a date-derived pseudo-version.
 */
export async function extractVersion(
  filePath: string,
  filename: string,
): Promise<string | null> {
  // 1. Filename pattern: e.g. Claude-0.13.42.dmg, Codex-26.422.8496.0.exe.
  const fnMatch = filename.match(/(\d+(?:\.\d+){1,3})/);
  if (fnMatch) return fnMatch[1];

  // 2. macOS-only: extract Info.plist from .dmg via 7z, parse CFBundleShortVersionString.
  if (filePath.endsWith(".dmg") && process.platform !== "win32") {
    try {
      const v = await readDmgVersion(filePath);
      if (v) return v;
    } catch {
      /* try next strategy */
    }
  }

  return null;
}

async function readDmgVersion(dmgPath: string): Promise<string | null> {
  const tmp = await mkdtemp(join(tmpdir(), "dmg-"));
  try {
    // Use 7z (preinstalled on GitHub Actions ubuntu runners and on macOS via brew).
    // List contents, find Info.plist, extract just that file.
    const list = await run("7z", ["l", "-slt", dmgPath]);
    const plistMatch = list.match(/Path = (.*Contents\/Info\.plist)\b/);
    if (!plistMatch) return null;
    const plistRel = plistMatch[1];
    await run("7z", ["e", "-y", `-o${tmp}`, dmgPath, plistRel]);
    const xml = await readFile(join(tmp, "Info.plist"), "utf8");
    const m = xml.match(
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
    );
    return m?.[1] ?? null;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
