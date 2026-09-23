/** Official pack catalog + sealed-pack open recipes (server-side). */

import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import { LIVE_CARD_RULES, type CardRarity } from "./card-rules";
import {
  generateOwnedCardFromCatalogId,
  rollArt,
  rollGuaranteedFoilForArt,
  rollRarity,
  type OwnedCardDoc,
} from "./pack-open";

export type PackId = "rock-booster" | "rock-starter-tin";

export type PackStatus = "sealed";

export type PackKind = "booster" | "tin";

export type OwnedPackDoc = {
  packId: PackId;
  status: PackStatus;
  acquiredAt: Timestamp | FieldValue;
  source: string;
};

/** Fixed rarity slots before the weighted wild card. */
export type PackRecipeSlot = {
  rarity: CardRarity;
  count: number;
};

export type NestedPackGrant = {
  packId: PackId;
  count: number;
};

export type PackDefinition = {
  id: PackId;
  name: string;
  element: string;
  kind: PackKind;
  /** Guaranteed card pulls by rarity (booster). */
  guaranteed: ReadonlyArray<PackRecipeSlot>;
  /** Extra wild cards via RARITY_WEIGHTS within the pack element (booster). */
  wildCount: number;
  /** Sealed packs granted when this product is opened (tin). */
  nestedPacks: ReadonlyArray<NestedPackGrant>;
  /** Extra element cards with a guaranteed foil finish (tin). */
  guaranteedFoilCards: number;
};

export type PackOpenLoot = {
  cards: Array<Omit<OwnedCardDoc, "acquiredAt">>;
  packs: NestedPackGrant[];
};

export const PACK_CATALOG: Record<PackId, PackDefinition> = {
  "rock-booster": {
    id: "rock-booster",
    name: "Rock Booster Pack",
    element: "Rock",
    kind: "booster",
    guaranteed: [
      { rarity: "Common", count: 3 },
      { rarity: "Uncommon", count: 3 },
      { rarity: "Rare", count: 2 },
    ],
    wildCount: 1,
    nestedPacks: [],
    guaranteedFoilCards: 0,
  },
  "rock-starter-tin": {
    id: "rock-starter-tin",
    name: "Rock Starter Tin",
    element: "Rock",
    kind: "tin",
    guaranteed: [],
    wildCount: 0,
    nestedPacks: [{ packId: "rock-booster", count: 4 }],
    guaranteedFoilCards: 1,
  },
};

export function isPackId(value: unknown): value is PackId {
  return typeof value === "string" && value in PACK_CATALOG;
}

/** Catalog ids for an element, optionally filtered to one rarity. */
export function packPoolForElement(
  element: string,
  rarity?: CardRarity,
): string[] {
  const out: string[] = [];
  for (const [id, rules] of Object.entries(LIVE_CARD_RULES)) {
    if (rules.cardElement !== element) {
      continue;
    }
    if (rarity && rules.rarity !== rarity) {
      continue;
    }
    out.push(id);
  }
  return out;
}

function pickUniform(pool: readonly string[]): string {
  if (pool.length === 0) {
    throw new Error("Pack card pool is empty.");
  }
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Rolls one catalog id of `element` at a fixed rarity (uniform among matches).
 * Falls back to any card of that element if the rarity bucket is empty.
 */
export function rollElementCardId(element: string, rarity: CardRarity): string {
  const pool = packPoolForElement(element, rarity);
  if (pool.length > 0) {
    return pickUniform(pool);
  }
  const fallback = packPoolForElement(element);
  if (fallback.length === 0) {
    throw new Error(`No cards found for element ${element}.`);
  }
  return pickUniform(fallback);
}

/**
 * Wild slot: rarity via RARITY_WEIGHTS, then uniform among that rarity + element.
 */
export function rollWeightedElementCardId(element: string): string {
  const rarity = rollRarity();
  return rollElementCardId(element, rarity);
}

/**
 * Resolves open loot for any catalog product (cards and/or nested sealed packs).
 */
export function generateOpenLoot(
  packId: PackId,
  source?: string,
): PackOpenLoot {
  const def = PACK_CATALOG[packId];
  const cardSource = source ?? `${packId}-open`;
  const cards: Array<Omit<OwnedCardDoc, "acquiredAt">> = [];

  for (const slot of def.guaranteed) {
    for (let i = 0; i < slot.count; i++) {
      const catalogCardId = rollElementCardId(def.element, slot.rarity);
      cards.push(generateOwnedCardFromCatalogId(catalogCardId, cardSource));
    }
  }

  for (let i = 0; i < def.wildCount; i++) {
    const catalogCardId = rollWeightedElementCardId(def.element);
    cards.push(generateOwnedCardFromCatalogId(catalogCardId, cardSource));
  }

  for (let i = 0; i < def.guaranteedFoilCards; i++) {
    const catalogCardId = rollWeightedElementCardId(def.element);
    const art = rollArt();
    cards.push(
      generateOwnedCardFromCatalogId(catalogCardId, cardSource, {
        art,
        foil: rollGuaranteedFoilForArt(art),
      }),
    );
  }

  return {
    cards,
    packs: def.nestedPacks.map((entry) => ({ ...entry })),
  };
}

/**
 * Builds owned-card drafts for opening a booster-style pack (no acquiredAt).
 * @deprecated Prefer {@link generateOpenLoot}.
 */
export function generateCardsForPack(
  packId: PackId,
  source?: string,
): Array<Omit<OwnedCardDoc, "acquiredAt">> {
  return generateOpenLoot(packId, source).cards;
}
