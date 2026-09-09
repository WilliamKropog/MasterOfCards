/** Serializable live-match board (Cloud Functions copy). */

import {
  addManaCapped,
  getLiveCardRules,
  hasManaCost,
  spendMana,
  type ManaMap,
} from './card-rules';

export type LiveManaMap = Record<string, number>;

export interface LiveFieldCard {
  fieldInstanceId: number;
  cardId: string;
  placedAtTurnCounter: number;
  placedAtOwnerTurnCounter: number;
  controllerSlot?: "player1" | "player2";
  currentHealth?: number;
  maxHealthOverride?: number;
  hasActedThisTurn?: boolean;
  attacksThisTurn?: number;
  defending?: boolean;
  spellImmune?: boolean;
  blocks?: number;
  fieldSlot?: number;
  influencedSpaces?: number[];
  praiseBonusRock?: number;
  usedAbilities?: string[];
}

export interface LiveGameState {
  version: number;
  gameStarted: boolean;
  currentTurn: 1 | 2;
  activePlayer: 1 | 2;
  turnCounter: number;
  player1TurnCounter: number;
  player2TurnCounter: number;
  player1LifePoints: number;
  player2LifePoints: number;
  player1Hand: string[];
  player2Hand: string[];
  player1Deck: string[];
  player2Deck: string[];
  player1FieldLand: LiveFieldCard[];
  player1FieldMonster: LiveFieldCard[];
  player2FieldLand: LiveFieldCard[];
  player2FieldMonster: LiveFieldCard[];
  player1ManaPool: LiveManaMap;
  player2ManaPool: LiveManaMap;
  placedFreeFieldCardThisTurn: boolean;
  nextFieldInstanceId: number;
}

export const LIVE_STARTING_LIFE_POINTS = 1000;
export const LIVE_OPENING_HAND_SIZE = 5;
export const LIVE_DECK_SIZE = 25;

export const LIVE_DECK_CARD_POOL: readonly string[] = [
  "rock-monster",
  "mighty-gopher",
  "boulder-toss",
  "mud-hut",
  "mountain-range",
  "temple-of-being",
  "armoredillo",
  "ruptar",
  "mighty-gopher",
  "elder-gopher-statue",
  "rockterrior",
  "rock-slide",
  "excavation-site",
  "earth-shatter",
  "1000-mile-wall",
  "king-colossus",
];

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function buildShuffledDeck(): string[] {
  const deck: string[] = [];
  for (let i = 0; i < LIVE_DECK_SIZE; i++) {
    deck.push(
      LIVE_DECK_CARD_POOL[Math.floor(Math.random() * LIVE_DECK_CARD_POOL.length)]!,
    );
  }
  shuffleInPlace(deck);
  return deck;
}

function clearActedFlags(cards: LiveFieldCard[]): LiveFieldCard[] {
  return cards.map((e) => {
    const { attacksThisTurn: _removed, ...rest } = e;
    return {
      ...rest,
      hasActedThisTurn: false,
    };
  });
}

function clearDefending(cards: LiveFieldCard[]): LiveFieldCard[] {
  return cards.map((e) => ({
    ...e,
    defending: false,
    spellImmune: false,
  }));
}

/** Firestore rejects `undefined` field values — strip them before writes. */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) {
        continue;
      }
      out[key] = stripUndefinedDeep(nested);
    }
    return out as T;
  }
  return value;
}

