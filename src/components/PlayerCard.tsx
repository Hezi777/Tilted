"use client";

import { Link2OffIcon, LogOutIcon, MoreVerticalIcon, Trash2Icon, Undo2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChipAvatar } from "@/components/ChipAvatar";
import { RebuyButton } from "@/components/RebuyButton";
import { Money } from "@/components/Money";
import type { LivePlayer } from "@/db/live-queries";

export function PlayerCard({
  player,
  defaultAmount,
  canManage,
  onRebuy,
  onCustomRebuy,
  onUndo,
  onDelete,
  onRelease,
  onEarlyExit,
}: {
  player: LivePlayer;
  defaultAmount: number;
  canManage: boolean;
  onRebuy: (playerId: string, amount: number) => void;
  onCustomRebuy: (player: LivePlayer) => void;
  onUndo: (player: LivePlayer) => void;
  onDelete: (player: LivePlayer) => void;
  onRelease: (player: LivePlayer) => void;
  /** Host-only: freeze this player's result and let the table carry on without them. */
  onEarlyExit: (player: LivePlayer) => void;
}) {
  const showMenu = player.isYou || canManage;
  // Your own seat, or anyone's if you are the host. Mirrors the server rule exactly.
  const canWrite = !player.isSettled && (player.isYou || canManage);
  return (
    <Card className={player.isYou ? "accent-rim bg-surface-3" : "bg-surface-2"}>
      {/* One row for who this is, one for what you can do to them. They used to share
          a single row, and in the only place this card is used -- a dialog on a phone --
          a 112px rebuy pill and a 48px menu left the name nothing to truncate into: it
          vanished entirely while the badges slid under the button. */}
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <ChipAvatar avatarKey={player.avatarKey} personId={player.personId} name={player.name} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-bold">{player.name}</p>
              {player.isYou && <span className="shrink-0 rounded-full bg-brand-500/14 px-2 py-0.5 text-xs text-brand-300">אתה</span>}
              {player.isHost && <span className="text-muted-foreground shrink-0 text-xs">מארח</span>}
            </div>
            {/* A waiting seat still has money in the pot: the host picked this player
                at setup, so the seat carries an initial buy-in whether or not its owner
                has ever opened the app. Hiding the total behind "ממתין" made the header
                pot disagree with every seat on the table. "ממתין" is a note about the
                person, not a reason to stop counting their chips. */}
            <div className="mt-1 flex items-center gap-2">
              <Money value={player.totalIn} className="text-lg font-semibold" />
              <span className="shrink-0 rounded-full bg-brand-500/14 px-2 py-0.5 text-xs font-bold text-brand-300">x{player.buyInCount}</span>
              {player.isWaiting && <span className="text-muted-foreground shrink-0 text-xs">ממתין</span>}
              {player.isSettled && <span className="text-muted-foreground shrink-0 text-xs">נסגר</span>}
            </div>
          </div>
          {showMenu && !player.isSettled && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" className="size-12 shrink-0" aria-label={`פעולות עבור ${player.name}`}><MoreVerticalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {/* Gated on who may write, not on whether the seat has been opened.
                    `assertCanInsertBuyIn` and `assertCanDeleteBuyIn` let the host act for
                    any live seat and never look at `device_id`; requiring a claimed seat
                    here meant that on the ordinary night -- one phone, the host's -- five
                    of six players' rebuys could not be entered at all. */}
                {canWrite && <DropdownMenuItem onSelect={() => onCustomRebuy(player)}>ריביי בסכום אחר</DropdownMenuItem>}
                {canWrite && <DropdownMenuItem onSelect={() => onUndo(player)}><Undo2Icon /> תיקון ריביים</DropdownMenuItem>}
                {/* Spec edge case 11.2: someone leaves early and the table plays on.
                    They are usually the one person without the app open -- that is why
                    they are leaving -- so the host counts their stack for them, which
                    `assertCanCashOutEarly` has always allowed. */}
                {canManage && !player.isYou && (
                  <DropdownMenuItem onSelect={() => onEarlyExit(player)}>
                    <LogOutIcon /> יציאה מוקדמת
                  </DropdownMenuItem>
                )}
                {canManage && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onDelete(player)}><Trash2Icon /> מחיקת שחקן</DropdownMenuItem></>}
                {canManage && player.isHost === false && !player.isWaiting && <DropdownMenuItem onSelect={() => onRelease(player)}><Link2OffIcon /> שחרור מכשיר</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {canWrite && (
          <RebuyButton
            amount={defaultAmount}
            onClick={() => onRebuy(player.id, defaultAmount)}
            className="w-full"
          />
        )}
      </CardContent>
    </Card>
  );
}
