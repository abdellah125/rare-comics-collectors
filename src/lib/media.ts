import "server-only";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export type MediaPurpose = "product_image" | "seller_document" | "attachment" | "avatar" | "branding";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, "application/pdf": "pdf" };

/** Sniff the real type from magic bytes so a renamed executable cannot pose as an image. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

function imageSize(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === "image/gif") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export class UploadError extends Error {}

export async function saveUpload(
  file: File,
  opts: { purpose: MediaPurpose; ownerId: string | null; visibility?: "public" | "private" },
): Promise<{ id: string; url: string; mime: string; width: number | null; height: number | null }> {
  const settings = await getSettings();
  const maxBytes = settings["system.uploadMaxMb"] * 1024 * 1024;
  if (file.size === 0) throw new UploadError("The file is empty");
  if (file.size > maxBytes) throw new UploadError(`Files must be under ${settings["system.uploadMaxMb"]} MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  const allowed = opts.purpose === "seller_document" || opts.purpose === "attachment" ? DOC_TYPES : IMAGE_TYPES;
  if (!mime || !allowed[mime]) throw new UploadError("Unsupported file type. Use JPEG, PNG, WebP, GIF" + (allowed["application/pdf"] ? " or PDF." : "."));

  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const name = `${randomBytes(12).toString("hex")}.${allowed[mime]}`;
  const key = `${dir}/${name}`;
  const abs = path.join(path.resolve(env.uploadDir), key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  const dims = mime.startsWith("image/") ? imageSize(buf, mime) : null;

  const media = await db.mediaFile.create({
    data: {
      key,
      originalName: file.name.slice(0, 200),
      mime,
      size: buf.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      ownerId: opts.ownerId,
      purpose: opts.purpose,
      visibility: opts.visibility ?? (opts.purpose === "product_image" || opts.purpose === "branding" || opts.purpose === "avatar" ? "public" : "private"),
    },
  });
  return { id: media.id, url: mediaUrl(media.id), mime, width: media.width, height: media.height };
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}

export async function readMedia(key: string): Promise<Buffer | null> {
  const abs = path.join(path.resolve(env.uploadDir), key);
  // Guard against traversal even though keys are generated server-side.
  if (!abs.startsWith(path.resolve(env.uploadDir))) return null;
  try {
    await stat(abs);
    return await readFile(abs);
  } catch {
    return null;
  }
}

export async function deleteMedia(id: string): Promise<void> {
  const media = await db.mediaFile.findUnique({ where: { id } });
  if (!media) return;
  const abs = path.join(path.resolve(env.uploadDir), media.key);
  await unlink(abs).catch(() => {});
  await db.mediaFile.delete({ where: { id } }).catch(() => {});
}