export function createInitialLiveGameState(): LiveGameState {
  const deck1 = buildShuffledDeck();
  const deck2 = buildShuffledDeck();
  const hand1 = deck1.splice(0, LIVE_OPENING_HAND_SIZE);
  const hand2 = deck2.splice(0, LIVE_OPENING_HAND_SIZE);

  return {
    version: 1,
    gameStarted: true,
    currentTurn: 1,
    activePlayer: 1,
    turnCounter: 1,
    player1TurnCounter: 1,
    player2TurnCounter: 0,
    player1LifePoints: LIVE_STARTING_LIFE_POINTS,
    player2LifePoints: LIVE_STARTING_LIFE_POINTS,
    player1Hand: hand1,
    player2Hand: hand2,
    player1Deck: deck1,
    player2Deck: deck2,
    player1FieldLand: [],
    player1FieldMonster: [],
    player2FieldLand: [],
    player2FieldMonster: [],
    player1ManaPool: {},
    player2ManaPool: {},
    placedFreeFieldCardThisTurn: false,
    nextFieldInstanceId: 1,
  };
}

/** Authoritative end-turn mutation (mirrors GameEngineService.nextTurn core). */
export function applyEndTurnToLiveGameState(state: LiveGameState): LiveGameState {
  const t = state.currentTurn;
  const next: 1 | 2 = t === 1 ? 2 : 1;
  let turnCounter = state.turnCounter;
  if (t === 2 && next === 1) {
    turnCounter += 1;
  }

  const nextState: LiveGameState = {
    ...state,
    version: state.version + 1,
    currentTurn: next,
    activePlayer: next,
    turnCounter,
    player1TurnCounter:
      next === 1 ? state.player1TurnCounter + 1 : state.player1TurnCounter,
    player2TurnCounter:
      next === 2 ? state.player2TurnCounter + 1 : state.player2TurnCounter,
    placedFreeFieldCardThisTurn: false,
    player1FieldLand: clearActedFlags(state.player1FieldLand),
    player1FieldMonster: clearActedFlags(state.player1FieldMonster),
    player2FieldLand: clearActedFlags(state.player2FieldLand),
    player2FieldMonster: clearActedFlags(state.player2FieldMonster),
    player1Hand: [...state.player1Hand],
    player2Hand: [...state.player2Hand],
    player1Deck: [...state.player1Deck],
    player2Deck: [...state.player2Deck],
    player1ManaPool: { ...state.player1ManaPool },
    player2ManaPool: { ...state.player2ManaPool },
  };

  if (next === 1) {
    nextState.player1FieldMonster = clearDefending(nextState.player1FieldMonster);
  } else {
    nextState.player2FieldMonster = clearDefending(nextState.player2FieldMonster);
  }

  // Skip draw on first handoff P1→P2 while still on round 1.
  const isFirstHandoffToPlayer2 = t === 1 && next === 2 && turnCounter === 1;
  if (!isFirstHandoffToPlayer2) {
    if (next === 1 && nextState.player1Deck.length > 0) {
      const [card, ...rest] = nextState.player1Deck;
      nextState.player1Deck = rest;
      nextState.player1Hand = [...nextState.player1Hand, card!];
    } else if (next === 2 && nextState.player2Deck.length > 0) {
      const [card, ...rest] = nextState.player2Deck;
      nextState.player2Deck = rest;
      nextState.player2Hand = [...nextState.player2Hand, card!];
    }
  }

  return nextState;
}

export type PlayCardIntent =
  | {
      cardKind: 'Monster';
      cardId: string;
      handIndex: number;
      fieldSlot: number;
    }
  | {
      cardKind: 'Land';
      cardId: string;
      handIndex: number;
      targetRowSlot: 'player1' | 'player2';
      influencedSpaces: number[];
    };

const MAX_LAND_CAPACITY = 6;
const MONSTER_FIELD_SLOTS = 6;

function landCapacityUsed(
  state: LiveGameState,
  capacityOwner: 'player1' | 'player2',
): number {
  let used = 0;
  const countRow = (
    rowSlot: 'player1' | 'player2',
    lands: LiveFieldCard[],
  ) => {
    for (const entry of lands) {
      const rules = getLiveCardRules(entry.cardId);
      if (!rules || rules.cardType !== 'Land') {
        continue;
      }
      const controller = entry.controllerSlot ?? rowSlot;
      const owner = rules.placeOnOpponentLandRow ? rowSlot : controller;
      if (owner !== capacityOwner) {
        continue;
      }
      used += rules.space ?? 1;
    }
  };
  countRow('player1', state.player1FieldLand);
  countRow('player2', state.player2FieldLand);
  return used;
}

