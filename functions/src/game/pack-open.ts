/** Owned-card minting helpers for pack openings (server-side only). */

import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import { LIVE_CARD_RULES, type CardRarity } from "./card-rules";

export const PACK_SIZE = 5;

export type CardArt = "default" | "Full Art" | "IR" | "SIR";

/** Foil finish — rolled after art so special arts never get holo/reverse. */
export type CardFoil =
  | "default"
  | "holo rainbow"
  | "holo sparkle"
  | "holo diamond"
  | "holo shattered"
  | "holo galaxy"
  | "reverse rainbow"
  | "reverse sparkle"
  | "reverse diamond"
  | "reverse shattered"
  | "reverse galaxy"
  | "full rainbow"
  | "full sparkle"
  | "full diamond"
  | "full shattered"
  | "full galaxy";

export type OwnedCardDoc = {
  catalogCardId: string;
  /** Uniform quality in [0, 1] with 9 decimal places (e.g. 0.574837401). */
  cardQuality: number;
  art: CardArt;
  foil: CardFoil;
  skin: string;
  acquiredAt: Timestamp | FieldValue;
  source: string;
};

/**
 * Pack rarity pull rates (weights sum to 100 = percentages).
 *
 *   Common     45%
 *   Uncommon   30%
 *   Rare       15%
 *   Epic        9%
 *   Legendary   1%
 */
export const RARITY_WEIGHTS: ReadonlyArray<{ rarity: CardRarity; weight: number }> = [
  { rarity: "Common", weight: 45 },
  { rarity: "Uncommon", weight: 30 },
  { rarity: "Rare", weight: 15 },
  { rarity: "Epic", weight: 9 },
  { rarity: "Legendary", weight: 1 },
];

/**
 * Art pull rates (independent of catalog rarity).
 * Weights sum to 100.
 */
export const ART_WEIGHTS: ReadonlyArray<{ art: CardArt; weight: number }> = [
  { art: "default", weight: 98.89 },
  { art: "Full Art", weight: 1 },
  { art: "IR", weight: 0.1 },
  { art: "SIR", weight: 0.01 },
];

export const FOIL_WEIGHTS: ReadonlyArray<{ foil: CardFoil; weight: number }> = [
  { foil: "default", weight: 115 },
  { foil: "holo rainbow", weight: 3 },
  { foil: "holo sparkle", weight: 2 },
  { foil: "holo diamond", weight: 2 },
  { foil: "holo shattered", weight: 2 },
  { foil: "holo galaxy", weight: 1 },
  { foil: "reverse rainbow", weight: 0.7 },
  { foil: "reverse sparkle", weight: 0.5 },
  { foil: "reverse diamond", weight: 0.5 },
  { foil: "reverse shattered", weight: 0.5 },
  { foil: "reverse galaxy", weight: 0.2 },
  { foil: "full rainbow", weight: 0.1 },
  { foil: "full sparkle", weight: 0.05 },
  { foil: "full diamond", weight: 0.05 },
  { foil: "full shattered", weight: 0.05 },
  { foil: "full galaxy", weight: 0.01 },
];

/** Catalog ids grouped by rarity for pack rolls. */
export const PACK_POOL_BY_RARITY: Readonly<Record<CardRarity, readonly string[]>> = (() => {
  const buckets: Record<CardRarity, string[]> = {
    Common: [],
    Uncommon: [],
    Rare: [],
    Epic: [],
    Legendary: [],
  };
  for (const [id, rules] of Object.entries(LIVE_CARD_RULES)) {
    buckets[rules.rarity].push(id);
  }
  return buckets;
})();

function randomUnit(): number {
  return Math.random();
}

function pickWeighted<T extends string>(
  entries: ReadonlyArray<{ weight: number } & Record<string, unknown>>,
  key: string,
  fallback: T,
): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = randomUnit() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry[key] as T;
    }
  }
  return fallback;
}

/**
 * Uniform card quality from 0 to 1 (inclusive), quantized to 9 decimal places.
 * Example: `0.574837401`
 */
