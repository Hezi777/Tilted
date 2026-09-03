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
    <Card className={player.isYou ? "border-ruby/55 bg-ruby/7 shadow-[0_12px_30px_-20px_rgb(220_25_45/0.7)] ring-1 ring-ruby/35" : "border-foreground/10 bg-card/85 shadow-none"}>
      <CardContent className="flex items-center gap-3 p-4">
        <ChipAvatar avatarKey={player.avatarKey} personId={player.personId} name={player.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold">{player.name}</p>
            {player.isYou && <span className="rounded-full bg-ruby/15 px-2 py-0.5 text-xs text-ruby-bright">אתה</span>}
            {player.isHost && <span className="text-muted-foreground text-xs">מארח</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="tabular text-lg font-semibold">{formatILS(agorot(player.totalIn))}</span>
            <span className="rounded-full bg-ruby/16 px-2 py-0.5 text-xs font-bold text-ruby-bright">x{player.buyInCount}</span>
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
