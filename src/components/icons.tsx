"use client";

/**
 * The app's icon set: Hugeicons, behind Lucide-shaped names.
 *
 * Hugeicons ships as data plus one renderer -- `<HugeiconsIcon icon={X} />` --
 * rather than as a component per icon. Calling that directly would mean touching
 * every icon in every screen and reading worse at each of them, so each icon is
 * bound to a name here instead. Call sites keep writing `<XIcon className="..." />`
 * and only their import path changed.
 *
 * Two things this file is deliberately buying:
 *
 * 1. **One place to remap.** Hugeicons and Lucide disagree on roughly a quarter of
 *    these names -- Lucide's numbered variants (`Clock3`, `Share2`, `Undo2`) have
 *    no counterpart -- and that disagreement lives here rather than in 25 files.
 * 2. **Tree shaking.** `@hugeicons/core-free-icons` is ~6,700 icons and 72MB
 *    unpacked. Naming each import explicitly is what keeps all but these out of
 *    the bundle; never `import * as icons`.
 *
 * `Settings02Icon` is not an arbitrary pick among the gears: it is the one that
 * matched the reference art when every settings glyph on Iconify was ranked
 * against it.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArmchairIcon as HgArmchair,
  ArrowLeft02Icon as HgArrowLeft,
  BellIcon as HgBell,
  BookMarkedIcon as HgBookMarked,
  CheckIcon as HgCheck,
  ChevronLeftIcon as HgChevronLeft,
  ChevronRightIcon as HgChevronRight,
  CircleCheckIcon as HgCircleCheck,
  ClockIcon as HgClock,
  ClubIcon as HgClub,
  CopyIcon as HgCopy,
  CrownIcon as HgCrown,
  Delete02Icon as HgDelete02,
  ExternalLinkIcon as HgExternalLink,
  FlameIcon as HgFlame,
  HistoryIcon as HgHistory,
  HomeIcon as HgHome,
  InfoIcon as HgInfo,
  LoaderIcon as HgLoader,
  LogOutIcon as HgLogOut,
  MinusIcon as HgMinus,
  MoreVerticalIcon as HgMoreVertical,
  MusicIcon as HgMusic,
  OctagonXIcon as HgOctagonX,
  PencilIcon as HgPencil,
  PlusIcon as HgPlus,
  RefreshCwIcon as HgRefreshCw,
  Settings02Icon as HgSettings,
  ShareIcon as HgShare,
  SlidersHorizontalIcon as HgSlidersHorizontal,
  SpadesIcon as HgSpades,
  TrashIcon as HgTrash,
  TrendingDownIcon as HgTrendingDown,
  TrendingUpIcon as HgTrendingUp,
  TriangleAlertIcon as HgTriangleAlert,
  UndoIcon as HgUndo,
  UserRoundIcon as HgUserRound,
  UsersIcon as HgUsers,
  UnlinkIcon as HgUnlink,
  XIcon as HgX,
} from "@hugeicons/core-free-icons";

/** What a bound icon accepts -- the same surface the old set exposed. */
export type AppIcon = React.ComponentType<
  Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">
>;

/**
 * Hugeicons draws at 1.5 by default and the set this replaced drew at 2, so taking
 * the default would have quietly thinned every icon in the app -- most visibly in
 * the tab bar, where they are 20px on a dark ground. Spread after, so a call site
 * that asks for its own weight still wins.
 */
const STROKE = 2;

function bind(icon: IconSvgElement, displayName: string): AppIcon {
  function Bound(props: Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">) {
    return <HugeiconsIcon icon={icon} strokeWidth={STROKE} {...props} />;
  }
  Bound.displayName = displayName;
  return Bound;
}

export const ArmchairIcon = bind(HgArmchair, "ArmchairIcon");
/* `ArrowLeft02`, not `ArrowLeft`: Hugeicons' unnumbered one is a chevron, and this
   is drawn at the end of a rule in the settlement transfers ("from ——> to"), where
   a chevron reads as a caret rather than as direction. */
