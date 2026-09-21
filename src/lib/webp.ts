"use client";

/**
 * Turns whatever the admin picked into a WebP before it is uploaded.
 *
 * A character added through the admin screen is stored base64 in a column that every
 * picker reads, so its weight is paid on every device that ever renders it. The ten
 * committed characters are 11-16 KB `.webp`; the first hand-uploaded one was a 66 KB
 * PNG of the same 500x500 picture, five times the weight for no visible difference.
 * Asking the admin to run an image through a converter first is a step nobody will
 * remember at 1am, so the browser does it on the way out.
 *
 * Canvas rather than a library: the encoder is already in the browser, it costs no
 * dependency and no server CPU, and this runs once per character rather than per view.
 *
 * Transparency survives -- the canvas is left unfilled and WebP carries an alpha
 * channel, which is what keeps a character sitting on the felt rather than in a white
 * tile. That is also why the fallback below returns the ORIGINAL file rather than a
 * JPEG: a flattened character would be worse than a heavy one.
 */

/**
 * The longest edge a stored character may have.
 *
 * 256, measured rather than guessed. `ChipAvatar` draws at `size-16` (64px) and the
 * largest override anywhere is `size-20` (80px), so 256 still covers the biggest use on
 * a 3x screen. It is also what makes the weight match: the first hand-uploaded
 * character was a 500px palette PNG at 66 KB, and the same picture at 256px is 13.7 KB
 * -- the band the ten committed characters already sit in (11-16 KB). Storing 500px was
 * paying four times over for pixels no screen ever asks for.
 */
export const MAX_AVATAR_EDGE = 256;

/**
 * High enough that the flat colour and soft shading here show no artefacts, checked
 * against the one real character at this size before it was set.
 */
export const WEBP_QUALITY = 0.88;

/** `Subject 4.png` -> `Subject 4.webp`. Pure, so the naming is testable without a DOM. */
export function webpFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  return `${base || "avatar"}.webp`;
}

/**
 * The size to draw at: untouched when it already fits, scaled down proportionally when
 * it does not. Pure for the same reason as above.
 */
export function fitWithin(
  width: number,
  height: number,
  edge: number = MAX_AVATAR_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= edge) return { width, height };
  const scale = edge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Whether this browser can actually encode WebP, rather than quietly handing back a PNG. */
function canEncodeWebp(): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    return probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    image.src = url;
  });
}

/**
 * The uploaded file as WebP, or the original file unchanged if anything at all goes
 * wrong.
 *
 * Every failure path returns the input rather than throwing: the upload still has a
 * working route for PNG and JPEG, so a browser that cannot encode WebP, an image that
 * will not decode, or a canvas that refuses should all cost a few kilobytes, never the
 * ability to add a character.
 */
export async function toWebpFile(file: File): Promise<File> {
  if (file.type === "image/webp") return file;
  if (typeof document === "undefined" || !canEncodeWebp()) return file;

  try {
    const image = await loadImage(file);
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    if (!width || !height) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // Deliberately not filled first: an unpainted canvas is transparent, and that is
    // the whole point.
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    // A browser that ignores the type argument hands back a PNG; keeping the original
    // is better than storing a re-encoded one under the wrong name.
    if (!blob || blob.type !== "image/webp") return file;
    // Converting is only worth it if it actually got smaller.
    if (blob.size >= file.size) return file;

    return new File([blob], webpFileName(file.name), { type: "image/webp" });
  } catch {
    return file;
  }
}
