import Image from "next/image";
import { cn } from "@/lib/utils";
import { potStackTierForBuyIns, type PotStackTier } from "@/lib/pot-stack";

const tierAssets: Record<PotStackTier, { src: string; width: number; height: number; className: string }> = {
  1: { src: "/art/states/pot-stack.webp", width: 297, height: 320, className: "max-h-14 max-w-14" },
  2: { src: "/art/states/pot-stack-2.webp", width: 384, height: 369, className: "max-h-16 max-w-18" },
  3: { src: "/art/states/pot-stack-3.webp", width: 445, height: 448, className: "max-h-18 max-w-20" },
  4: { src: "/art/states/pot-stack-4.webp", width: 512, height: 496, className: "max-h-20 max-w-24" },
};

export function PotStack({ buyInCount, className }: { buyInCount: number; className?: string }) {
  const asset = tierAssets[potStackTierForBuyIns(buyInCount)];
  return (
    <span className={cn("flex h-20 w-24 items-end justify-center", className)}>
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        sizes="96px"
        alt=""
        aria-hidden="true"
        className={cn("h-auto w-auto drop-shadow-[0_9px_10px_rgb(0_0_0/0.7)]", asset.className)}
      />
    </span>
  );
}