function influencedSpacesOnRow(lands: LiveFieldCard[]): Set<number> {
  const claimed = new Set<number>();
  for (const entry of lands) {
    for (const s of entry.influencedSpaces ?? []) {
      claimed.add(s);
    }
  }
  return claimed;
}

function maxManaFromControlledLands(
  state: LiveGameState,
  controller: 'player1' | 'player2',
): ManaMap {
  const max: ManaMap = {};
  const consider = (rowSlot: 'player1' | 'player2', lands: LiveFieldCard[]) => {
    for (const entry of lands) {
      if ((entry.controllerSlot ?? rowSlot) !== controller) {
        continue;
      }
      const rules = getLiveCardRules(entry.cardId);
      if (!rules?.maxMana) {
        continue;
      }
      // Skip building lands (buildTime > 0 and not finished) — treat newly placed build lands as not generating max yet if buildTime set and same turn.
      const buildTime = rules.buildTime ?? 0;
      const ownerTurn =
        controller === 'player1' ? state.player1TurnCounter : state.player2TurnCounter;
      if (buildTime > 0 && ownerTurn - entry.placedAtOwnerTurnCounter < buildTime) {
        continue;
      }
      for (const [el, amount] of Object.entries(rules.maxMana)) {
        max[el] = (max[el] ?? 0) + amount;
      }
    }
  };
  consider('player1', state.player1FieldLand);
  consider('player2', state.player2FieldLand);
  return max;
}

/**
 * Apply a land/monster play from hand onto LiveGameState.
 * Returns null when the move is illegal.
 */
