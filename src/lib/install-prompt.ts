/**
 * Platform detection and the install/notification hint the profile screen shows.
 *
 * Pure and DOM-free -- callers pass in what `navigator`/`matchMedia`/`Notification`
 * would otherwise say, so the decision itself is unit-testable without a browser. Two
 * platforms behave too differently to share one hint: Android/Chrome gets a real
 * install button from a captured `beforeinstallprompt`; iOS/Safari never fires that
 * event and has no permission prompt outside of a home-screen launch, so it gets
 * written instructions instead. Showing the wrong one to either platform is worse than
 * showing neither.
 */

export type InstallHint =
  | "none"
  | "ios-add-to-home-screen"
  | "android-install-button";

export interface InstallHintInput {
  isIOS: boolean;
  isStandalone: boolean;
  /** A `beforeinstallprompt` event was captured and can still be replayed. */
  canPromptInstall: boolean;
}

/** True for iOS/iPadOS Safari and any other iOS browser (they all share WebKit's PWA
 * limits) -- matched on the UA string, since there is no feature test for "is iOS". */
export function isIOSUserAgent(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

/** True once the app was launched from its home-screen icon. Two ways to ask, because
 * no single API works everywhere: iOS Safari exposes `navigator.standalone`, every
 * other engine reports `display-mode: standalone` on `matchMedia`. */
export function isStandaloneDisplay(input: {
  navigatorStandalone?: boolean;
  matchesStandaloneMediaQuery: boolean;
}): boolean {
  return input.navigatorStandalone === true || input.matchesStandaloneMediaQuery;
}

/**
 * Which install hint to show, or none.
 *
 * - Already standalone: nothing to install, so `"none"` -- the normal permission flow
 *   (iOS 16.4+) takes over from here.
 * - iOS, still in a browser tab: no prompt exists, so the only honest hint is the
 *   Share -> "הוספה למסך הבית" instructions.
 * - Everything else with a captured `beforeinstallprompt`: a real button that calls
 *   `prompt()`. Push already works in the Android/Chrome browser tab without
 *   installing, so the absence of this event is not itself worth a hint.
 */
export function getInstallHint(input: InstallHintInput): InstallHint {
  if (input.isStandalone) return "none";
  if (input.isIOS) return "ios-add-to-home-screen";
  if (input.canPromptInstall) return "android-install-button";
  return "none";
}

export type NotificationPermissionState =
  | "unsupported"
  | "not-asked"
  | "granted"
  | "denied";

/** The three honest states plus "unsupported" -- `Notification.permission` never
 * changes back to "default" once denied, and a denied permission cannot be re-asked
 * from script, which is why the profile screen has to say so instead of retrying. */
export function getNotificationPermissionState(input: {
  supported: boolean;
  permission: NotificationPermission | undefined;
}): NotificationPermissionState {
  if (!input.supported || !input.permission) return "unsupported";
  if (input.permission === "granted") return "granted";
  if (input.permission === "denied") return "denied";
  return "not-asked";
}
