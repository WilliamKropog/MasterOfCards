/** Minimal card rules for live validation (subset of card-catalog). */

export type ManaMap = Record<string, number>;
export type TargetZone = 'land' | 'monster';
export type CardRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface LiveCardRules {
  id: string;
  cardType: 'Land' | 'Monster' | 'Spell';
  /** Pack / collection rarity (matches client card-catalog). */
  rarity: CardRarity;
  /** Deck-construction weight (matches client card-catalog). */
  weight: number;
  manaCost?: ManaMap;
  space?: number;
  generateMana?: ManaMap;
  maxMana?: ManaMap;
  buildTime?: number;
  placeOnOpponentLandRow?: boolean;
  maxHealth?: number;
  attack?: number;
  multiAttack?: number;
  hasHaste?: boolean;
  startingBlocks?: number;
  cardElement?: string;
  attributes?: string[];
  monsterClass?: string;
  /** Spell fields */
  damage?: number;
  damageMultiplierAgainstZone?: Partial<Record<TargetZone, number>>;
  scaleDamageByTargetLandSpace?: boolean;
  allowedTargetZones?: TargetZone[];
  destroysTarget?: boolean;
}

export const LIVE_CARD_RULES: Record<string, LiveCardRules> = {
  'rock-monster': {
    id: 'rock-monster',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 2,
    maxHealth: 60,
    attack: 10,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Elemental',
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 1,
    maxHealth: 40,
    attack: 20,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Critter',
  },
  'boulder-toss': {
    id: 'boulder-toss',
    cardType: 'Spell',
    rarity: 'Common',
    weight: 2,
    manaCost: { Rock: 4 },
    damage: 70,
    damageMultiplierAgainstZone: { land: 2 },
    cardElement: 'Rock',
  },
  'mud-hut': {
    id: 'mud-hut',
    cardType: 'Land',
    rarity: 'Common',
    weight: 2,
    maxHealth: 80,
    buildTime: 0,
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 5 },
    cardElement: 'Rock',
  },
  'mountain-range': {
    id: 'mountain-range',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 5,
    manaCost: { Rock: 4 },
    maxHealth: 400,
    buildTime: 3,
    space: 3,
    generateMana: { Rock: 5, Rainbow: 2 },
    maxMana: { Rock: 15, Rainbow: 6 },
    cardElement: 'Rock',
  },
  'temple-of-being': {
    id: 'temple-of-being',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 3,
    maxHealth: 100,
    buildTime: 2,
    space: 1,
    generateMana: { Rock: 2 },
    maxMana: { Rock: 6 },
    placeOnOpponentLandRow: true,
    cardElement: 'Rock',
  },
  armoredillo: {
    id: 'armoredillo',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 1,
    maxHealth: 30,
    attack: 30,
    startingBlocks: 1,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Critter',
  },
  ruptar: {
    id: 'ruptar',
    cardType: 'Monster',
    rarity: 'Rare',
    weight: 3,
    manaCost: { Rock: 4 },
    maxHealth: 100,
    attack: 20,
    multiAttack: 2,
    hasHaste: true,
    cardElement: 'Rock',
    attributes: ['Melee', 'Haste'],
    monsterClass: 'Dinosaur',
  },
  'elder-gopher-statue': {
    id: 'elder-gopher-statue',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 3,
    maxHealth: 150,
    buildTime: 1,
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 10 },
    cardElement: 'Rock',
  },
  rockterrior: {
    id: 'rockterrior',
    cardType: 'Monster',
    rarity: 'Rare',
    weight: 4,
    manaCost: { Rock: 9 },
    maxHealth: 140,
    attack: 40,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Dinosaur',
  },
  'rock-slide': {
    id: 'rock-slide',
    cardType: 'Spell',
    rarity: 'Uncommon',
    weight: 4,
    manaCost: { Rock: 7 },
    damage: 100,
    allowedTargetZones: ['land'],
    scaleDamageByTargetLandSpace: true,
    cardElement: 'Rock',
  },
  'excavation-site': {
    id: 'excavation-site',
    cardType: 'Land',
    rarity: 'Rare',
    weight: 3,
    maxHealth: 120,
    buildTime: 2,
    space: 1,
    generateMana: { Rock: 2, Sand: 2 },
    maxMana: { Rock: 6, Sand: 6 },
    cardElement: 'Rock',
  },
  'earth-shatter': {
    id: 'earth-shatter',
    cardType: 'Spell',
    rarity: 'Epic',
    weight: 7,
    manaCost: { Rock: 15 },
    allowedTargetZones: ['land'],
    destroysTarget: true,
    cardElement: 'Rock',
  },
  '1000-mile-wall': {
    id: '1000-mile-wall',
    cardType: 'Land',
    rarity: 'Epic',
    weight: 8,
    maxHealth: 300,
    buildTime: 5,
    space: 5,
    generateMana: { Rock: 8 },
    maxMana: { Rock: 40 },
    cardElement: 'Rock',
  },
  'king-colossus': {
    id: 'king-colossus',
    cardType: 'Monster',
    rarity: 'Legendary',
    weight: 10,
    manaCost: { Rock: 20 },
    maxHealth: 100,
    attack: 50,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Elemental',
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

/** Universal mana. Pays for any element, and is spent before that element's own mana. */
export const RAINBOW_MANA = "Rainbow";

interface RainbowSpend {
  rainbowLeft: number;
  specific: ManaMap;
}

/**
 * Rainbow covers any element and is used before that element's own mana.
 * A Rainbow cost itself is paid only with Rainbow.
 * Returns null when the pool cannot cover the cost.
 */
function rainbowSpendPlan(pool: ManaMap, cost: ManaMap): RainbowSpend | null {
  let rainbow = pool[RAINBOW_MANA] ?? 0;
  const rainbowCost = cost[RAINBOW_MANA] ?? 0;
  if (rainbowCost > 0) {
    if (rainbow < rainbowCost) {
      return null;
    }
    rainbow -= rainbowCost;
  }
  const specific: ManaMap = {};
  const elements = Object.keys(cost)
    .filter((element) => element !== RAINBOW_MANA)
    .sort();
  for (const element of elements) {
    const amount = cost[element] ?? 0;
    if (amount <= 0) {
      continue;
    }
    const fromRainbow = Math.min(rainbow, amount);
    const fromSpecific = amount - fromRainbow;
    if ((pool[element] ?? 0) < fromSpecific) {
      return null;
    }
    rainbow -= fromRainbow;
    if (fromSpecific > 0) {
      specific[element] = fromSpecific;
    }
  }
  return { rainbowLeft: rainbow, specific };
}

function applyRainbowSpend(pool: ManaMap, plan: RainbowSpend): ManaMap {
  const next: ManaMap = { ...pool };
  if (plan.rainbowLeft <= 0) {
    delete next[RAINBOW_MANA];
  } else {
    next[RAINBOW_MANA] = plan.rainbowLeft;
  }
  for (const [element, amount] of Object.entries(plan.specific)) {
    const remaining = (next[element] ?? 0) - amount;
    if (remaining <= 0) {
      delete next[element];
    } else {
      next[element] = remaining;
    }
  }
  return next;
}

export function canAffordMana(pool: ManaMap, cost: ManaMap | undefined): boolean {
  if (!cost || !hasManaCost(cost)) {
    return true;
  }
  return rainbowSpendPlan(pool, cost) !== null;
}

export function spendMana(pool: ManaMap, cost: ManaMap | undefined): ManaMap | null {
  if (!cost || !hasManaCost(cost)) {
    return { ...pool };
  }
  const plan = rainbowSpendPlan(pool, cost);
  if (!plan) {
    return null;
  }
  return applyRainbowSpend(pool, plan);
}

export function addManaCapped(
  pool: ManaMap,
  add: ManaMap | undefined,
  max: ManaMap | undefined,
): ManaMap {
  const merged = { ...pool };
  if (add) {
    for (const [el, amount] of Object.entries(add)) {
      merged[el] = (merged[el] ?? 0) + amount;
    }
  }
  return clampManaPoolToMax(merged, max ?? {});
}

/** Clamp every element in the pool to active land caps (missing cap → 0). */
export function clampManaPoolToMax(pool: ManaMap, maxMana: ManaMap): ManaMap {
  const out: ManaMap = {};
  for (const [element, amount] of Object.entries(pool)) {
    if (amount <= 0) {
      continue;
    }
    const cap = maxMana[element] ?? 0;
    const clamped = Math.min(amount, cap);
    if (clamped > 0) {
      out[element] = clamped;
    }
  }
  return out;
}

/** True while a land’s buildTime has not elapsed for the owning player. */
export function isLandStillBuilding(
  rules: LiveCardRules | undefined,
  placedAtOwnerTurnCounter: number,
  ownerTurnCounter: number,
): boolean {
  const buildTime = rules?.buildTime ?? 0;
  if (buildTime <= 0) {
    return false;
  }
  return placedAtOwnerTurnCounter + buildTime - ownerTurnCounter > 0;
}

export function spellAllowsTargetZone(
  rules: LiveCardRules | undefined,
  zone: TargetZone,
): boolean {
  if (!rules || rules.cardType !== 'Spell') {
    return false;
  }
  const allowed = rules.allowedTargetZones;
  if (!allowed || allowed.length === 0) {
    return true;
  }
  return allowed.includes(zone);
}

export function spellAllowsPlayerLifeTarget(rules: LiveCardRules | undefined): boolean {
  if (!rules || rules.cardType !== 'Spell') {
    return false;
  }
  const allowed = rules.allowedTargetZones;
  return !allowed || allowed.length === 0;
}
