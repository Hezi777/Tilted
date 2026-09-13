export const CARD_SUITS = [
  { code: "s", symbol: "♠", name: "עלה", tone: "black" },
  { code: "h", symbol: "♥", name: "לב", tone: "red" },
  { code: "d", symbol: "♦", name: "יהלום", tone: "red" },
  { code: "c", symbol: "♣", name: "תלתן", tone: "black" },
] as const;

export const CARD_RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export type CardSuitCode = (typeof CARD_SUITS)[number]["code"];
export type CardRank = (typeof CARD_RANKS)[number];
export type PlayingCardCode = `${CardRank}${CardSuitCode}`;

export interface PlayingCardValue {
  code: PlayingCardCode;
  rank: CardRank;
  suit: CardSuitCode;
  symbol: (typeof CARD_SUITS)[number]["symbol"];
  suitName: (typeof CARD_SUITS)[number]["name"];
  tone: (typeof CARD_SUITS)[number]["tone"];
}

export const POKER_DECK: readonly PlayingCardValue[] = CARD_SUITS.flatMap((suit) =>
  CARD_RANKS.map((rank) => ({
    code: `${rank}${suit.code}` as PlayingCardCode,
    rank,
    suit: suit.code,
    symbol: suit.symbol,
    suitName: suit.name,
    tone: suit.tone,
  })),
);

const CARD_BY_CODE = new Map(POKER_DECK.map((card) => [card.code, card]));
const SUIT_CODE_BY_SYMBOL = new Map(CARD_SUITS.map((suit) => [suit.symbol, suit.code]));

export function playingCard(code: PlayingCardCode): PlayingCardValue {
  const card = CARD_BY_CODE.get(code);
  if (!card) throw new Error(`Unknown playing card: ${code}`);
  return card;
}

/** Persists the same compact, readable notation older memorable-hand rows already use. */
export function serializePlayingCards(cards: readonly PlayingCardCode[]): string {
  return cards.map((code) => {
    const card = playingCard(code);
    return `${card.rank}${card.symbol}`;
  }).join(" ");
}

/** Reads both the UI's `A♠` notation and machine-friendly `As` tokens. */
export function parsePlayingCards(value: string | null | undefined): PlayingCardCode[] {
  if (!value?.trim()) return [];
  const parsed: PlayingCardCode[] = [];
  for (const token of value.trim().split(/\s+/)) {
    const match = /^(10|[2-9AJKQ])([shdc♠♥♦♣])$/i.exec(token);
    if (!match) return [];
    const rank = match[1].toUpperCase() as CardRank;
    const rawSuit = match[2].toLowerCase();
    const suit = (SUIT_CODE_BY_SYMBOL.get(match[2] as "♠" | "♥" | "♦" | "♣") ?? rawSuit) as CardSuitCode;
    const code = `${rank}${suit}` as PlayingCardCode;
    if (!CARD_BY_CODE.has(code)) return [];
    parsed.push(code);
  }
  return parsed;
}