export function rollCardQuality(): number {
  // 0 .. 1_000_000_000 inclusive → 0.000000000 .. 1.000000000
  const scaled = Math.floor(randomUnit() * 1_000_000_001);
  return scaled / 1_000_000_000;
}

export function rollArt(): CardArt {
  return pickWeighted(ART_WEIGHTS, "art", "default");
}

export function isSpecialArt(art: CardArt): boolean {
  return art !== "default";
}

/** Special art may only use default or full-* foils (never holo/reverse). */
export function foilAllowedForArt(foil: CardFoil, art: CardArt): boolean {
  if (!isSpecialArt(art)) {
    return true;
  }
  return foil === "default" || foil.startsWith("full ");
}

function foilPoolForArt(art: CardArt): ReadonlyArray<{ foil: CardFoil; weight: number }> {
  return FOIL_WEIGHTS.filter(
    (entry) => entry.weight > 0 && foilAllowedForArt(entry.foil, art),
  );
}

/** Weighted foil roll constrained by the card's art. */
export function rollFoilForArt(art: CardArt): CardFoil {
  const pool = foilPoolForArt(art);
  return pickWeighted(pool, "foil", "default");
}

/**
 * Guaranteed non-default foil, still constrained by art
 * (special art → full-* only; default art → any non-default foil).
 */
export function rollGuaranteedFoilForArt(art: CardArt): CardFoil {
  const pool = foilPoolForArt(art).filter((entry) => entry.foil !== "default");
  if (pool.length === 0) {
    return "full rainbow";
  }
  return pickWeighted(pool, "foil", "full rainbow");
}

/** @deprecated Prefer {@link rollFoilForArt}. */
export function rollFoil(): CardFoil {
  return rollFoilForArt("default");
}

/** @deprecated Prefer {@link rollGuaranteedFoilForArt}. */
export function rollGuaranteedFoil(): CardFoil {
  return rollGuaranteedFoilForArt("default");
}

/** Roll a rarity using {@link RARITY_WEIGHTS} (45 / 30 / 15 / 9 / 1). */
export function rollRarity(): CardRarity {
  return pickWeighted(RARITY_WEIGHTS, "rarity", "Common");
}

/**
 * Two-step catalog pick:
 * 1) weighted rarity roll
 * 2) uniform pick among cards of that rarity
 */
export function rollCatalogCardId(): string {
  const rarity = rollRarity();
  let pool = PACK_POOL_BY_RARITY[rarity];
  if (pool.length === 0) {
    // Fallback if a rarity bucket is empty (should not happen with current catalog).
    pool = Object.keys(LIVE_CARD_RULES);
  }
  if (pool.length === 0) {
    throw new Error("PACK_CARD_POOL is empty.");
  }
  const index = Math.floor(randomUnit() * pool.length);
  return pool[index]!;
}

/**
 * Builds one owned-card payload (without acquiredAt — caller sets timestamp).
 */
export function generateOwnedCard(source = "test-pack"): Omit<OwnedCardDoc, "acquiredAt"> {
  return generateOwnedCardFromCatalogId(rollCatalogCardId(), source);
}

/** Builds an owned-card payload for a known catalog id. */
export function generateOwnedCardFromCatalogId(
  catalogCardId: string,
  source = "test-pack",
  options?: { foil?: CardFoil; art?: CardArt },
): Omit<OwnedCardDoc, "acquiredAt"> {
  const art = options?.art ?? rollArt();
  const foil = options?.foil ?? rollFoilForArt(art);
  return {
    catalogCardId,
    cardQuality: rollCardQuality(),
    art,
    foil,
    skin: "default",
    source,
  };
}

export function generatePackCards(
  count = PACK_SIZE,
  source = "test-pack",
): Array<Omit<OwnedCardDoc, "acquiredAt">> {
  const cards: Array<Omit<OwnedCardDoc, "acquiredAt">> = [];
  for (let i = 0; i < count; i++) {
    cards.push(generateOwnedCard(source));
  }
  return cards;
}
