/**
 * The browser-side half of web push: turns the VAPID public key into the byte array
 * `PushManager.subscribe` wants. Pure string/byte math, no browser APIs, so it is
 * unit-testable directly -- `window.atob` differs subtly across engines and is not
 * worth trusting for this.
 */
const BASE64URL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const chars = base64Url.replace(/[^A-Za-z0-9\-_]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const char of chars) {
    const value = BASE64URL_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
