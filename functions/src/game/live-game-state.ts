/** Serializable live-match board (Cloud Functions copy). */

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
  return cards.map((e) => ({
    ...e,
    hasActedThisTurn: false,
    attacksThisTurn: undefined,
  }));
}

function clearDefending(cards: LiveFieldCard[]): LiveFieldCard[] {
  return cards.map((e) => ({
    ...e,
    defending: false,
    spellImmune: false,
  }));
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