export function applyPlayCardToLiveGameState(
  state: LiveGameState,
  controllerSlot: 'player1' | 'player2',
  intent: PlayCardIntent,
): LiveGameState | null {
  if (!state.gameStarted) {
    return null;
  }
  const seat: 1 | 2 = controllerSlot === 'player1' ? 1 : 2;
  if (state.currentTurn !== seat) {
    return null;
  }

  const hand = controllerSlot === 'player1' ? state.player1Hand : state.player2Hand;
  if (intent.handIndex < 0 || intent.handIndex >= hand.length) {
    return null;
  }
  if (hand[intent.handIndex] !== intent.cardId) {
    return null;
  }

  const rules = getLiveCardRules(intent.cardId);
  if (!rules) {
    return null;
  }

  const isFree = !hasManaCost(rules.manaCost);
  if (isFree && state.placedFreeFieldCardThisTurn) {
    return null;
  }

  const pool =
    controllerSlot === 'player1' ? state.player1ManaPool : state.player2ManaPool;
  const spent = spendMana(pool, rules.manaCost);
  if (spent === null) {
    return null;
  }

  const next: LiveGameState = {
    ...state,
    version: state.version + 1,
    player1Hand: [...state.player1Hand],
    player2Hand: [...state.player2Hand],
    player1Deck: [...state.player1Deck],
    player2Deck: [...state.player2Deck],
    player1FieldLand: [...state.player1FieldLand],
    player1FieldMonster: [...state.player1FieldMonster],
    player2FieldLand: [...state.player2FieldLand],
    player2FieldMonster: [...state.player2FieldMonster],
    player1ManaPool: { ...state.player1ManaPool },
    player2ManaPool: { ...state.player2ManaPool },
  };

  if (controllerSlot === 'player1') {
    next.player1ManaPool = spent;
    next.player1Hand.splice(intent.handIndex, 1);
  } else {
    next.player2ManaPool = spent;
    next.player2Hand.splice(intent.handIndex, 1);
  }

  const ownerTurn =
    controllerSlot === 'player1' ? state.player1TurnCounter : state.player2TurnCounter;
  const entry: LiveFieldCard = {
    fieldInstanceId: state.nextFieldInstanceId,
    cardId: intent.cardId,
    placedAtTurnCounter: state.turnCounter,
    placedAtOwnerTurnCounter: ownerTurn,
    controllerSlot,
  };
  next.nextFieldInstanceId = state.nextFieldInstanceId + 1;

  if (intent.cardKind === 'Monster') {
    if (rules.cardType !== 'Monster') {
      return null;
    }
    if (intent.fieldSlot < 1 || intent.fieldSlot > MONSTER_FIELD_SLOTS) {
      return null;
    }
    const monsters =
      controllerSlot === 'player1' ? next.player1FieldMonster : next.player2FieldMonster;
    if (monsters.some((m) => m.fieldSlot === intent.fieldSlot)) {
      return null;
    }
    entry.fieldSlot = intent.fieldSlot;
    if (rules.startingBlocks && rules.startingBlocks > 0) {
      entry.blocks = rules.startingBlocks;
    }
    if (intent.cardId === 'king-colossus') {
      const rockCost = rules.manaCost?.['Rock'] ?? 0;
      const rockAfter = spent['Rock'] ?? 0;
      const rockBefore = rockAfter + rockCost;
      const baseHp = rules.maxHealth ?? 300;
      const hp = baseHp + rockBefore * 10;
      entry.currentHealth = hp;
      entry.maxHealthOverride = hp;
    }
    if (controllerSlot === 'player1') {
      next.player1FieldMonster = [...monsters, entry];
    } else {
      next.player2FieldMonster = [...monsters, entry];
    }
  } else {
    if (rules.cardType !== 'Land') {
      return null;
    }
    const space = rules.space ?? 1;
    const capacityOwner = rules.placeOnOpponentLandRow
      ? controllerSlot === 'player1'
        ? 'player2'
        : 'player1'
      : controllerSlot;
    if (space > 0 && landCapacityUsed(state, capacityOwner) + space > MAX_LAND_CAPACITY) {
      return null;
    }

    const expectedRow = rules.placeOnOpponentLandRow
      ? controllerSlot === 'player1'
        ? 'player2'
        : 'player1'
      : controllerSlot;
    if (intent.targetRowSlot !== expectedRow) {
      return null;
    }
    if (!intent.influencedSpaces.length || intent.influencedSpaces.length !== space) {
      return null;
    }

    const rowLands =
      intent.targetRowSlot === 'player1' ? next.player1FieldLand : next.player2FieldLand;
    const claimed = influencedSpacesOnRow(rowLands);
    for (const s of intent.influencedSpaces) {
      if (s < 1 || s > 9 || claimed.has(s)) {
        return null;
      }
    }

    entry.influencedSpaces = [...intent.influencedSpaces].sort((a, b) => a - b);

    if (intent.targetRowSlot === 'player1') {
      next.player1FieldLand = [...rowLands, entry];
    } else {
      next.player2FieldLand = [...rowLands, entry];
    }

    // Immediate mana for lands with no build time.
    if ((rules.buildTime ?? 0) === 0 && rules.generateMana) {
      const max = maxManaFromControlledLands(next, controllerSlot);
      if (controllerSlot === 'player1') {
        next.player1ManaPool = addManaCapped(next.player1ManaPool, rules.generateMana, max);
      } else {
        next.player2ManaPool = addManaCapped(next.player2ManaPool, rules.generateMana, max);
      }
    }
  }

  if (isFree) {
    next.placedFreeFieldCardThisTurn = true;
  }

  return next;
}

type FieldPlayerSlot = 'player1' | 'player2';
type FieldZone = 'monster' | 'land';