export const ArrowLeftIcon = bind(HgArrowLeft, "ArrowLeftIcon");
export const BellIcon = bind(HgBell, "BellIcon");
export const BookMarkedIcon = bind(HgBookMarked, "BookMarkedIcon");
export const CheckIcon = bind(HgCheck, "CheckIcon");
export const ChevronLeftIcon = bind(HgChevronLeft, "ChevronLeftIcon");
export const ChevronRightIcon = bind(HgChevronRight, "ChevronRightIcon");
export const CircleCheckIcon = bind(HgCircleCheck, "CircleCheckIcon");
export const ClubIcon = bind(HgClub, "ClubIcon");
export const CopyIcon = bind(HgCopy, "CopyIcon");
export const CrownIcon = bind(HgCrown, "CrownIcon");
export const ExternalLinkIcon = bind(HgExternalLink, "ExternalLinkIcon");
export const FlameIcon = bind(HgFlame, "FlameIcon");
export const HistoryIcon = bind(HgHistory, "HistoryIcon");
export const HomeIcon = bind(HgHome, "HomeIcon");
export const InfoIcon = bind(HgInfo, "InfoIcon");
export const LogOutIcon = bind(HgLogOut, "LogOutIcon");
export const MinusIcon = bind(HgMinus, "MinusIcon");
export const MoreVerticalIcon = bind(HgMoreVertical, "MoreVerticalIcon");
export const OctagonXIcon = bind(HgOctagonX, "OctagonXIcon");
export const PencilIcon = bind(HgPencil, "PencilIcon");
export const PlusIcon = bind(HgPlus, "PlusIcon");
export const RefreshCwIcon = bind(HgRefreshCw, "RefreshCwIcon");
export const SlidersHorizontalIcon = bind(HgSlidersHorizontal, "SlidersHorizontalIcon");
export const TrashIcon = bind(HgTrash, "TrashIcon");
export const TrendingDownIcon = bind(HgTrendingDown, "TrendingDownIcon");
export const TrendingUpIcon = bind(HgTrendingUp, "TrendingUpIcon");
export const TriangleAlertIcon = bind(HgTriangleAlert, "TriangleAlertIcon");
export const UserRoundIcon = bind(HgUserRound, "UserRoundIcon");
export const UsersIcon = bind(HgUsers, "UsersIcon");
export const XIcon = bind(HgX, "XIcon");

/* Lucide's numbered variants, which Hugeicons does not use. The name on the left
   is kept so no screen has to change; the glyph on the right is the nearest one. */
export const Clock3Icon = bind(HgClock, "Clock3Icon");
export const Link2OffIcon = bind(HgUnlink, "Link2OffIcon");
export const Loader2Icon = bind(HgLoader, "Loader2Icon");
export const Music2Icon = bind(HgMusic, "Music2Icon");
export const Settings2Icon = bind(HgSettings, "Settings2Icon");
export const Share2Icon = bind(HgShare, "Share2Icon");
export const SpadeIcon = bind(HgSpades, "SpadeIcon");
export const Trash2Icon = bind(HgDelete02, "Trash2Icon");
export const Undo2Icon = bind(HgUndo, "Undo2Icon");

/**
 * Google's mark, inline rather than from the icon set.
 *
 * It is a brand logo with mandated colours, so it is the one icon here that must not
 * inherit `currentColor` and must not be redrawn in the house style. Kept at four
 * paths exactly as Google publishes it.
 */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-5"} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.73c2.18-2.01 3.43-4.97 3.43-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.1 0 5.71-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.7a11.5 11.5 0 0 0 0 10.32l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.08c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.6 15.1.5 12 .5A11.5 11.5 0 0 0 1.7 6.84l3.85 2.98C6.46 7.1 9 5.08 12 5.08Z"
      />
    </svg>
  );
}
