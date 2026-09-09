/** Minimal card rules for live playCard validation (subset of card-catalog). */

export type ManaMap = Record<string, number>;

export interface LiveCardRules {
  id: string;
  cardType: 'Land' | 'Monster' | 'Spell';
  manaCost?: ManaMap;
  space?: number;
  generateMana?: ManaMap;
  maxMana?: ManaMap;
  buildTime?: number;
  placeOnOpponentLandRow?: boolean;
  maxHealth?: number;
  startingBlocks?: number;
}

export const LIVE_CARD_RULES: Record<string, LiveCardRules> = {
  'rock-monster': {
    id: 'rock-monster',
    cardType: 'Monster',
    maxHealth: 50,
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    cardType: 'Monster',
    maxHealth: 40,
  },
  'boulder-toss': {
    id: 'boulder-toss',
    cardType: 'Spell',
    manaCost: { Rock: 4 },
  },
  'mud-hut': {
    id: 'mud-hut',
    cardType: 'Land',
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 10 },
  },
  'mountain-range': {
    id: 'mountain-range',
    cardType: 'Land',
    manaCost: { Rock: 4 },
    space: 3,
    generateMana: { Rock: 4, Ice: 3, Wind: 3, Mystic: 2, Grass: 2, Lightning: 2 },
    maxMana: { Rock: 20, Ice: 10, Wind: 10, Mystic: 10, Grass: 10, Lightning: 10 },
  },
  'temple-of-being': {
    id: 'temple-of-being',
    cardType: 'Land',
    space: 1,
    generateMana: { Rock: 2 },
    maxMana: { Rock: 10 },
    placeOnOpponentLandRow: true,
  },
  armoredillo: {
    id: 'armoredillo',
    cardType: 'Monster',
    maxHealth: 80,
    startingBlocks: 1,
  },
  ruptar: {
    id: 'ruptar',
    cardType: 'Monster',
    manaCost: { Rock: 4 },
    maxHealth: 90,
  },
  'elder-gopher-statue': {
    id: 'elder-gopher-statue',
    cardType: 'Land',
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 10 },
  },
  rockterrior: {
    id: 'rockterrior',
    cardType: 'Monster',
    manaCost: { Rock: 8 },
    maxHealth: 120,
  },
  'rock-slide': {
    id: 'rock-slide',
    cardType: 'Spell',
    manaCost: { Rock: 7 },
  },
  'excavation-site': {
    id: 'excavation-site',
    cardType: 'Land',
    space: 1,
    generateMana: { Rock: 2, Sand: 2 },
    maxMana: { Rock: 15, Sand: 10 },
  },
  'earth-shatter': {
    id: 'earth-shatter',
    cardType: 'Spell',
    manaCost: { Rock: 12 },
  },
  '1000-mile-wall': {
    id: '1000-mile-wall',
    cardType: 'Land',
    manaCost: { Rock: 7 },
    space: 5,
    generateMana: { Rock: 9 },
    maxMana: { Rock: 30 },
    buildTime: 2,
  },
  'king-colossus': {
    id: 'king-colossus',
    cardType: 'Monster',
    manaCost: { Rock: 15 },
    maxHealth: 300,
  },
};

export function getLiveCardRules(cardId: string): LiveCardRules | undefined {
  return LIVE_CARD_RULES[cardId];
}

export function hasManaCost(cost: ManaMap | undefined): boolean {
  if (!cost) {
    return false;
  }
  return Object.values(cost).some((n) => n > 0);
}

export function canAffordMana(pool: ManaMap, cost: ManaMap | undefined): boolean {
  if (!cost || !hasManaCost(cost)) {
    return true;
  }
  for (const [el, amount] of Object.entries(cost)) {
    if ((pool[el] ?? 0) < amount) {
      return false;
    }
  }
  return true;
}

export function spendMana(pool: ManaMap, cost: ManaMap | undefined): ManaMap | null {
  if (!canAffordMana(pool, cost)) {
    return null;
  }
  if (!cost || !hasManaCost(cost)) {
    return { ...pool };
  }
  const next = { ...pool };
  for (const [el, amount] of Object.entries(cost)) {
    next[el] = (next[el] ?? 0) - amount;
    if (next[el] <= 0) {
      delete next[el];
    }
  }
  return next;
}

export function addManaCapped(
  pool: ManaMap,
  add: ManaMap | undefined,
  max: ManaMap | undefined,
): ManaMap {
  if (!add) {
    return { ...pool };
  }
  const next = { ...pool };
  for (const [el, amount] of Object.entries(add)) {
    const cap = max?.[el];
    const raw = (next[el] ?? 0) + amount;
    next[el] = cap === undefined ? raw : Math.min(raw, cap);
  }
  return next;
}
