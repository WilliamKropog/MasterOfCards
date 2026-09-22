/** Owned-card minting helpers for pack openings (server-side only). */

import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import { LIVE_CARD_RULES, type CardRarity } from "./card-rules";

export const PACK_SIZE = 5;

export type CardSpecialty =
  | "none"
  | "Full Art"
  | "IR"
  | "SIR";

/** Foil finish rolled independently of catalog rarity / specialty. */
export type CardFoil =
  | "none"
  | "holo"
  | "reverse holo"
  | "rainbow"
  | "shattered"
  | "galaxy";

export type OwnedCardDoc = {
  catalogCardId: string;
  /** Uniform quality in [0, 1] with 9 decimal places (e.g. 0.574837401). */
  cardQuality: number;
  specialty: CardSpecialty;
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
 * Specialty finish pull rates (independent of catalog rarity).
 * Weights sum to 100.
 */
export const SPECIALTY_WEIGHTS: ReadonlyArray<{ specialty: CardSpecialty; weight: number }> = [
  { specialty: "none", weight: 98.89 },
  { specialty: "Full Art", weight: 1 },
  { specialty: "IR", weight: 0.1 },
  { specialty: "SIR", weight: 0.01 },
];

export const FOIL_WEIGHTS: ReadonlyArray<{ foil: CardFoil; weight: number }> = [
  { foil: "none", weight: 95 },
  { foil: "holo", weight: 2 },
  { foil: "reverse holo", weight: 1.4 },
  { foil: "rainbow", weight: 1 },
  { foil: "shattered", weight: .5 },
  { foil: "galaxy", weight: 0.1 },
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

export function rollSpecialty(): CardSpecialty {
  return pickWeighted(SPECIALTY_WEIGHTS, "specialty", "none");
}

export function rollFoil(): CardFoil {
  return pickWeighted(FOIL_WEIGHTS, "foil", "none");
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
): Omit<OwnedCardDoc, "acquiredAt"> {
  return {
    catalogCardId,
    cardQuality: rollCardQuality(),
    specialty: rollSpecialty(),
    foil: rollFoil(),
    skin: "none",
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
