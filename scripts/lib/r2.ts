import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import mime from "mime-types";

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const publicBase =
  process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 configuration missing. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.",
    );
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function publicUrl(key: string): string {
  if (!publicBase) {
    throw new Error("R2_PUBLIC_BASE_URL is not set.");
  }
  return `${publicBase}/${key}`;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      ("$metadata" in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        : false)
    ) {
      return false;
    }
    throw err;
  }
}

export async function uploadFile(
  key: string,
  filePath: string,
): Promise<{ size: number; url: string }> {
  const size = (await stat(filePath)).size;
  const contentType =
    mime.lookup(filePath) || "application/octet-stream";
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      ContentLength: size,
    }),
  );
  return { size, url: publicUrl(key) };
}

export async function uploadJson(key: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );
}
