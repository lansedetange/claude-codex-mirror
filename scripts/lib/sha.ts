import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function sha256String(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