function cloneBoard(state: LiveGameState): LiveGameState {
  return {
    ...state,
    version: state.version + 1,
    player1Hand: [...state.player1Hand],
    player2Hand: [...state.player2Hand],
    player1Deck: [...state.player1Deck],
    player2Deck: [...state.player2Deck],
    player1FieldLand: state.player1FieldLand.map((e) => ({ ...e })),
    player1FieldMonster: state.player1FieldMonster.map((e) => ({ ...e })),
    player2FieldLand: state.player2FieldLand.map((e) => ({ ...e })),
    player2FieldMonster: state.player2FieldMonster.map((e) => ({ ...e })),
    player1ManaPool: { ...state.player1ManaPool },
    player2ManaPool: { ...state.player2ManaPool },
  };
}

function monstersOf(state: LiveGameState, slot: FieldPlayerSlot): LiveFieldCard[] {
  return slot === 'player1' ? state.player1FieldMonster : state.player2FieldMonster;
}

function landsOf(state: LiveGameState, slot: FieldPlayerSlot): LiveFieldCard[] {
  return slot === 'player1' ? state.player1FieldLand : state.player2FieldLand;
}

function getMonsterBySlot(
  state: LiveGameState,
  slot: FieldPlayerSlot,
  fieldSlot: number,
): LiveFieldCard | undefined {
  return monstersOf(state, slot).find((m) => m.fieldSlot === fieldSlot);
}

function getFieldEntry(
  state: LiveGameState,
  rowSlot: FieldPlayerSlot,
  zone: FieldZone,
  identifier: number,
): LiveFieldCard | undefined {
  if (zone === 'monster') {
    return getMonsterBySlot(state, rowSlot, identifier);
  }
  return landsOf(state, rowSlot)[identifier];
}

function fieldCardController(entry: LiveFieldCard, rowSlot: FieldPlayerSlot): FieldPlayerSlot {
  return entry.controllerSlot ?? rowSlot;
}

function monsterSummoningSicknessCleared(
  rules: ReturnType<typeof getLiveCardRules>,
  placedAtTurnCounter: number,
  turnCounter: number,
): boolean {
  if (turnCounter > placedAtTurnCounter) {
    return true;
  }
  return turnCounter === placedAtTurnCounter && !!rules?.hasHaste;
}

function canMonsterAct(
  state: LiveGameState,
  ownerSlot: FieldPlayerSlot,
  entry: LiveFieldCard,
): boolean {
  if (!state.gameStarted) {
    return false;
  }
  const ownerId: 1 | 2 = ownerSlot === 'player1' ? 1 : 2;
  if (state.currentTurn !== ownerId) {
    return false;
  }
  const rules = getLiveCardRules(entry.cardId);
  if (!rules || rules.cardType !== 'Monster') {
    return false;
  }
  if (entry.hasActedThisTurn) {
    return false;
  }
  if ((entry.attacksThisTurn ?? 0) > 0) {
    return false;
  }
  return monsterSummoningSicknessCleared(rules, entry.placedAtTurnCounter, state.turnCounter);
}

function canMonsterAttack(
  state: LiveGameState,
  ownerSlot: FieldPlayerSlot,
  entry: LiveFieldCard,
): boolean {
  if (!state.gameStarted) {
    return false;
  }
  const ownerId: 1 | 2 = ownerSlot === 'player1' ? 1 : 2;
  if (state.currentTurn !== ownerId) {
    return false;
  }
  const rules = getLiveCardRules(entry.cardId);
  if (!rules || rules.cardType !== 'Monster') {
    return false;
  }
  if (entry.hasActedThisTurn) {
    return false;
  }
  const multi = Math.max(1, rules.multiAttack ?? 1);
  if ((entry.attacksThisTurn ?? 0) >= multi) {
    return false;
  }
  return monsterSummoningSicknessCleared(rules, entry.placedAtTurnCounter, state.turnCounter);
}

