/**
 * Shrinks a photo in the browser before upload: phone photos (3–8 MB) become ~150–300 KB,
 * so the menu loads fast on mobile data. Keeps the original if it's already small, not a
 * photo format we can redraw (e.g. SVG/GIF), or if the browser can't decode it.
 */
export async function shrinkImage(file: File, maxSide: number, opts: { keepAlpha?: boolean; quality?: number } = {}): Promise<File> {
  const quality = opts.quality ?? 0.82;
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // e.g. HEIC on a browser that can't read it: upload as-is
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 400 * 1024) {
    bmp.close();
    return file;
  }
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  if (!opts.keepAlpha) {
    ctx.fillStyle = "#ffffff"; // transparent PNG → white, since JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // JPEG (PNG when transparency matters): works everywhere, including WhatsApp link previews and receipts.
  const type = opts.keepAlpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
}

/** Sizes used across the app. */
export const IMAGE_SIZES = { dish: 1200, logo: 512, cover: 1800, receipt: 1600 } as const;
