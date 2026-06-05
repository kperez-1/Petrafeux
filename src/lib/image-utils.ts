/**
 * Client-side image helpers. Photos are stored as resized JPEG data URLs
 * directly in the DB, so we downscale aggressively before persisting.
 */

const DEFAULT_MAX_DIM = 1024;
const DEFAULT_QUALITY = 0.7;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

/**
 * Resize an image file to fit within maxDim (longest edge) and return a
 * JPEG data URL. Falls back to the original data URL if canvas is unavailable.
 */
export async function fileToResizedDataUrl(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY
): Promise<string> {
  const original = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const longest = Math.max(img.width, img.height);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return original;
  }
}

/** Resize multiple files in sequence. Skips non-image files. */
export async function filesToResizedDataUrls(
  files: FileList | File[],
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY
): Promise<string[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
  const out: string[] = [];
  for (const file of list) {
    out.push(await fileToResizedDataUrl(file, maxDim, quality));
  }
  return out;
}
