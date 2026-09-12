"use client";

import { Link2OffIcon, MoreVerticalIcon, Trash2Icon, Undo2Icon } from "@/components/icons";
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
}: {
  player: LivePlayer;
  defaultAmount: number;
  canManage: boolean;
  onRebuy: (playerId: string, amount: number) => void;
  onCustomRebuy: (player: LivePlayer) => void;
  onUndo: (player: LivePlayer) => void;
  onDelete: (player: LivePlayer) => void;
  onRelease: (player: LivePlayer) => void;
}) {
  const showMenu = player.isYou || canManage;
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
            <div className="mt-1 flex items-center gap-2">
              <Money value={player.totalIn} className="text-lg font-semibold" />
              <span className="shrink-0 rounded-full bg-brand-500/14 px-2 py-0.5 text-xs font-bold text-brand-300">x{player.buyInCount}</span>
              {player.isSettled && <span className="text-muted-foreground shrink-0 text-xs">נסגר</span>}
            </div>
          </div>
          {showMenu && !player.isSettled && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" className="size-12 shrink-0" aria-label={`פעולות עבור ${player.name}`}><MoreVerticalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => onCustomRebuy(player)}>ריביי בסכום אחר</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onUndo(player)}><Undo2Icon /> ביטול ריביי אחרון</DropdownMenuItem>
                {canManage && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onDelete(player)}><Trash2Icon /> מחיקת שחקן</DropdownMenuItem></>}
                {canManage && player.isHost === false && <DropdownMenuItem onSelect={() => onRelease(player)}><Link2OffIcon /> שחרור מכשיר</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {!player.isSettled && player.isYou && (
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
