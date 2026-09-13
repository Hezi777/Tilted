import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push-client";

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key into bytes", () => {
    // "hello" base64url-encoded, with the '+'/'/' -> '-'/'_' swap already applied.
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles the - and _ substitutions", () => {
    // Byte sequence chosen so the standard base64 would contain '+' and '/'.
    const standard = Buffer.from([0xfb, 0xff, 0xbf]).toString("base64"); // "+/+/"-ish
    const base64Url = standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const bytes = urlBase64ToUint8Array(base64Url);
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("ignores padding", () => {
    expect(Array.from(urlBase64ToUint8Array("aGk="))).toEqual([104, 105]);
    expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]);
  });
});
