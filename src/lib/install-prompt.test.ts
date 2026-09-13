import { describe, expect, it } from "vitest";
import {
  getInstallHint,
  getNotificationPermissionState,
  isIOSUserAgent,
  isStandaloneDisplay,
} from "@/lib/install-prompt";

describe("isIOSUserAgent", () => {
  it("recognises iPhone and iPad", () => {
    expect(
      isIOSUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
    expect(
      isIOSUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe(true);
  });

  it("does not match Android or desktop", () => {
    expect(isIOSUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/120")).toBe(false);
    expect(isIOSUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  it("is true from iOS's navigator.standalone", () => {
    expect(
      isStandaloneDisplay({ navigatorStandalone: true, matchesStandaloneMediaQuery: false }),
    ).toBe(true);
  });

  it("is true from display-mode: standalone", () => {
    expect(
      isStandaloneDisplay({ navigatorStandalone: undefined, matchesStandaloneMediaQuery: true }),
    ).toBe(true);
  });

  it("is false in an ordinary browser tab", () => {
    expect(
      isStandaloneDisplay({ navigatorStandalone: false, matchesStandaloneMediaQuery: false }),
    ).toBe(false);
    expect(
      isStandaloneDisplay({ navigatorStandalone: undefined, matchesStandaloneMediaQuery: false }),
    ).toBe(false);
  });
});

describe("getInstallHint", () => {
  it("shows nothing once already standalone, on either platform", () => {
    expect(
      getInstallHint({ isIOS: true, isStandalone: true, canPromptInstall: false }),
    ).toBe("none");
    expect(
      getInstallHint({ isIOS: false, isStandalone: true, canPromptInstall: true }),
    ).toBe("none");
  });

  it("shows the Share instructions on iOS in a browser tab", () => {
    expect(
      getInstallHint({ isIOS: true, isStandalone: false, canPromptInstall: false }),
    ).toBe("ios-add-to-home-screen");
  });

  it("shows the install button on Android once beforeinstallprompt was captured", () => {
    expect(
      getInstallHint({ isIOS: false, isStandalone: false, canPromptInstall: true }),
    ).toBe("android-install-button");
  });

  it("shows nothing on Android before beforeinstallprompt fires", () => {
    expect(
      getInstallHint({ isIOS: false, isStandalone: false, canPromptInstall: false }),
    ).toBe("none");
  });
});

describe("getNotificationPermissionState", () => {
  it("is unsupported when the browser has no Notification API", () => {
    expect(
      getNotificationPermissionState({ supported: false, permission: undefined }),
    ).toBe("unsupported");
  });

  it("reflects granted and denied honestly", () => {
    expect(
      getNotificationPermissionState({ supported: true, permission: "granted" }),
    ).toBe("granted");
    expect(
      getNotificationPermissionState({ supported: true, permission: "denied" }),
    ).toBe("denied");
  });

  it("is not-asked before the first request", () => {
    expect(
      getNotificationPermissionState({ supported: true, permission: "default" }),
    ).toBe("not-asked");
  });
});
