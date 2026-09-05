import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createMemorableHand,
  listHandsForParticipant,
  MusicHandAccessError,
} from "@/db/music-hand-queries";
import { requireViewer } from "@/lib/auth/session";
import { validateHandResults, type HandResultIssue } from "@/lib/memorable-hand";
import { MAX_AGOROT } from "@/lib/money";

const idSchema = z.string().uuid();
const nullableText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);
const playerSchema = z.object({
  playerId: z.string().uuid(),
  holeCards: nullableText(30),
  delta: z.number().int().min(-MAX_AGOROT).max(MAX_AGOROT),
});
const issueMessages: Record<HandResultIssue, string> = {
  duplicate_players: "כל שחקן יכול להופיע פעם אחת",
  winner_not_participating: "הזוכה חייב להשתתף ביד",
  winner_not_positive: "התוצאה של הזוכה חייבת להיות חיובית",
  invalid_delta: "כל התוצאות חייבות להיות באגורות שלמות",
  results_not_balanced: "תוצאות היד חייבות להתאזן לאפס",
};
const createHandSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    note: nullableText(1_000),
    board: z.object({
      flop: z.string().trim().max(30),
      turn: z.string().trim().max(10),
      river: z.string().trim().max(10),
    }),
    potAmount: z.number().int().min(0).max(MAX_AGOROT).nullable(),
    winnerPlayerId: z.string().uuid(),
    players: z.array(playerSchema).min(2).max(9),
  })
  .superRefine((input, context) => {
    for (const issue of validateHandResults(input.players, input.winnerPlayerId)) {
      context.addIssue({
        code: "custom",
        message: issueMessages[issue],
        path: issue === "winner_not_participating" ? ["winnerPlayerId"] : ["players"],
      });
    }
  });

function errorResponse(error: unknown) {
  if (error instanceof MusicHandAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "הפעולה על היד נכשלה" }, { status: 400 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json({ error: "משחק לא תקין" }, { status: 400 });
  }
  try {
    const records = await listHandsForParticipant(gameId.data, viewer.person.id);
    return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json({ error: "משחק לא תקין" }, { status: 400 });
  }
  const parsed = createHandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "קלט לא תקין", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  try {
    const record = await createMemorableHand(gameId.data, viewer.person.id, parsed.data);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
