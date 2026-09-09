/** Serializable live-match board (shared by Angular + Cloud Functions). */

export type LiveManaMap = Record<string, number>;

export interface LiveFieldCard {
  fieldInstanceId: number;
  cardId: string;
  placedAtTurnCounter: number;
  placedAtOwnerTurnCounter: number;
  controllerSlot?: 'player1' | 'player2';
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

/** Keep in sync with `DECK_CARD_POOL` in card-catalog.ts */
export const LIVE_DECK_CARD_POOL: readonly string[] = [
  'rock-monster',
  'mighty-gopher',
  'boulder-toss',
  'mud-hut',
  'mountain-range',
  'temple-of-being',
  'armoredillo',
  'ruptar',
  'mighty-gopher',
  'elder-gopher-statue',
  'rockterrior',
  'rock-slide',
  'excavation-site',
  'earth-shatter',
  '1000-mile-wall',
  'king-colossus',
];
