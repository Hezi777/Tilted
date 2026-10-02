import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { setCookie, requestHeaders } = vi.hoisted(() => ({
  setCookie: vi.fn(),
  requestHeaders: new Headers({ origin: "https://tilted-poker.vercel.app" }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock("@/db/identity-queries", () => ({ ensurePersonForUser: vi.fn() }));

import { signInWithGoogleAction, signUpAction } from "@/lib/auth/actions";

const fetchMock = vi.fn();
const providerURL = "https://accounts.google.com/o/oauth2/v2/auth?state=test";

beforeEach(() => {
  vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com/auth");
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-cookie-secret-at-least-32-characters");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tilted-poker.vercel.app");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  setCookie.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google sign-in through the Neon SDK", () => {
  it.each(["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"])("keeps an existing email on its account for %s", async (code) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      code,
      message: "User already exists. Use another email.",
    }), { status: 422 }));
    const form = new FormData();
    form.set("name", "Existing player");
    form.set("email", "player@example.com");
    form.set("password", "test-password");

    await expect(signUpAction({ error: null }, form)).resolves.toEqual({
      error: "כבר קיים חשבון עם האימייל הזה. התחברו עם Google או עם הסיסמה, או הגדירו סיסמה באמצעות קוד באימייל.",
    });
  });

  it("forwards the origin and saves the challenge cookie before redirecting", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: providerURL }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "__Secure-neon-auth.session_challenge=test-challenge; Path=/; HttpOnly; Secure; SameSite=None",
      },
    }));
    const form = new FormData();
    form.set("next", "/join/CPPT?from=invite");

    await expect(signInWithGoogleAction(form)).rejects.toThrow(`redirect:${providerURL}`);

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://auth.example.com/auth/sign-in/social");
    expect(request.headers.Origin).toBe("https://tilted-poker.vercel.app");
    expect(request.headers["x-neon-auth-proxy"]).toBe("nextjs");
    const body = JSON.parse(request.body);
    expect(body.provider).toBe("google");
    expect(body.callbackURL).toBe("https://tilted-poker.vercel.app/join/CPPT?from=invite");
    expect(body.newUserCallbackURL).toBe(body.callbackURL);
    expect(new URL(body.errorCallbackURL).searchParams.get("next")).toBe("/join/CPPT?from=invite");
    expect(setCookie).toHaveBeenCalledWith(
      "__Secure-neon-auth.session_challenge",
      "test-challenge",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" }),
    );
  });

  it("returns failures to the sign-in screen with the invitation preserved", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Provider unavailable" }), { status: 400 }));
    const form = new FormData();
    form.set("next", "/join/CPPT");

    await expect(signInWithGoogleAction(form)).rejects.toThrow(
      "redirect:https://tilted-poker.vercel.app/auth/sign-in?next=%2Fjoin%2FCPPT&google=failed",
    );
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("keeps an external destination out of the OAuth callback", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: providerURL })));
    const form = new FormData();
    form.set("next", "https://example.com");

    await expect(signInWithGoogleAction(form)).rejects.toThrow(`redirect:${providerURL}`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).callbackURL).toBe("https://tilted-poker.vercel.app/");
  });
});