function isLegalAttackTarget(
  state: LiveGameState,
  rowSlot: FieldPlayerSlot,
  defenderZone: FieldZone,
  defenderIdentifier: number,
  attackerSlot: FieldPlayerSlot,
): boolean {
  const defenderEntry = getFieldEntry(state, rowSlot, defenderZone, defenderIdentifier);
  if (!defenderEntry) {
    return false;
  }
  const enemy: FieldPlayerSlot = attackerSlot === 'player1' ? 'player2' : 'player1';
  if (fieldCardController(defenderEntry, rowSlot) !== enemy) {
    return false;
  }
  const enemyMonsters = monstersOf(state, enemy);
  const hasDefendingEnemy = enemyMonsters.some((e) => e.defending === true);

  if (hasDefendingEnemy) {
    if (defenderZone !== 'monster') {
      return false;
    }
    const targetEntry = getMonsterBySlot(state, rowSlot, defenderIdentifier);
    return targetEntry?.defending === true;
  }

  if (defenderZone === 'monster') {
    return rowSlot === enemy && getMonsterBySlot(state, rowSlot, defenderIdentifier) !== undefined;
  }
  return defenderZone === 'land';
}

function applyIncomingFieldDamage(
  entry: LiveFieldCard,
  damage: number,
  rules: ReturnType<typeof getLiveCardRules>,
): LiveFieldCard {
  if (damage <= 0) {
    return entry;
  }
  const blocks = entry.blocks ?? 0;
  if (blocks > 0 && rules?.cardType === 'Monster') {
    return { ...entry, blocks: blocks - 1 };
  }
  const maxHp = entry.maxHealthOverride ?? rules?.maxHealth ?? 0;
  const hp = entry.currentHealth ?? maxHp;
  return { ...entry, currentHealth: Math.max(0, hp - damage) };
}

function setFieldEntry(
  state: LiveGameState,
  rowSlot: FieldPlayerSlot,
  zone: FieldZone,
  identifier: number,
  entry: LiveFieldCard | null,
): void {
  const rules = entry ? getLiveCardRules(entry.cardId) : undefined;
  const maxHp = entry ? (entry.maxHealthOverride ?? rules?.maxHealth ?? 0) : 0;
  const hp = entry ? (entry.currentHealth ?? maxHp) : 0;
  const shouldRemove = !entry || hp <= 0;

  if (zone === 'monster') {
    const arr =
      rowSlot === 'player1' ? state.player1FieldMonster : state.player2FieldMonster;
    const idx = arr.findIndex((e) => e.fieldSlot === identifier);
    if (idx < 0) {
      return;
    }
    if (shouldRemove) {
      arr.splice(idx, 1);
    } else {
      arr[idx] = entry!;
    }
    return;
  }

  const arr = rowSlot === 'player1' ? state.player1FieldLand : state.player2FieldLand;
  if (identifier < 0 || identifier >= arr.length) {
    return;
  }
  if (shouldRemove) {
    arr.splice(identifier, 1);
  } else {
    arr[identifier] = entry!;
  }
}

/**
 * Put a monster into defense for the rest of the opponent's turn.
 */
export function applyDefendToLiveGameState(
  state: LiveGameState,
  controllerSlot: FieldPlayerSlot,
  monsterFieldSlot: number,
): LiveGameState | null {
  if (!state.gameStarted) {
    return null;
  }
  const seat: 1 | 2 = controllerSlot === 'player1' ? 1 : 2;
  if (state.currentTurn !== seat) {
    return null;
  }

  const entry = getMonsterBySlot(state, controllerSlot, monsterFieldSlot);
  if (!entry || !canMonsterAct(state, controllerSlot, entry)) {
    return null;
  }

  const next = cloneBoard(state);
  const monsters = monstersOf(next, controllerSlot);
  const idx = monsters.findIndex((m) => m.fieldSlot === monsterFieldSlot);
  if (idx < 0) {
    return null;
  }
  monsters[idx] = {
    ...monsters[idx]!,
    defending: true,
    hasActedThisTurn: true,
  };
  return next;
}

