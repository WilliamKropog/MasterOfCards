/** Owned-card minting helpers for pack openings (server-side only). */

import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import { LIVE_CARD_RULES, type CardRarity } from "./card-rules";

export const PACK_SIZE = 5;

export type CardSpecialty =
  | "Default"
  | "Hollow"
  | "Reverse Hollow"
  | "IR"
  | "SIR";

export type OwnedCardDoc = {
  catalogCardId: string;
  cardQuality: number;
  specialty: CardSpecialty;
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
  { specialty: "Default", weight: 70 },
  { specialty: "Hollow", weight: 20 },
  { specialty: "Reverse Hollow", weight: 5 },
  { specialty: "IR", weight: 4 },
  { specialty: "SIR", weight: 1 },
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

/** Uniform random card quality from 0.0 to 10.0 (one decimal place). */
export function rollCardQuality(): number {
  return Math.round(randomUnit() * 100) / 10;
}

export function rollSpecialty(): CardSpecialty {
  return pickWeighted(SPECIALTY_WEIGHTS, "specialty", "Default");
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
  return {
    catalogCardId: rollCatalogCardId(),
    cardQuality: rollCardQuality(),
    specialty: rollSpecialty(),
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
