"use client";

import { Link2OffIcon, MoreVerticalIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChipAvatar } from "@/components/ChipAvatar";
import { RebuyButton } from "@/components/RebuyButton";
import type { LivePlayer } from "@/db/live-queries";
import { agorot, formatILS } from "@/lib/money";

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
    <Card className={player.isYou ? "border-gold/70 bg-gold/5 shadow-[0_8px_24px_-18px_var(--felt)] ring-2 ring-gold/40" : "border-foreground/10 bg-card/80 shadow-none"}>
      <CardContent className="flex items-center gap-3 p-4">
        <ChipAvatar avatarKey={player.avatarKey} personId={player.personId} name={player.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold">{player.name}</p>
            {player.isYou && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">אתה</span>}
            {player.isHost && <span className="text-muted-foreground text-xs">מארח</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="tabular text-lg font-semibold">{formatILS(agorot(player.totalIn))}</span>
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-felt">x{player.buyInCount}</span>
            {player.isSettled && <span className="text-muted-foreground text-xs">נסגר</span>}
          </div>
        </div>
        {player.isSettled ? null : player.isYou ? (
          <RebuyButton amount={defaultAmount} onClick={() => onRebuy(player.id, defaultAmount)} />
        ) : null}
        {showMenu && !player.isSettled && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="size-12" aria-label={`פעולות עבור ${player.name}`}><MoreVerticalIcon /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onCustomRebuy(player)}>ריביי בסכום אחר</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onUndo(player)}><Undo2Icon /> ביטול ריביי אחרון</DropdownMenuItem>
              {canManage && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onDelete(player)}><Trash2Icon /> מחיקת שחקן</DropdownMenuItem></>}
              {canManage && player.isHost === false && <DropdownMenuItem onSelect={() => onRelease(player)}><Link2OffIcon /> שחרור מכשיר</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}