export type AttackIntent =
  | {
      kind: 'field';
      attackerFieldSlot: number;
      defenderRowSlot: FieldPlayerSlot;
      defenderZone: FieldZone;
      defenderIdentifier: number;
    }
  | {
      kind: 'life';
      attackerFieldSlot: number;
      defenderPlayerSlot: FieldPlayerSlot;
    };

/**
 * Resolve one attack (field target or direct LP). Mirrors GameEngine combat.
 */
export function applyAttackToLiveGameState(
  state: LiveGameState,
  controllerSlot: FieldPlayerSlot,
  intent: AttackIntent,
): LiveGameState | null {
  if (!state.gameStarted) {
    return null;
  }
  const seat: 1 | 2 = controllerSlot === 'player1' ? 1 : 2;
  if (state.currentTurn !== seat) {
    return null;
  }

  const attackerEntry = getMonsterBySlot(state, controllerSlot, intent.attackerFieldSlot);
  if (!attackerEntry || !canMonsterAttack(state, controllerSlot, attackerEntry)) {
    return null;
  }

  const atkRules = getLiveCardRules(attackerEntry.cardId);
  if (!atkRules || atkRules.cardType !== 'Monster') {
    return null;
  }

  const next = cloneBoard(state);
  const liveAttacker = getMonsterBySlot(next, controllerSlot, intent.attackerFieldSlot);
  if (!liveAttacker) {
    return null;
  }

  if (intent.kind === 'life') {
    const enemy: FieldPlayerSlot = controllerSlot === 'player1' ? 'player2' : 'player1';
    if (intent.defenderPlayerSlot !== enemy) {
      return null;
    }
    if (monstersOf(next, enemy).some((e) => e.defending === true)) {
      return null;
    }

    const atkPower = atkRules.attack ?? 0;
    if (atkPower <= 0) {
      return null;
    }

    if (enemy === 'player1') {
      next.player1LifePoints = Math.max(0, next.player1LifePoints - atkPower);
    } else {
      next.player2LifePoints = Math.max(0, next.player2LifePoints - atkPower);
    }

    const attacksThisTurn = (liveAttacker.attacksThisTurn ?? 0) + 1;
    const multi = Math.max(1, atkRules.multiAttack ?? 1);
    setFieldEntry(next, controllerSlot, 'monster', intent.attackerFieldSlot, {
      ...liveAttacker,
      attacksThisTurn,
      hasActedThisTurn: attacksThisTurn >= multi ? true : liveAttacker.hasActedThisTurn,
    });
    return next;
  }

  if (
    !isLegalAttackTarget(
      next,
      intent.defenderRowSlot,
      intent.defenderZone,
      intent.defenderIdentifier,
      controllerSlot,
    )
  ) {
    return null;
  }

  const defenderEntry = getFieldEntry(
    next,
    intent.defenderRowSlot,
    intent.defenderZone,
    intent.defenderIdentifier,
  );
  if (!defenderEntry) {
    return null;
  }

  const defRules = getLiveCardRules(defenderEntry.cardId);
  if (!defRules) {
    return null;
  }

  const atkPower = atkRules.attack ?? 0;
  const counterPower = defRules.attack ?? 0;

  const attackerAfter = applyIncomingFieldDamage(liveAttacker, counterPower, atkRules);
  const defenderAfter = applyIncomingFieldDamage(defenderEntry, atkPower, defRules);

  const attacksThisTurn = (liveAttacker.attacksThisTurn ?? 0) + 1;
  const multi = Math.max(1, atkRules.multiAttack ?? 1);
  const attacksExhausted = attacksThisTurn >= multi;

  setFieldEntry(next, controllerSlot, 'monster', intent.attackerFieldSlot, {
    ...attackerAfter,
    attacksThisTurn,
    hasActedThisTurn: attacksExhausted ? true : attackerAfter.hasActedThisTurn,
  });
  setFieldEntry(next, intent.defenderRowSlot, intent.defenderZone, intent.defenderIdentifier, {
    ...defenderAfter,
    hasActedThisTurn: true,
  });

  return next;
}

