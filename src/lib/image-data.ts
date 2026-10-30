import "server-only";

/**
 * Downloads an image for server-rendered images (link preview, app icon) and returns it as a data URL,
 * or null when it can't be used (missing, too big, or a format the renderer can't draw such as WebP/HEIC).
 */
export async function imageData(url: string, maxBytes = 4 * 1024 * 1024): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/png", "image/jpeg", "image/jpg", "image/gif"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
